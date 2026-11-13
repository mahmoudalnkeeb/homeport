import type { Me } from '@homelab/contracts';
import { AuthLayout, Button, Field, Input, Notice } from '@homelab/ui';
import { useState } from 'preact/hooks';

import { api } from '../../api';

export function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onSignedIn(await api.auth.login({ username, password }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout brand="homelab">
      <div>
        <h1>Sign in</h1>
        <p class="muted">Use the account your homelab admin created for you.</p>
      </div>
      {error && <Notice tone="warning" title={error} />}
      <form onSubmit={submit}>
        <Field label="Username">
          <Input value={username} onValue={setUsername} name="username" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onValue={setPassword} name="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p class="faint" style={{ fontSize: 'var(--text-xs)' }}>
        First start? The admin password is in <code>state/initial-admin-password.txt</code> on the server.
      </p>
    </AuthLayout>
  );
}
