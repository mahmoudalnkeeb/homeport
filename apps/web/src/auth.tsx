import { hasPermission, pathAccess, type Me, type Permission } from '@homelab/contracts';
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';

import { api, SESSION_EXPIRED } from './api';

interface AuthContextValue {
  me: Me;
  can: (permission: Permission) => boolean;
  canWrite: (path: string) => boolean;
  update: (me: Me) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside a signed-in AuthProvider');
  return value;
}

export type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; me: Me };

export function useAuthState() {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    api.auth
      .me()
      .then((me) => setState({ status: 'signed-in', me }))
      .catch(() => setState({ status: 'signed-out' }));
    const expired = () => setState({ status: 'signed-out' });
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);

  const signIn = useCallback((me: Me) => setState({ status: 'signed-in', me }), []);
  const signOut = useCallback(() => {
    history.replaceState(null, '', '/');
    setState({ status: 'signed-out' });
  }, []);
  return { state, signIn, signOut };
}

export function AuthProvider({
  me,
  onChange,
  onSignOut,
  children,
}: {
  me: Me;
  onChange: (me: Me) => void;
  onSignOut: () => void;
  children: ComponentChildren;
}) {
  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      can: (permission) => hasPermission(me.role, permission),
      canWrite: (path) => pathAccess(me, path) === 'write',
      update: onChange,
      signOut: async () => {
        await api.auth.logout().catch(() => undefined);
        onSignOut();
      },
    }),
    [me, onChange, onSignOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
