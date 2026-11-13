import {
  Badge,
  BarList,
  Breakdown,
  Button,
  Card,
  Cluster,
  confirm,
  DataTable,
  EmptyState,
  Field,
  Grid,
  Icon,
  ICON_NAMES,
  IconButton,
  Input,
  Kbd,
  Meter,
  Notice,
  PageHeader,
  prompt,
  Row,
  Rows,
  Section,
  Segmented,
  Sparkline,
  Stack,
  Stat,
  toast,
} from '@homelab/ui';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

import './design-system.css';

const SEMANTIC = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'text-faint',
  'accent',
  'accent-soft',
  'accent-text',
  'success',
  'warning',
  'danger',
];
const TYPE_SCALE: [string, string][] = [
  ['text-3xl', 'Display 36'],
  ['text-2xl', 'Stat 28'],
  ['text-xl', 'Page title 22'],
  ['text-md', 'Section 16'],
  ['text-base', 'Body 14, the default UI size'],
  ['text-sm', 'Small 13, controls'],
  ['text-xs', 'Caption 12, metadata'],
];
const WAVE = Array.from({ length: 40 }, (_, i) => 0.35 + Math.sin(i / 4) * 0.2 + (i % 7) * 0.02);

function Swatch({ token }: { token: string }) {
  return (
    <div class="swatch-card">
      <div style={{ '--c': `var(--${token})` }} />
      <div>--{token}</div>
    </div>
  );
}

function DsSection({ title, description, children }: { title: string; description: string; children: ComponentChildren }) {
  return (
    <section class="ds-section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}

export default function DesignSystem() {
  const [view, setView] = useState<'write' | 'split' | 'read'>('split');
  const [text, setText] = useState('');

  return (
    <>
      <PageHeader
        eyebrow={<span class="eyebrow">Internal · @homelab/ui</span>}
        title="Homelab design system"
        description="Every tool builds its UI from these components and tokens. Import from @homelab/ui; never hard-code colors."
      />

      <DsSection title="Color" description="Semantic tokens with light and dark values. Toggle the theme in the sidebar.">
        <Stack>
          <div class="swatches">
            {SEMANTIC.map((token) => (
              <Swatch key={token} token={token} />
            ))}
          </div>
          <span class="eyebrow">Chart series</span>
          <div class="swatches">
            {Array.from({ length: 8 }, (_, i) => (
              <Swatch key={i} token={`series-${i + 1}`} />
            ))}
          </div>
        </Stack>
      </DsSection>

      <DsSection title="Type" description="System sans for UI, mono for data and code. 14px base, dense by default.">
        {TYPE_SCALE.map(([token, label]) => (
          <div key={token} class="type-row">
            <code class="faint">--{token}</code>
            <span style={{ fontSize: `var(--${token})`, fontWeight: token.includes('xl') ? 600 : 400 }}>{label}</span>
          </div>
        ))}
        <div class="type-row">
          <code class="faint">--font-mono</code>
          <span class="mono">1,234.56 GB · 192.168.1.20:3000</span>
        </div>
      </DsSection>

      <DsSection title="Buttons" description="<Button>, <LinkButton>, <IconButton>. One primary action per view; danger only to confirm destruction.">
        <Stack>
          <Cluster>
            <Button variant="primary" icon="upload">
              Upload
            </Button>
            <Button icon="folder-plus">New folder</Button>
            <Button variant="ghost" icon="refresh">
              Refresh
            </Button>
            <Button variant="danger" icon="trash">
              Delete
            </Button>
            <Button disabled>Disabled</Button>
          </Cluster>
          <Cluster>
            <Button size="sm" variant="primary" icon="save">
              Save
            </Button>
            <Button size="sm" icon="download">
              Download
            </Button>
            <IconButton size="sm" icon="copy" label="Copy" />
            <IconButton icon="search" label="Search" variant="default" />
            <Kbd>Ctrl</Kbd>
            <Kbd>S</Kbd>
          </Cluster>
        </Stack>
      </DsSection>

      <DsSection title="Inputs" description="<Field>, <Input>, <Segmented>.">
        <Grid>
          <div class="span-6">
            <Field label="Folder name" hint="Letters, numbers and spaces.">
              <Input value={text} onValue={setText} placeholder="e.g. movies" />
            </Field>
          </div>
          <div class="span-6">
            <Field label="Search">
              <Input type="search" icon="search" value={text} onValue={setText} placeholder="Filter" />
            </Field>
          </div>
          <div class="span-12">
            <Segmented
              label="Demo"
              value={view}
              onChange={setView}
              options={[
                { value: 'write', label: 'Write', icon: 'pencil' },
                { value: 'split', label: 'Split', icon: 'columns' },
                { value: 'read', label: 'Read', icon: 'book' },
              ]}
            />
          </div>
        </Grid>
      </DsSection>

      <DsSection title="Data display" description="<Card>, <Stat>, <Meter>, <Sparkline>, <Breakdown>, <BarList>, <Rows>, <Badge>.">
        <Grid>
          <Card span={4} title="CPU" icon="cpu" aside={<span class="faint">8 cores</span>}>
            <Stat value={42} unit="%" />
            <Sparkline values={WAVE} max={1} />
          </Card>
          <Card span={4} title="Requests" icon="activity">
            <Stat value={318} />
            <Sparkline values={WAVE.map((v, i) => (i % 5 ? Math.round(v * 20) : 0))} type="bar" color="var(--series-3)" />
          </Card>
          <Card span={4} title="Disk" icon="drive">
            <Stat value={71} unit="%" />
            <Meter value={0.52} label="Normal" thresholds />
            <Meter value={0.8} label="Warning" thresholds />
            <Meter value={0.94} label="Danger" thresholds />
          </Card>
          <Card span={6} title="Breakdown" icon="folder">
            <Breakdown
              label="Demo breakdown"
              segments={[
                { label: 'video', value: 5, display: '5.0 GB', icon: 'film' },
                { label: 'image', value: 3, display: '3.0 GB', icon: 'image' },
                { label: 'audio', value: 2, display: '2.0 GB', icon: 'music' },
                { label: 'markdown', value: 1, display: '1.0 GB', icon: 'file-text' },
              ]}
            />
          </Card>
          <Card span={3} title="Bar list" icon="layers">
            <BarList
              items={[
                { label: 'Files', value: 42 },
                { label: 'Markdown', value: 17 },
                { label: 'Overview', value: 9 },
              ]}
            />
          </Card>
          <Card span={3} title="Rows" icon="clock">
            <Rows>
              <Row icon="film" title="holiday.mp4" meta="1.4 GB · 2 hours ago" end={<Badge tone="accent">new</Badge>} />
              <Row icon="file-text" title="notes.md" meta="4.2 KB · yesterday" end={<Badge>markdown</Badge>} />
            </Rows>
          </Card>
        </Grid>
      </DsSection>

      <DsSection title="Table" description="<DataTable> with typed columns; numeric columns are mono and right-aligned.">
        <DataTable
          rowKey={(row) => row.name}
          rows={[
            { name: 'holiday.mp4', kind: 'video', size: '1.4 GB' },
            { name: 'notes.md', kind: 'markdown', size: '4.2 KB' },
          ]}
          columns={[
            { key: 'name', header: 'Name', render: (row) => row.name },
            { key: 'kind', header: 'Type', render: (row) => row.kind },
            { key: 'size', header: 'Size', numeric: true, render: (row) => row.size },
          ]}
        />
      </DsSection>

      <DsSection title="Feedback" description="toast() for outcomes, confirm() / prompt() for decisions, <Notice> for section state, <EmptyState> that says what to do next.">
        <Stack>
          <Cluster>
            <Button icon="check" onClick={() => toast('Uploaded 3 files')}>
              Success toast
            </Button>
            <Button icon="alert" onClick={() => toast('Folder already exists', 'error')}>
              Error toast
            </Button>
            <Button onClick={() => void confirm({ title: 'Delete file?', message: '“notes.md” will be permanently deleted.', confirmLabel: 'Delete' })}>
              confirm()
            </Button>
            <Button onClick={() => void prompt({ title: 'Rename', label: 'New name', value: 'notes.md' })}>prompt()</Button>
          </Cluster>
          <Card>
            <EmptyState icon="folder" title="This folder is empty">
              <span>Drop files here or use Upload.</span>
            </EmptyState>
          </Card>
          <Notice title="Synced 12 files">Background sync finished a moment ago.</Notice>
          <Notice tone="warning" title="Showing the Docker VM, not this host">
            Run <code>pnpm agent</code> on the host to report its real CPU, memory and disk.
          </Notice>
        </Stack>
      </DsSection>

      <Section title="Icons">
        <div class="cluster icon-grid">
          {ICON_NAMES.map((name) => (
            <span key={name} title={name}>
              <Icon name={name} size="lg" />
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}
