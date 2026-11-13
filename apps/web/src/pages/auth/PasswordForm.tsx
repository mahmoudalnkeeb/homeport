import type { Me } from '@homelab/contracts';
import { Button, Field, Input, Notice } from '@homelab/ui';
import { useState } from 'preact/hooks';

import { api } from '../../api';

const MIN_LENGTH = 8;

export function PasswordForm({ onChanged, submitLabel = 'Change password' }: { onChanged: (me: Me) => void; submitLabel?: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const problem =
    next && next.length < MIN_LENGTH
      ? `Use at least ${MIN_LENGTH} characters`
      : confirmation && next !== confirmation
        ? 'The new passwords do not match'
        : undefined;

  const submit = async (event: Event) => {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    setError(undefined);
    try {
      const me = await api.auth.changePassword({ current, next });
      setCurrent('');
      setNext('');
      setConfirmation('');
      onChanged(me);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="stack" onSubmit={submit}>
      {error && <Notice tone="warning" title={error} />}
      <Field label="Current password">
        <Input type="password" value={current} onValue={setCurrent} autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint={`At least ${MIN_LENGTH} characters. Other devices will be signed out.`}>
        <Input type="password" value={next} onValue={setNext} autoComplete="new-password" required />
      </Field>
      <Field label="Repeat new password" {...(problem ? { hint: problem } : {})}>
        <Input type="password" value={confirmation} onValue={setConfirmation} autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" disabled={busy || !current || !next || next !== confirmation || Boolean(problem)}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
