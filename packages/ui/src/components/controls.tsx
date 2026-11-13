import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

import { Icon, type IconName } from '../icons.js';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children?: ComponentChildren;
}

function buttonClass(variant: Variant, size: Size, iconOnly: boolean, extra?: string) {
  return cx(
    'btn',
    variant !== 'default' && `btn-${variant}`,
    size === 'sm' && 'btn-sm',
    iconOnly && 'btn-icon',
    extra
  );
}

export type ButtonProps = ButtonOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon' | 'size'>;

export function Button({ variant = 'default', size = 'md', icon, children, class: className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} class={buttonClass(variant, size, false, className as string | undefined)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export interface LinkButtonProps extends ButtonOwnProps {
  href: string;
  download?: string | boolean;
  newTab?: boolean;
  title?: string;
}

export function LinkButton({ variant = 'default', size = 'md', icon, children, href, download, newTab, title }: LinkButtonProps) {
  return (
    <a
      class={buttonClass(variant, size, false)}
      href={href}
      download={download === true ? '' : download || undefined}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener' : undefined}
      title={title}
    >
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}

export type IconButtonProps = Omit<ButtonProps, 'children' | 'icon'> & {
  icon: IconName;
  label: string;
};

export function IconButton({ icon, label, variant = 'ghost', size = 'md', class: className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      class={buttonClass(variant, size, true, className as string | undefined)}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  iconOnly?: boolean;
}

export function Segmented<T extends string>({ options, value, onChange, label, iconOnly = false }: SegmentedProps<T>) {
  return (
    <div class={cx('segmented', iconOnly && 'icon-only')} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          title={iconOnly ? option.label : undefined}
          aria-label={iconOnly ? option.label : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} />}
          {!iconOnly && option.label}
        </button>
      ))}
    </div>
  );
}

export interface InputProps {
  value: string;
  onValue: (value: string) => void;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'search' | 'password';
  icon?: IconName;
  autoComplete?: string;
  name?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export function Input({ value, onValue, label, placeholder, type = 'text', icon, autoComplete, name, required, autoFocus }: InputProps) {
  const shared = {
    class: 'input',
    value,
    placeholder,
    name,
    required,
    autoFocus,
    autocomplete: autoComplete,
    autocapitalize: type === 'text' ? ('none' as const) : undefined,
    spellcheck: type === 'text' ? false : undefined,
    'aria-label': label,
    onInput: (event: { currentTarget: HTMLInputElement }) => onValue(event.currentTarget.value),
  };
  const input =
    type === 'search' ? (
      <input type="search" {...shared} />
    ) : type === 'password' ? (
      <input type="password" {...shared} />
    ) : (
      <input type="text" {...shared} />
    );
  if (!icon) return input;
  return (
    <div class="input-group">
      <Icon name={icon} />
      {input}
    </div>
  );
}

export interface FieldProps {
  label: string;
  hint?: string;
  children: ComponentChildren;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

export function Kbd({ children }: { children: ComponentChildren }) {
  return <kbd>{children}</kbd>;
}

export { cx };
