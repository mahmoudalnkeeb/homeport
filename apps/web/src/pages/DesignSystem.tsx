import {
  AudioPlayer,
  Badge,
  BarList,
  Breakdown,
  Button,
  Card,
  Cluster,
  confirm,
  BrandMark,
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
  VideoPlayer,
  Pagination,
} from '@homeport/ui';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { usePlayer } from '../media';

import './design-system.css';

function toneUrl(seconds = 6, rate = 22050): string {
  const samples = seconds * rate;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const note = [220, 277.18, 329.63][Math.floor(t * 2) % 3] ?? 220;
    view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * note * t) * Math.exp(-3 * (t % 0.5)) * 9000, true);
  }
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

function MediaExamples() {
  const [src, setSrc] = useState('');
  const play = usePlayer();
  useEffect(() => {
    const url = toneUrl();
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, []);
  if (!src) return null;
  return (
    <Stack>
      <AudioPlayer src={src} title="Arpeggio.wav" />
      <VideoPlayer src={src} title="Video chrome over an audio-only source" />
      <Button
        icon="list-music"
        onClick={() =>
          play(
            ['One', 'Two', 'Three'].map((name, i) => ({
              id: name,
              kind: i === 1 ? 'video' : 'audio',
              title: `Arpeggio ${name}.wav`,
              src,
              download: src,
              stream: null,
            })),
            0
          )
        }
      >
        Play a three-track queue
      </Button>
    </Stack>
  );
}

function PaginationExample() {
  const [page, setPage] = useState(6);
  return <Pagination page={page} totalPages={20} onPage={setPage} />;
}

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
        eyebrow={<span class="eyebrow">Internal · @homeport/ui</span>}
        title="Homeport design system"
        description="Every tool builds its UI from these components and tokens. Import from @homeport/ui; never hard-code colors."
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

      <DsSection
        title="Buttons"
        description="<Button>, <LinkButton>, <IconButton>. One primary action per view; danger only to confirm destruction."
      >
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

      <DsSection
        title="Pagination"
        description="<Pagination> for server-paged lists: previous/next plus up to seven page slots. Hidden when there is one page."
      >
        <PaginationExample />
      </DsSection>

      <DsSection
        title="Brand"
        description="<BrandMark>: a roof with a lit window over water, for Homeport. The favicon uses the same paths."
      >
        <BrandMark />
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

      <DsSection
        title="Feedback"
        description="toast() for outcomes, confirm() / prompt() for decisions, <Notice> for section state, <EmptyState> that says what to do next."
      >
        <Stack>
          <Cluster>
            <Button icon="check" onClick={() => toast('Uploaded 3 files')}>
              Success toast
            </Button>
            <Button icon="alert" onClick={() => toast('Folder already exists', 'error')}>
              Error toast
            </Button>
            <Button
              onClick={() =>
                void confirm({ title: 'Delete file?', message: '“notes.md” will be permanently deleted.', confirmLabel: 'Delete' })
              }
            >
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

      <DsSection
        title="Media"
        description="<VideoPlayer>, <AudioPlayer>: custom chrome over native playback. Pass hls for an adaptive stream (hls.js loads on demand) and src as the progressive fallback. Keys: Space/K, J/L, arrows, M, F, Shift+N/P for next/previous. <MediaDock> is the app-wide player: it expands over the page, minimizes to a corner (Esc) and plays a queue in order."
      >
        <MediaExamples />
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
