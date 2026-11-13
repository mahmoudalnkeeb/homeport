import { IconButton, useTheme } from '@homeport/ui';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import svgPanZoom from 'svg-pan-zoom';

import { loadMermaid, renderMarkdown } from './render';

type PanZoom = ReturnType<typeof svgPanZoom>;

function refit(pz: PanZoom) {
  pz.resize();
  pz.fit();
  pz.center();
}

function DiagramTools({ pz, box }: { pz: PanZoom; box: HTMLElement }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    box.classList.toggle('maximized', maximized);
    if (maximized) pz.enableMouseWheelZoom();
    else pz.disableMouseWheelZoom();
    refit(pz);
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMaximized(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [maximized, pz, box]);

  return (
    <>
      <IconButton size="sm" icon="zoom-in" label="Zoom in" onClick={() => pz.zoomIn()} />
      <IconButton size="sm" icon="zoom-out" label="Zoom out" onClick={() => pz.zoomOut()} />
      <IconButton
        size="sm"
        icon="reset"
        label="Reset view"
        onClick={() => {
          pz.resetZoom();
          refit(pz);
        }}
      />
      <IconButton
        size="sm"
        icon={maximized ? 'minimize' : 'maximize'}
        label={maximized ? 'Restore (Esc)' : 'Maximize'}
        onClick={() => setMaximized(!maximized)}
      />
    </>
  );
}

function enhanceDiagram(pre: HTMLElement): () => void {
  const svg = pre.querySelector('svg');
  if (!svg) {
    const error = document.createElement('div');
    error.className = 'diagram-error';
    error.textContent = `Mermaid could not render this diagram.\n\n${pre.textContent ?? ''}`;
    pre.replaceWith(error);
    return () => undefined;
  }

  const box = document.createElement('div');
  box.className = 'diagram';
  const tools = document.createElement('div');
  tools.className = 'diagram-tools';
  pre.replaceWith(box);
  box.append(tools, pre);

  const height = Math.max(svg.getBoundingClientRect().height, 150);
  pre.style.setProperty('--h', `${Math.ceil(height) + 32}px`);
  svg.style.maxWidth = 'none';
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  const pz = svgPanZoom(svg, { fit: true, center: true, minZoom: 0.2, maxZoom: 20, mouseWheelZoomEnabled: false });
  render(<DiagramTools pz={pz} box={box} />, tools);
  const onResize = () => refit(pz);
  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    render(null, tools);
    pz.destroy();
  };
}

export interface PreviewProps {
  source: string;
  layoutKey: string;
}

export function Preview({ source, layoutKey }: PreviewProps) {
  const ref = useRef<HTMLElement>(null);
  const { resolved } = useTheme();
  const [html, setHtml] = useState(() => renderMarkdown(source));

  useEffect(() => {
    const timer = setTimeout(() => setHtml(renderMarkdown(source)), 200);
    return () => clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = html;
    const nodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid')];
    if (!nodes.length) return;

    let cancelled = false;
    const cleanups: (() => void)[] = [];
    void (async () => {
      try {
        const mermaid = await loadMermaid(resolved);
        if (cancelled) return;
        await mermaid.run({ nodes, suppressErrors: true });
      } catch {
      }
      if (!cancelled) cleanups.push(...nodes.map(enhanceDiagram));
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [html, resolved, layoutKey]);

  return (
    <div class="md-preview">
      <article ref={ref} class="prose" />
    </div>
  );
}
