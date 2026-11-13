import type { ComponentChildren } from 'preact';

import { Icon, type IconName } from '../icons.js';
import { cx, IconButton } from './controls.js';

export interface CardProps {
  title?: string;
  icon?: IconName | (string & {});
  aside?: ComponentChildren;
  span?: 3 | 4 | 6 | 8 | 12;
  href?: string;
  class?: string;
  children?: ComponentChildren;
}

export function Card({ title, icon, aside, span, href, class: className, children }: CardProps) {
  const classes = cx('card', span && `span-${span}`, className);
  const head = title && (
    <div class="card-head">
      {icon && <Icon name={icon} />}
      <span>{title}</span>
      <span class="spacer" />
      {aside}
    </div>
  );
  if (href) {
    return (
      <a class={classes} href={href}>
        {head}
        {children}
      </a>
    );
  }
  return (
    <article class={classes}>
      {head}
      {children}
    </article>
  );
}

export function Grid({ children }: { children: ComponentChildren }) {
  return <div class="grid">{children}</div>;
}

export function Stack({ children, gap }: { children: ComponentChildren; gap?: 2 | 3 | 4 | 6 }) {
  return (
    <div class="stack" style={gap ? { gap: `var(--space-${gap})` } : undefined}>
      {children}
    </div>
  );
}

export function Cluster({ children, gap }: { children: ComponentChildren; gap?: 2 | 3 | 4 | 8 }) {
  return (
    <div class="cluster" style={gap ? { gap: `var(--space-${gap})` } : undefined}>
      {children}
    </div>
  );
}

export interface StatProps {
  value: string | number;
  unit?: string;
  label?: string;
}

export function Stat({ value, unit, label }: StatProps) {
  return (
    <div>
      <div class="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {label && <div class="stat-meta">{label}</div>}
    </div>
  );
}

export function Meta({ children, title }: { children: ComponentChildren; title?: string }) {
  return (
    <span class="stat-meta truncate" title={title}>
      {children}
    </span>
  );
}

const meterTone = (ratio: number) => (ratio > 0.9 ? 'danger' : ratio > 0.75 ? 'warning' : undefined);

export interface MeterProps {
  value: number;
  label: string;
  thresholds?: boolean;
  thin?: boolean;
}

export function Meter({ value, label, thresholds = false, thin = false }: MeterProps) {
  const ratio = Math.min(Math.max(value, 0), 1);
  return (
    <div
      class="meter"
      style={thin ? { height: '4px' } : undefined}
      data-tone={thresholds ? meterTone(ratio) : undefined}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <span style={{ '--value': `${(ratio * 100).toFixed(1)}%` }} />
    </div>
  );
}

export const seriesColor = (index: number) => `var(--series-${(index % 8) + 1})`;

export interface Segment {
  label: string;
  value: number;
  display: string;
  icon?: IconName;
}

export function Breakdown({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <>
      <div class="stackbar" role="img" aria-label={label}>
        {segments.map((segment, i) => (
          <span
            key={segment.label}
            style={{ '--c': seriesColor(i), flex: segment.value / total }}
            title={`${segment.label}: ${segment.display}`}
          />
        ))}
      </div>
      <ul class="legend">
        {segments.map((segment, i) => (
          <li key={segment.label}>
            <span class="swatch" style={{ '--c': seriesColor(i) }} />
            {segment.icon && <Icon name={segment.icon} />}
            <span style={{ textTransform: 'capitalize' }}>{segment.label}</span>
            <span class="value">{segment.display}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const top = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul class="barlist">
      {items.map((item) => (
        <li key={item.label}>
          <span class="truncate">{item.label}</span>
          <span class="mono faint">{item.value}</span>
          <Meter value={item.value / top} label={item.label} thin />
        </li>
      ))}
    </ul>
  );
}

export interface SparklineProps {
  values: number[];
  max?: number;
  type?: 'line' | 'bar';
  color?: string;
}

export function Sparkline({ values, max, type = 'line', color }: SparklineProps) {
  const w = 100;
  const h = 40;
  const top = max ?? Math.max(...values, 1);
  const style = color ? { '--c': color } : undefined;
  if (!values.length) return <svg class="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;

  if (type === 'bar') {
    const step = w / values.length;
    return (
      <svg class="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={style}>
        {values.map((v, i) => {
          const bh = v > 0 ? Math.max((v / top) * h, 2) : 1;
          return (
            <rect
              key={i}
              class={v > 0 ? 'bar' : 'bar zero'}
              x={i * step + step * 0.15}
              y={h - bh}
              width={step * 0.7}
              height={bh}
              rx={0.6}
            />
          );
        })}
      </svg>
    );
  }

  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / top) * (h - 2) - 1).toFixed(2)}`);
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={style}>
      <path class="area" d={`M0,${h} L${points.join(' L')} L${w},${h} Z`} />
      <path class="line" d={`M${points.join(' L')}`} />
    </svg>
  );
}

export function Badge({ children, tone }: { children: ComponentChildren; tone?: 'accent' | undefined }) {
  return <span class={cx('badge', tone && `badge-${tone}`)}>{children}</span>;
}

export function Chip({ children, icon }: { children: ComponentChildren; icon?: IconName }) {
  return (
    <span class="chip">
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <span class="dot" aria-hidden="true" style={ok ? undefined : { background: 'var(--danger)' }} />;
}

export function Rows({ children, class: className }: { children: ComponentChildren; class?: string }) {
  return <ul class={cx('rows', className)}>{children}</ul>;
}

export interface RowProps {
  icon?: IconName | (string & {});
  title: ComponentChildren;
  meta?: ComponentChildren;
  href?: string;
  end?: ComponentChildren;
  mono?: boolean;
}

export function Row({ icon, title, meta, href, end, mono }: RowProps) {
  const body = (
    <>
      {icon && (
        <span class="row-icon">
          <Icon name={icon} />
        </span>
      )}
      <span class="row-main">
        <span class={cx('row-title', mono && 'mono')}>{title}</span>
        {meta && <span class="row-meta">{meta}</span>}
      </span>
      {end}
    </>
  );
  return (
    <li>
      {href ? (
        <a class="row" href={href}>
          {body}
        </a>
      ) : (
        <div class="row">{body}</div>
      )}
    </li>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  children?: ComponentChildren;
}

export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div class="empty">
      <Icon name={icon} />
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Skeleton({ width = '100%', height = '16px' }: { width?: string; height?: string }) {
  return <div class="skeleton" style={{ width, height }} />;
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, label, onNavigate }: { items: Crumb[]; label: string; onNavigate?: (href: string) => void }) {
  return (
    <ol class="breadcrumbs" aria-label={label}>
      {items.map((item, i) => (
        <li key={`${i}-${item.label}`}>
          {i === items.length - 1 || !item.href ? (
            <span aria-current="page">{item.label}</span>
          ) : (
            <a
              href={item.href}
              onClick={
                onNavigate &&
                ((event) => {
                  event.preventDefault();
                  onNavigate(item.href ?? '');
                })
              }
            >
              {item.label}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  hiddenHeader?: boolean;
  render: (row: T) => ComponentChildren;
}

export function DataTable<T>({ columns, rows, rowKey }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string }) {
  return (
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} class={column.numeric ? 'num' : undefined}>
                {column.hiddenHeader ? <span class="sr-only">{column.header}</span> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} class={column.numeric ? 'num' : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface NoticeProps {
  tone?: 'info' | 'warning';
  title: string;
  children?: ComponentChildren;
}

export function Notice({ tone = 'info', title, children }: NoticeProps) {
  return (
    <div class="notice" data-tone={tone} role={tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={tone === 'warning' ? 'alert' : 'activity'} />
      <div>
        <strong>{title}</strong>
        {children && <div class="notice-body">{children}</div>}
      </div>
    </div>
  );
}

export type PageItem = number | 'gap';

export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const run = (from: number, length: number) => Array.from({ length }, (_, i) => from + i);
  if (page <= 4) return [...run(1, 5), 'gap', totalPages];
  if (page >= totalPages - 3) return [1, 'gap', ...run(totalPages - 4, 5)];
  return [1, 'gap', ...run(page - 1, 3), 'gap', totalPages];
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  label?: string;
}

export function Pagination({ page, totalPages, onPage, label = 'Pages' }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav class="pagination" aria-label={label}>
      <IconButton size="sm" icon="chevron-left" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
      {pageItems(page, totalPages).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} class="pagination-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            class="btn btn-sm btn-ghost pagination-page"
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Page ${item}`}
            onClick={() => onPage(item)}
          >
            {item}
          </button>
        )
      )}
      <IconButton size="sm" icon="chevron-right" label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
    </nav>
  );
}
