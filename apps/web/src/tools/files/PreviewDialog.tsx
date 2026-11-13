import type { FileEntry } from '@homelab/contracts';
import { Dialog, EmptyState, formatBytes, formatDate, KIND_ICON, LinkButton, Skeleton } from '@homelab/ui';
import { useEffect, useState } from 'preact/hooks';

import { api, rawUrl } from '../../api';

const MAX_TEXT_PREVIEW = 2 * 1024 * 1024;

function TextPreview({ entry }: { entry: FileEntry }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    api.files
      .text(entry.path)
      .then((value) => active && setText(value))
      .catch((caught: Error) => active && setError(caught.message));
    return () => {
      active = false;
    };
  }, [entry.path]);

  if (error) return <EmptyState icon="alert" title={error} />;
  if (text === undefined) return <Skeleton height="60%" />;
  return <pre>{text}</pre>;
}

function PreviewBody({ entry }: { entry: FileEntry }) {
  const url = rawUrl(entry.path);
  switch (entry.kind) {
    case 'image':
      return <img src={url} alt={entry.name} />;
    case 'video':
      return <video src={url} controls autoplay playsinline preload="metadata" />;
    case 'audio':
      return (
        <>
          <EmptyState icon="music" title={entry.name} />
          <audio src={url} controls autoplay />
        </>
      );
    case 'pdf':
      return <iframe src={url} title={entry.name} />;
    case 'markdown':
    case 'text':
      if (entry.size > MAX_TEXT_PREVIEW) {
        return (
          <EmptyState icon="file" title="Too large to preview">
            <span>{formatBytes(entry.size)}. Download it instead.</span>
          </EmptyState>
        );
      }
      return <TextPreview entry={entry} />;
    default:
      return (
        <EmptyState icon={KIND_ICON[entry.kind]} title="No preview for this file type">
          <span>
            {formatBytes(entry.size)} · modified {formatDate(entry.modified)}
          </span>
          <LinkButton variant="primary" icon="download" href={rawUrl(entry.path, true)} download>
            Download
          </LinkButton>
        </EmptyState>
      );
  }
}

export function PreviewDialog({ entry, onClose }: { entry: FileEntry | null; onClose: () => void }) {
  return (
    <Dialog
      open={entry !== null}
      onClose={onClose}
      size="lg"
      title={entry?.name ?? ''}
      icon={entry ? KIND_ICON[entry.kind] : 'file'}
      bodyClass="preview-body"
      actions={
        entry && (
          <>
            {entry.kind === 'markdown' && (
              <LinkButton size="sm" icon="pencil" href={`/tools/markdown?file=${encodeURIComponent(entry.path)}`}>
                <span class="btn-label">Open in Markdown</span>
              </LinkButton>
            )}
            <LinkButton size="sm" icon="external" href={rawUrl(entry.path)} newTab>
              <span class="btn-label">New tab</span>
            </LinkButton>
            <LinkButton size="sm" icon="download" href={rawUrl(entry.path, true)} download>
              <span class="btn-label">Download</span>
            </LinkButton>
          </>
        )
      }
    >
      {entry && <PreviewBody key={entry.path} entry={entry} />}
    </Dialog>
  );
}

