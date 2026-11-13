import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { Icon, type IconName } from '../icons.js';
import { Button, IconButton } from './controls.js';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  actions?: ComponentChildren;
  footer?: ComponentChildren;
  size?: 'md' | 'lg';
  bodyClass?: string;
  children?: ComponentChildren;
}

export function Dialog({ open, onClose, title, icon, actions, footer, size = 'md', bodyClass, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      class={size === 'lg' ? 'dialog dialog-lg' : 'dialog'}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div class="dialog-head">
            {icon && (
              <span class="row-icon">
                <Icon name={icon} />
              </span>
            )}
            <h2>{title}</h2>
            {actions && <div class="cluster">{actions}</div>}
            <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
          </div>
          <div class={bodyClass ? `dialog-body ${bodyClass}` : 'dialog-body'}>{children}</div>
          {footer && <div class="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

type Tone = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}
type Ask =
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; title: string; label: string; value: string; hint: string; confirmLabel: string; resolve: (value: string | null) => void };

const state = { toasts: [] as ToastItem[], ask: null as Ask | null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
let nextId = 1;

export function toast(message: string, tone: Tone = 'success'): void {
  const id = nextId++;
  state.toasts = [...state.toasts, { id, message, tone }];
  emit();
  setTimeout(
    () => {
      state.toasts = state.toasts.filter((item) => item.id !== id);
      emit();
    },
    tone === 'error' ? 6000 : 3200
  );
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function confirm({ title, message, confirmLabel = 'Confirm', danger = true }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    state.ask = { kind: 'confirm', title, message, confirmLabel, danger, resolve };
    emit();
  });
}

export interface PromptOptions {
  title: string;
  label: string;
  value?: string;
  hint?: string;
  confirmLabel?: string;
}

export function prompt({ title, label, value = '', hint = '', confirmLabel = 'Save' }: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    state.ask = { kind: 'prompt', title, label, value, hint, confirmLabel, resolve };
    emit();
  });
}

function useFeedbackState() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return state;
}

function AskDialog({ ask }: { ask: Ask }) {
  const [value, setValue] = useState(ask.kind === 'prompt' ? ask.value : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = input.value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  }, []);

  const finish = (ok: boolean) => {
    state.ask = null;
    emit();
    if (ask.kind === 'confirm') ask.resolve(ok);
    else ask.resolve(ok && value.trim() ? value.trim() : null);
  };

  return (
    <Dialog
      open
      onClose={() => finish(false)}
      title={ask.title}
      footer={
        <>
          <Button onClick={() => finish(false)}>Cancel</Button>
          <Button
            variant={ask.kind === 'confirm' && ask.danger ? 'danger' : 'primary'}
            onClick={() => finish(true)}
            disabled={ask.kind === 'prompt' && !value.trim()}
          >
            {ask.confirmLabel}
          </Button>
        </>
      }
    >
      {ask.kind === 'confirm' ? (
        <p class="muted">{ask.message}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) finish(true);
          }}
        >
          <label class="field">
            <span class="field-label">{ask.label}</span>
            <input
              ref={inputRef}
              class="input"
              value={value}
              onInput={(event) => setValue(event.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
            {ask.hint && <span class="field-hint">{ask.hint}</span>}
          </label>
        </form>
      )}
    </Dialog>
  );
}

export function FeedbackHost() {
  const { toasts, ask } = useFeedbackState();
  return (
    <>
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} class="toast" data-tone={item.tone}>
            <Icon name={item.tone === 'error' ? 'alert' : 'check'} />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
      {ask && <AskDialog key={ask.title} ask={ask} />}
    </>
  );
}

function copyWithSelection(text: string): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const host = active?.closest('dialog') ?? document.body;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  Object.assign(field.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0' });
  host.append(field);
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  active?.focus({ preventScroll: true });
  return copied;
}

export async function copyText(text: string, label = 'Copied to clipboard'): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
      return;
    } catch {
      if (copyWithSelection(text)) {
        toast(label);
        return;
      }
    }
  } else if (copyWithSelection(text)) {
    toast(label);
    return;
  }
  toast('Could not copy. Select the text and copy it manually.', 'error');
}

export interface SheetAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  tone?: 'danger';
}

export function ActionSheet({ open, title, actions, onClose }: { open: boolean; title: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div class="sheet-actions" role="menu">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            class="sheet-action"
            data-tone={action.tone}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            <Icon name={action.icon} />
            {action.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
