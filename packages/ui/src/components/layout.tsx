import { Fragment, type ComponentChildren } from 'preact';

import { Icon, type IconName } from '../icons.js';
import { setTheme, useTheme, type ThemeChoice } from '../theme.js';
import { IconButton, Segmented } from './controls.js';
import { FeedbackHost } from './feedback.js';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName | (string & {});
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface ShellUser {
  name: string;
  detail: string;
  href: string;
}

export interface AppShellProps {
  brand: string;
  nav: NavGroup[];
  tabs: NavItem[];
  activeId: string | null;
  user: ShellUser;
  onSignOut: () => void;
  flush?: boolean;
  children: ComponentChildren;
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System theme', icon: 'monitor' },
  { value: 'light', label: 'Light theme', icon: 'sun' },
  { value: 'dark', label: 'Dark theme', icon: 'moon' },
];

export function ThemeControl() {
  const { choice } = useTheme();
  return <Segmented label="Theme" iconOnly options={THEME_OPTIONS} value={choice} onChange={setTheme} />;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('') || '?';

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span class={size === 'lg' ? 'avatar avatar-lg' : 'avatar'} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function BrandMark() {
  return (
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3.5 12 12 4.5l8.5 7.5" />
        <path d="M6.5 10v3.6M17.5 10v3.6" />
        <circle cx="12" cy="10.4" r="1.5" fill="currentColor" stroke="none" />
        <path d="M3 16.6c1.5 0 1.5-1.1 3-1.1s1.5 1.1 3 1.1 1.5-1.1 3-1.1 1.5 1.1 3 1.1 1.5-1.1 3-1.1 1.5 1.1 3 1.1" />
        <path d="M6 20.4c1 0 1-.9 2-.9s1 .9 2 .9 1-.9 2-.9 1 .9 2 .9 1-.9 2-.9 1 .9 2 .9" />
      </svg>
    </span>
  );
}

function Brand({ brand }: { brand: string }) {
  return (
    <a class="brand" href="/" aria-label={`${brand} home`}>
      <BrandMark />
      {brand}
    </a>
  );
}

export function AppShell({ brand, nav, tabs, activeId, user, onSignOut, flush = false, children }: AppShellProps) {
  const accountActive = activeId === 'account';
  return (
    <div class="app">
      <aside class="sidebar">
        <Brand brand={brand} />
        <nav class="nav" aria-label="Main">
          {nav.map((group, i) => (
            <Fragment key={group.label ?? i}>
              {group.label && <div class="nav-label">{group.label}</div>}
              {group.items.map((item) => (
                <a
                  key={item.id}
                  class="nav-link"
                  href={item.href}
                  title={item.label}
                  aria-current={item.id === activeId ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </a>
              ))}
            </Fragment>
          ))}
        </nav>
        <div class="sidebar-foot">
          <div class="cluster" style={{ flexWrap: 'nowrap' }}>
            <a class="account-chip spacer" href={user.href} aria-current={accountActive ? 'page' : undefined}>
              <Avatar name={user.name} />
              <span class="row-main">
                <span class="row-title">{user.name}</span>
                <span class="row-meta">{user.detail}</span>
              </span>
            </a>
            <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
          </div>
          <ThemeControl />
        </div>
      </aside>

      <header class="topbar">
        <Brand brand={brand} />
        <span class="spacer" />
        <a class="account-chip" href={user.href} aria-label={`Account: ${user.name}`} aria-current={accountActive ? 'page' : undefined}>
          <Avatar name={user.name} />
        </a>
      </header>

      <main class={flush ? 'main flush' : 'main'}>{flush ? children : <div class="main-inner">{children}</div>}</main>

      <nav class="tabbar" aria-label="Main">
        {tabs.map((item) => (
          <a key={item.id} class="tab" href={item.href} aria-current={item.id === activeId ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <FeedbackHost />
    </div>
  );
}

export function AuthLayout({ brand, children }: { brand: string; children: ComponentChildren }) {
  return (
    <div class="auth-layout">
      <div class="auth-card">
        <div class="auth-brand">
          <BrandMark />
          {brand}
        </div>
        {children}
      </div>
      <div class="auth-theme">
        <ThemeControl />
      </div>
      <FeedbackHost />
    </div>
  );
}

export interface PageHeaderProps {
  title: ComponentChildren;
  description?: ComponentChildren;
  eyebrow?: ComponentChildren;
  actions?: ComponentChildren;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header class="page-header">
      <div>
        {eyebrow && <div class="cluster">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div class="cluster">{actions}</div>}
    </header>
  );
}

export interface SectionProps {
  title: string;
  aside?: ComponentChildren;
  first?: boolean;
  children: ComponentChildren;
}

export function Section({ title, aside, first = false, children }: SectionProps) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section class={first ? undefined : 'section'} aria-labelledby={id}>
      <div class="section-head">
        <h2 class="eyebrow" id={id}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
