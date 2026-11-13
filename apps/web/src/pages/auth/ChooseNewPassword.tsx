import type { Me } from '@homeport/contracts';
import { AuthLayout, Button } from '@homeport/ui';

import { PasswordForm } from './PasswordForm';

export function ChooseNewPassword({ me, onChanged, onSignOut }: { me: Me; onChanged: (me: Me) => void; onSignOut: () => void }) {
  return (
    <AuthLayout brand="homeport">
      <div>
        <h1>Choose a new password</h1>
        <p class="muted">
          Hi {me.displayName}, you're signed in with a temporary password. Pick your own to continue.
        </p>
      </div>
      <PasswordForm onChanged={onChanged} submitLabel="Save and continue" />
      <Button variant="ghost" icon="logout" onClick={onSignOut}>
        Sign out
      </Button>
    </AuthLayout>
  );
}
