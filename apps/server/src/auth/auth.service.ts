import { BadRequestException, HttpStatus, Injectable, Logger, UnauthorizedException, type OnApplicationBootstrap } from '@nestjs/common';
import { homeOf, ROLE_PERMISSIONS, type Me } from '@homelab/contracts';

import { AppError } from '../common/http/app-error.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { generatePassword, hashPassword, verifyPassword } from '../users/password.js';
import type { User } from '../users/users.schema.js';
import { UsersService } from '../users/users.service.js';

const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_FAILED_LOGINS = 5;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private readonly failures = new Map<string, { count: number; since: number }>();
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.dummyHash = await hashPassword(generatePassword());
    await this.sessions.pruneExpired();
  }

  toMe(user: User): Me {
    return {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: [...ROLE_PERMISSIONS[user.role]],
      home: homeOf(user.username),
      mustChangePassword: user.mustChangePassword,
    };
  }

  private assertNotThrottled(key: string): void {
    const entry = this.failures.get(key);
    if (!entry) return;
    if (Date.now() - entry.since > LOGIN_WINDOW_MS) {
      this.failures.delete(key);
      return;
    }
    if (entry.count >= MAX_FAILED_LOGINS) {
      const minutes = Math.ceil((entry.since + LOGIN_WINDOW_MS - Date.now()) / 60_000);
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS', `Too many failed sign-ins. Try again in ${minutes} min.`);
    }
  }

  private recordFailure(key: string): void {
    const entry = this.failures.get(key);
    if (entry && Date.now() - entry.since <= LOGIN_WINDOW_MS) entry.count++;
    else this.failures.set(key, { count: 1, since: Date.now() });
  }

  async login(username: string, password: string, ip: string): Promise<{ token: string; user: User }> {
    const key = `${ip}|${username}`;
    this.assertNotThrottled(key);
    const user = await this.users.findByUsername(username);
    const valid = await verifyPassword(password, user?.passwordHash ?? this.dummyHash);
    if (!user || !valid || user.disabled) {
      this.recordFailure(key);
      this.logger.warn({ event: 'auth.login.failed', username, ip, reason: !user || !valid ? 'credentials' : 'disabled' });
      throw new UnauthorizedException(user?.disabled && valid ? 'This account is disabled' : 'Wrong username or password');
    }
    this.failures.delete(key);
    const token = await this.sessions.create(user.id);
    await this.users.markSignedIn(user.id);
    this.logger.log({ event: 'auth.login', username: user.username, ip });
    return { token, user };
  }

  async sessionUser(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const session = await this.sessions.find(token);
    if (!session) return null;
    const user = await this.users.findById(session.userId);
    return user && !user.disabled ? user : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revoke(token);
  }

  async changePassword(user: User, current: string, next: string, token: string | undefined): Promise<User> {
    if (!(await verifyPassword(current, user.passwordHash))) throw new BadRequestException('Current password is wrong');
    if (current === next) throw new BadRequestException('Choose a password different from the current one');
    const updated = await this.users.setOwnPassword(user.id, next);
    await this.sessions.revokeAllFor(user.id, token);
    return updated;
  }
}
