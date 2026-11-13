import { useEffect, useState } from 'preact/hooks';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'ready'; install: () => Promise<boolean> }
  | { kind: 'ios' }
  | { kind: 'insecure' }
  | { kind: 'manual' };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
  if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
  }
}

async function install(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}

function currentState(): InstallState {
  if (installed || isStandalone()) return { kind: 'installed' };
  if (deferred) return { kind: 'ready', install };
  if (isIos()) return { kind: 'ios' };
  if (!window.isSecureContext) return { kind: 'insecure' };
  return { kind: 'manual' };
}

export function useInstall(): InstallState {
  const [state, setState] = useState(currentState);
  useEffect(() => {
    const update = () => setState(currentState());
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}
