import { USERNAME_PATTERN, type Role, type UserInfo } from '@homelab/contracts';
import {
  ActionSheet,
  Badge,
  Button,
  Card,
  Cluster,
  copyText,
  Dialog,
  EmptyState,
  Field,
  formatBytes,
  IconButton,
  Input,
  Notice,
  PageHeader,
  Row,
  Rows,
  Segmented,
  Stat,
  confirm,
  prompt,
  timeAgo,
  toast,
  type SheetAction,
} from '@homelab/ui';
import { useLocation } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';

import { api } from '../api';
import { useAuth } from '../auth';
import { useResource } from '../hooks';
import './users.css';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

const usernameFrom = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);

interface Credentials {
  username: string;
  password: string;
  reason: 'created' | 'reset';
}

function CredentialsDialog({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const text = credentials ? `Username: ${credentials.username}\nTemporary password: ${credentials.password}` : '';
  return (
    <Dialog
      open={credentials !== null}
      onClose={onClose}
      title={credentials?.reason === 'created' ? 'Account created' : 'Password reset'}
      icon="key"
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
          <Button variant="primary" icon="copy" onClick={() => void copyText(text, 'Sign-in details copied')}>
            Copy details
          </Button>
        </>
      }
    >
      <p class="muted">Share these with the person. They'll choose their own password when they first sign in. This is the only time the password is shown.</p>
      <div class="credentials mono">
        <span>Username</span>
        <strong>{credentials?.username}</strong>
        <span>Temporary password</span>
        <strong>{credentials?.password}</strong>
      </div>
    </Dialog>
  );
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (credentials: Credentials) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDisplayName('');
    setUsername('');
    setUsernameTouched(false);
    setRole('member');
    setError(undefined);
  }, [open]);

  const effectiveUsername = usernameTouched ? username : usernameFrom(displayName);
  const usernameValid = USERNAME_PATTERN.test(effectiveUsername);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const password = temporaryPassword();
    try {
      await api.users.create({ username: effectiveUsername, displayName: displayName.trim(), role, password });
      onCreated({ username: effectiveUsername, password, reason: 'created' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add user"
      icon="users"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-user" disabled={busy || !displayName.trim() || !usernameValid}>
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </>
      }
    >
      <form id="create-user" class="stack" onSubmit={submit}>
        {error && <Notice tone="warning" title={error} />}
        <Field label="Name">
          <Input value={displayName} onValue={setDisplayName} placeholder="e.g. Sara Ali" autoFocus required />
        </Field>
        <Field
          label="Username"
          hint={effectiveUsername && !usernameValid ? '2–32 lowercase letters, digits, dot, dash or underscore' : 'Used to sign in and as the name of their folder.'}
        >
          <Input
            value={effectiveUsername}
            onValue={(value) => {
              setUsernameTouched(true);
              setUsername(value.toLowerCase());
            }}
            autoComplete="off"
            required
          />
        </Field>
        <div class="field">
          <span class="field-label">Role</span>
          <Segmented label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
          <span class="field-hint">
            {role === 'admin'
              ? 'Full control: host monitoring, every file, and user management.'
              : 'Reads the shared library and owns a private space for uploads and notes.'}
          </span>
        </div>
        <p class="faint" style={{ fontSize: 'var(--text-xs)' }}>
          A temporary password is generated for you to share; they'll replace it at first sign-in.
        </p>
      </form>
    </Dialog>
  );
}

function DeleteUserDialog({ user, onClose, onDeleted }: { user: UserInfo | null; onClose: () => void; onDeleted: () => void }) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDeleteFiles(false), [user]);

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await api.users.remove(user.username, deleteFiles);
      toast(`Deleted ${user.displayName}`);
      onDeleted();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete the account', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title={`Delete ${user?.displayName ?? ''}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            Delete account
          </Button>
        </>
      }
    >
      <p class="muted">They'll be signed out everywhere and can no longer sign in. This can't be undone.</p>
      <label class="checkbox">
        <input type="checkbox" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.currentTarget.checked)} />
        <span>
          Also delete their files
          <small>{user ? `${formatBytes(user.storageBytes)} in users/${user.username}` : ''}. Otherwise the folder stays for you to review.</small>
        </span>
      </label>
    </Dialog>
  );
}

function statusOf(user: UserInfo) {
  if (user.disabled) return <Badge>Disabled</Badge>;
  if (user.mustChangePassword) return <Badge>Password pending</Badge>;
  return null;
}

export default function UsersPage() {
  const { me } = useAuth();
  const { query, route } = useLocation();
  const users = useResource(api.users.all);
  const stats = useResource(api.users.stats);
  const [creating, setCreating] = useState(query.new === '1');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [menuFor, setMenuFor] = useState<UserInfo | null>(null);
  const [deleting, setDeleting] = useState<UserInfo | null>(null);

  const list = users.data ?? [];
  const reload = () => {
    void users.reload();
    void stats.reload();
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast(success);
      reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Something went wrong', 'error');
    }
  };

  const actionsFor = (user: UserInfo): SheetAction[] => {
    const self = user.username === me.username;
    const actions: SheetAction[] = [
      {
        label: 'Rename',
        icon: 'pencil',
        onSelect: async () => {
          const displayName = await prompt({ title: 'Rename', label: 'Name', value: user.displayName });
          if (displayName && displayName !== user.displayName) await run(() => api.users.update(user.username, { displayName }), 'Name updated');
        },
      },
    ];
    if (!self) {
      actions.push(
        user.role === 'member'
          ? {
              label: 'Make admin',
              icon: 'shield',
              onSelect: async () => {
                const ok = await confirm({
                  title: `Make ${user.displayName} an admin?`,
                  message: 'Admins can see the host, every file, and manage all accounts.',
                  confirmLabel: 'Make admin',
                  danger: false,
                });
                if (ok) await run(() => api.users.update(user.username, { role: 'admin' }), `${user.displayName} is now an admin`);
              },
            }
          : {
              label: 'Make member',
              icon: 'user',
              onSelect: () => void run(() => api.users.update(user.username, { role: 'member' }), `${user.displayName} is now a member`),
            },
        {
          label: 'Reset password',
          icon: 'key',
          onSelect: async () => {
            const ok = await confirm({
              title: `Reset ${user.displayName}'s password?`,
              message: "They'll be signed out and get a temporary password to replace at next sign-in.",
              confirmLabel: 'Reset password',
              danger: false,
            });
            if (!ok) return;
            const password = temporaryPassword();
            try {
              await api.users.resetPassword(user.username, password);
              setCredentials({ username: user.username, password, reason: 'reset' });
              reload();
            } catch (error) {
              toast(error instanceof Error ? error.message : 'Could not reset the password', 'error');
            }
          },
        },
        user.disabled
          ? { label: 'Enable account', icon: 'check', onSelect: () => void run(() => api.users.update(user.username, { disabled: false }), 'Account enabled') }
          : {
              label: 'Disable account',
              icon: 'ban',
              tone: 'danger',
              onSelect: async () => {
                const ok = await confirm({
                  title: `Disable ${user.displayName}?`,
                  message: "They'll be signed out and can't sign in until you enable the account again. Their files stay.",
                  confirmLabel: 'Disable',
                });
                if (ok) await run(() => api.users.update(user.username, { disabled: true }), 'Account disabled');
              },
            },
        { label: 'Delete account', icon: 'trash', tone: 'danger', onSelect: () => setDeleting(user) }
      );
    }
    return actions;
  };

  const closeCreate = () => {
    setCreating(false);
    if (query.new) route('/users', true);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, and what they can do."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      <Card>
        <Cluster gap={8}>
          <Stat value={stats.data?.accounts ?? 0} label="Accounts" />
          <Stat value={stats.data?.admins ?? 0} label="Admins" />
          <Stat value={stats.data?.activeSessions ?? 0} label="Active sessions" />
          <Stat value={formatBytes(stats.data?.storageBytes ?? 0)} label="In personal spaces" />
        </Cluster>
      </Card>

      <div class="section">
        <Card>
          {!users.data ? (
            <div class="skeleton" style={{ height: '120px' }} />
          ) : list.length ? (
            <Rows class="user-list">
              {list.map((user) => (
                <Row
                  key={user.username}
                  icon={user.role === 'admin' ? 'shield' : 'user'}
                  title={
                    <>
                      {user.displayName}
                      {user.username === me.username && <span class="faint"> (you)</span>}
                    </>
                  }
                  meta={`@${user.username} · ${user.role === 'admin' ? 'Admin' : 'Member'} · ${formatBytes(user.storageBytes)} · ${
                    user.lastLoginAt ? `signed in ${timeAgo(user.lastLoginAt)}` : 'never signed in'
                  }`}
                  end={
                    <span class="cluster" style={{ flexWrap: 'nowrap' }}>
                      {statusOf(user)}
                      <IconButton icon="more" label={`Actions for ${user.displayName}`} onClick={() => setMenuFor(user)} />
                    </span>
                  }
                />
              ))}
            </Rows>
          ) : (
            <EmptyState icon="users" title="No users" />
          )}
        </Card>
      </div>

      <ActionSheet open={menuFor !== null} title={menuFor?.displayName ?? ''} actions={menuFor ? actionsFor(menuFor) : []} onClose={() => setMenuFor(null)} />
      <CreateUserDialog
        open={creating}
        onClose={closeCreate}
        onCreated={(created) => {
          closeCreate();
          setCredentials(created);
          reload();
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      <DeleteUserDialog
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          reload();
        }}
      />
    </>
  );
}
