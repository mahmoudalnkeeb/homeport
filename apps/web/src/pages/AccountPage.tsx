import type { Permission } from '@homeport/contracts';
import { Avatar, Badge, Button, Card, Grid, Icon, PageHeader, ThemeControl, toast, type IconName } from '@homeport/ui';

import { useAuth } from '../auth';
import { useInstall } from '../install';
import { PasswordForm } from './auth/PasswordForm';

const ABILITIES: { permission: Permission; icon: IconName; text: string }[] = [
  { permission: 'files:read', icon: 'library', text: 'Browse, stream and download the shared library' },
  { permission: 'files:write', icon: 'folder', text: 'Upload, organize and write notes in your own space' },
  { permission: 'users:manage', icon: 'users', text: 'Create accounts, change roles and reset passwords' },
  { permission: 'system:read', icon: 'cpu', text: "Monitor the host's CPU, memory, disk and network" },
  { permission: 'activity:read', icon: 'activity', text: "See everyone's activity and usage" },
];

function InstallCard() {
  const state = useInstall();
  return (
    <Card span={6} title="Install app" icon="smartphone">
      {state.kind === 'installed' && (
        <p class="muted">
          <Icon name="check" /> Homeport is installed on this device.
        </p>
      )}
      {state.kind === 'ready' && (
        <>
          <p class="muted">Add Homeport to your home screen or desktop. It opens in its own window, like any other app.</p>
          <div>
            <Button
              icon="download"
              onClick={() => void state.install().then((accepted) => accepted && toast('Homeport installed'))}
            >
              Install Homeport
            </Button>
          </div>
        </>
      )}
      {state.kind === 'ios' && (
        <p class="muted">
          In Safari, tap Share <Icon name="share" /> and choose <strong>Add to Home Screen</strong>.
        </p>
      )}
      {state.kind === 'insecure' && (
        <p class="muted">
          Installing needs a secure connection. Open Homeport over HTTPS, for example through Tailscale or a reverse proxy, then come back here.
        </p>
      )}
      {state.kind === 'manual' && (
        <p class="muted">
          Open your browser's menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      )}
    </Card>
  );
}

export default function AccountPage() {
  const { me, can, update, signOut } = useAuth();

  return (
    <>
      <PageHeader title="Account" description="Your profile, password and preferences." />
      <Grid>
        <Card span={6} title="Profile" icon="user">
          <div class="cluster" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
            <Avatar name={me.displayName} size="lg" />
            <div class="row-main">
              <strong style={{ fontSize: 'var(--text-md)' }}>{me.displayName}</strong>
              <span class="muted mono">@{me.username}</span>
            </div>
            <span class="spacer" />
            <Badge tone={me.role === 'admin' ? 'accent' : undefined}>{me.role === 'admin' ? 'Admin' : 'Member'}</Badge>
          </div>
          <div>
            <div class="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
              What you can do
            </div>
            <ul class="rows">
              {ABILITIES.map((ability) => {
                const allowed = can(ability.permission);
                return (
                  <li key={ability.permission} class="row" style={allowed ? undefined : { opacity: 0.55 }}>
                    <span class="row-icon">
                      <Icon name={allowed ? ability.icon : 'lock'} />
                    </span>
                    <span class="row-main">
                      <span>{ability.text}</span>
                      {!allowed && <span class="row-meta">Admins only</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>

        <Card span={6} title="Password" icon="key">
          <PasswordForm
            onChanged={(next) => {
              update(next);
              toast('Password changed. Other devices were signed out.');
            }}
          />
        </Card>

        <Card span={6} title="Appearance" icon="sun">
          <p class="muted">Follow your device, or always use light or dark.</p>
          <ThemeControl />
        </Card>

        <InstallCard />

        <Card span={6} title="Session" icon="logout">
          <p class="muted">Sign out of Homeport on this device.</p>
          <div>
            <Button icon="logout" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </Card>
      </Grid>
    </>
  );
}
