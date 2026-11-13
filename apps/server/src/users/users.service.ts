import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { UserStats } from '@homeport/contracts';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';

import { ActivityService } from '../activity/activity.service.js';
import { Paginated, pageWindow } from '../common/http/pagination.js';
import { ENV, type Environment } from '../config/env.js';
import { InjectDb, type Database } from '../database/database.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { FilesService } from '../tools/files/files.service.js';
import { generatePassword, hashPassword } from './password.js';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto.js';
import { users, type Actor, type User } from './users.schema.js';

export type UserView = User & { storageBytes: number };

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Environment,
    private readonly sessions: SessionsService,
    private readonly files: FilesService,
    private readonly activity: ActivityService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const [existing] = await this.db.select({ value: count() }).from(users);
    if (!existing?.value) await this.bootstrapAdmin();
  }

  private async bootstrapAdmin(): Promise<void> {
    const provided = this.env.ADMIN_PASSWORD;
    const password = provided ?? generatePassword();
    await this.insert({ username: 'admin', displayName: 'Administrator', role: 'admin', password }, !provided);
    if (provided) {
      this.logger.log({ event: 'auth.bootstrap', username: 'admin', passwordSource: 'ADMIN_PASSWORD' });
      return;
    }
    const file = join(this.env.STATE_DIR, 'initial-admin-password.txt');
    await mkdir(this.env.STATE_DIR, { recursive: true });
    await writeFile(
      file,
      `username: admin\npassword: ${password}\n\nYou will be asked to choose a new password on first sign-in.\nDelete this file afterwards.\n`,
      { mode: 0o600 }
    );
    this.logger.warn({ event: 'auth.bootstrap', username: 'admin', passwordFile: file });
  }

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.username, username));
    return user ?? null;
  }

  private async require(username: string): Promise<User> {
    const user = await this.findByUsername(username);
    if (!user) throw new NotFoundException(`No user named ${username}`);
    return user;
  }

  async markSignedIn(id: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  async setOwnPassword(id: string, password: string): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), mustChangePassword: false })
      .where(eq(users.id, id))
      .returning();
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<UserView>> {
    const { offset, ...window } = pageWindow(query);
    const [rows, [total], bytes] = await Promise.all([
      this.db
        .select()
        .from(users)
        .orderBy(sql`${users.role} = 'admin' desc`, asc(users.username))
        .limit(window.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(users),
      this.files.homeBytes(),
    ]);
    return Paginated.of(
      rows.map((user) => ({ ...user, storageBytes: bytes.get(user.username) ?? 0 })),
      window,
      total?.value ?? 0
    );
  }

  async stats(): Promise<UserStats> {
    const [rows, activeSessions, bytes] = await Promise.all([
      this.db.select({ role: users.role, disabled: users.disabled }).from(users),
      this.sessions.countActive(),
      this.files.homeBytes(),
    ]);
    return {
      accounts: rows.length,
      admins: rows.filter((row) => row.role === 'admin').length,
      disabled: rows.filter((row) => row.disabled).length,
      activeSessions,
      storageBytes: [...bytes.values()].reduce((sum, value) => sum + value, 0),
    };
  }

  private async insert(input: CreateUserDto, mustChangePassword: boolean): Promise<User> {
    if (await this.findByUsername(input.username)) throw new ConflictException(`${input.username} already exists`);
    const [user] = await this.db
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        passwordHash: await hashPassword(input.password),
        mustChangePassword,
      })
      .returning();
    if (!user) throw new Error('Insert returned no row');
    await this.files.ensureHome(user.username);
    return user;
  }

  async create(actor: Actor, input: CreateUserDto): Promise<UserView> {
    const user = await this.insert(input, true);
    await this.activity.record('users', 'create', `${user.username} (${user.role})`, actor.username);
    return { ...user, storageBytes: 0 };
  }

  private async otherActiveAdmins(excludeId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.disabled, false), ne(users.id, excludeId)));
    return row?.value ?? 0;
  }

  private async assertKeepsAnAdmin(target: User, losesAdmin: boolean): Promise<void> {
    if (losesAdmin && target.role === 'admin' && !target.disabled && (await this.otherActiveAdmins(target.id)) === 0) {
      throw new BadRequestException('There must be at least one active admin');
    }
  }

  async update(actor: Actor, username: string, changes: UpdateUserDto): Promise<UserView> {
    if (changes.displayName === undefined && changes.role === undefined && changes.disabled === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    const target = await this.require(username);
    const demotesOrDisables = changes.role === 'member' || changes.disabled === true;
    if (target.id === actor.id && demotesOrDisables) throw new BadRequestException('You cannot disable or demote yourself');
    await this.assertKeepsAnAdmin(target, demotesOrDisables);

    const [user] = await this.db.update(users).set(changes).where(eq(users.id, target.id)).returning();
    if (!user) throw new NotFoundException(`No user named ${username}`);
    if (user.disabled) await this.sessions.revokeAllFor(user.id);

    const summary = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    await this.activity.record('users', 'update', `${user.username}: ${summary}`, actor.username);
    return { ...user, storageBytes: (await this.files.homeBytes()).get(user.username) ?? 0 };
  }

  async resetPassword(actor: Actor, username: string, password: string): Promise<void> {
    const target = await this.require(username);
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
      .where(eq(users.id, target.id));
    await this.sessions.revokeAllFor(target.id);
    await this.activity.record('users', 'reset password', username, actor.username);
  }

  async remove(actor: Actor, username: string, deleteFiles: boolean): Promise<void> {
    const target = await this.require(username);
    if (target.id === actor.id) throw new BadRequestException('You cannot delete your own account');
    await this.assertKeepsAnAdmin(target, true);
    await this.db.delete(users).where(eq(users.id, target.id));
    if (deleteFiles) await this.files.removeHome(username);
    await this.activity.record('users', 'delete', `${username}${deleteFiles ? ' and their files' : ''}`, actor.username);
  }
}
