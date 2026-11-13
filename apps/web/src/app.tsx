import type { Permission, ToolInfo } from '@homeport/contracts';
import { AppShell, AuthLayout, EmptyState, LinkButton, Skeleton, type NavGroup, type NavItem } from '@homeport/ui';
import { createContext, type ComponentType } from 'preact';
import { ErrorBoundary, lazy, LocationProvider, Route, Router, useLocation, useRoute } from 'preact-iso';
import { useCallback, useContext, useEffect, useMemo } from 'preact/hooks';

import { api } from './api';
import { AuthProvider, useAuth, useAuthState } from './auth';
import { useResource } from './hooks';
import { PlayerProvider } from './media';
import { ChooseNewPassword } from './pages/auth/ChooseNewPassword';
import { SignIn } from './pages/auth/SignIn';
import { CLIENT_TOOLS } from './tools/registry';

const ControlCenter = lazy(() => import('./pages/ControlCenter'));
const MemberHome = lazy(() => import('./pages/MemberHome'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const DesignSystem = lazy(() => import('./pages/DesignSystem'));
const NO_TOOLS: ToolInfo[] = [];

export const ToolsContext = createContext<ToolInfo[]>([]);
export const useTools = () => useContext(ToolsContext);

const ROLE_LABEL = { admin: 'Admin', member: 'Member' } as const;

function ToolRoute() {
  const { params } = useRoute();
  const tool = CLIENT_TOOLS[params.id ?? ''];
  const allowed = useTools().some((candidate) => candidate.id === params.id);
  if (!tool || !allowed) return <NotFound />;
  const Page = tool.page;
  return <Page />;
}

function NotFound() {
  return (
    <EmptyState icon="search" title="Page not found">
      <span>It may have moved, or you may not have access to it.</span>
      <LinkButton href="/" icon="home">
        Back home
      </LinkButton>
    </EmptyState>
  );
}

function Home() {
  const { can } = useAuth();
  return can('system:read') ? <ControlCenter /> : <MemberHome />;
}

function Restricted({ permission, page: Page }: { permission: Permission; page: ComponentType }) {
  return useAuth().can(permission) ? <Page /> : <NotFound />;
}

const AdminUsers = () => <Restricted permission="users:manage" page={UsersPage} />;
const InternalDesignSystem = () => <Restricted permission="design:read" page={DesignSystem} />;

function activeIdOf(path: string): string | null {
  if (path === '/') return 'home';
  const tool = /^\/tools\/([^/]+)/.exec(path)?.[1];
  if (tool) return tool;
  if (path.startsWith('/users')) return 'users';
  if (path.startsWith('/account')) return 'account';
  return null;
}

function Shell() {
  const { path } = useLocation();
  const { me, can, signOut } = useAuth();
  const { data: serverTools = NO_TOOLS } = useResource(api.tools, { key: me.username });
  const tools = useMemo(() => serverTools.filter((tool) => CLIENT_TOOLS[tool.id]), [serverTools]);

  useEffect(() => {
    void api.pageView({ path }).catch(() => undefined);
  }, [path]);

  const isAdmin = can('system:read');
  const home: NavItem = { id: 'home', label: isAdmin ? 'Control center' : 'Home', href: '/', icon: 'home' };
  const toolItems: NavItem[] = tools.map((tool) => ({ id: tool.id, label: tool.name, href: tool.href, icon: tool.icon }));
  const usersItem: NavItem = { id: 'users', label: 'Users', href: '/users', icon: 'users' };

  const nav: NavGroup[] = [
    { items: [home] },
    { label: 'Tools', items: toolItems },
    ...(can('users:manage') ? [{ label: 'Admin', items: [usersItem] }] : []),
  ];
  const tabs: NavItem[] = [
    { ...home, label: 'Home' },
    ...toolItems,
    ...(can('users:manage') ? [usersItem] : []),
    { id: 'account', label: 'Account', href: '/account', icon: 'user' },
  ];

  const activeId = activeIdOf(path);
  return (
    <ToolsContext.Provider value={tools}>
      <PlayerProvider>
        <AppShell
          brand="homeport"
          nav={nav}
          tabs={tabs}
          activeId={activeId}
          user={{ name: me.displayName, detail: ROLE_LABEL[me.role], href: '/account' }}
          onSignOut={signOut}
          flush={Boolean(activeId && CLIENT_TOOLS[activeId]?.flush)}
        >
          <ErrorBoundary>
            <Router>
              <Route path="/" component={Home} />
              <Route path="/tools/:id" component={ToolRoute} />
              <Route path="/users" component={AdminUsers} />
              <Route path="/account" component={AccountPage} />
              <Route path="/ds" component={InternalDesignSystem} />
              <Route default component={NotFound} />
            </Router>
          </ErrorBoundary>
        </AppShell>
      </PlayerProvider>
    </ToolsContext.Provider>
  );
}

function Loading() {
  return (
    <AuthLayout brand="homeport">
      <Skeleton height="20px" width="60%" />
      <Skeleton height="40px" />
      <Skeleton height="40px" />
    </AuthLayout>
  );
}

export function App() {
  const { state, signIn, signOut } = useAuthState();
  const endSession = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    signOut();
  }, [signOut]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signed-out') return <SignIn onSignedIn={signIn} />;
  if (state.me.mustChangePassword) return <ChooseNewPassword me={state.me} onChanged={signIn} onSignOut={endSession} />;

  return (
    <LocationProvider scope={/^\/(?!api\/)/}>
      <AuthProvider me={state.me} onChange={signIn} onSignOut={signOut}>
        <Shell />
      </AuthProvider>
    </LocationProvider>
  );
}
