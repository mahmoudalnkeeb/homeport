import { Button, confirm, formatBytes, Icon, Notice, prompt, Segmented, timeAgo, toast } from '@homeport/ui';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { api } from '../../api';
import { useAuth } from '../../auth';
import { PHONE, useMediaQuery, usePreference } from '../../hooks';
import { Preview } from './Preview';
import { SAMPLE } from './sample';
import './markdown.css';

const DRAFT_KEY = 'markdown-draft';
const VIEWS = ['write', 'split', 'read'] as const;
type View = (typeof VIEWS)[number];

interface Doc {
  path: string | null;
  name: string;
  saved: string;
  meta: string;
}

const UNTITLED = 'Untitled.md';
const DRAFT_META = 'Draft · stored in this browser';

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
    }
  },
};

function suggestPath(doc: Doc, content: string, home: string, readOnly: boolean): string {
  if (doc.path && !readOnly) return doc.path;
  if (doc.path) return `${home}/notes/${doc.name}`;
  const base =
    doc.name !== UNTITLED
      ? doc.name.replace(/\.(md|markdown|mdx|txt)$/i, '')
      : (/^#\s+(.+)$/m.exec(content)?.[1] ?? 'untitled')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60);
  return `${home}/notes/${base || 'untitled'}.md`;
}

export default function MarkdownPage() {
  const { query, route } = useLocation();
  const { me, canWrite } = useAuth();
  const isPhone = useMediaQuery(PHONE);
  const { file, new: isNew } = query;
  const [view, setView] = usePreference<View>('markdown-view', 'split', VIEWS);
  const [doc, setDoc] = useState<Doc>({ path: null, name: UNTITLED, saved: '', meta: DRAFT_META });
  const [content, setContent] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef<string | null | undefined>(undefined);
  const dirty = content !== doc.saved;
  const readOnly = doc.path !== null && !canWrite(doc.path);
  const effectiveView: View = isPhone && view === 'split' ? 'write' : view;

  const openDraft = useCallback((text: string, name = UNTITLED, meta = DRAFT_META) => {
    loadedRef.current = null;
    setDoc({ path: null, name, saved: '', meta });
    setContent(text);
  }, []);

  useEffect(() => {
    if (file) {
      if (file === loadedRef.current) return;
      loadedRef.current = file;
      api.files
        .text(file)
        .then((text) => {
          setDoc({ path: file, name: file.split('/').at(-1) ?? file, saved: text, meta: `data/${file}` });
          setContent(text);
        })
        .catch((error: Error) => {
          toast(error.message, 'error');
          loadedRef.current = undefined;
          route('/tools/markdown', true);
        });
      return;
    }
    if (isNew) {
      storage.set(DRAFT_KEY, null);
      openDraft('# Untitled\n\n');
      route('/tools/markdown', true);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        editorRef.current?.setSelectionRange(2, 10);
      });
      return;
    }
    if (loadedRef.current === undefined) openDraft(storage.get(DRAFT_KEY) ?? SAMPLE);
  }, [file, isNew, route, openDraft]);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${doc.name} · Markdown`;
    return () => {
      document.title = 'Homeport';
    };
  }, [dirty, doc.name]);

  useEffect(() => {
    if (!doc.path || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [doc.path, dirty]);

  const edit = (text: string) => {
    setContent(text);
    if (!doc.path) storage.set(DRAFT_KEY, text);
  };

  const save = async (saveAs = false) => {
    let path = doc.path;
    if (!path || saveAs || readOnly) {
      const input = await prompt({
        title: readOnly ? 'Save a copy' : 'Save note',
        label: 'Path inside the data folder',
        value: suggestPath(doc, content, me.home, readOnly),
        hint: `Your notes live in ${me.home}/. Folders are created as needed; an existing file there is overwritten.`,
      });
      if (!input) return;
      path = input.replace(/^\/+/, '');
      if (!/\.(md|markdown|mdx)$/i.test(path)) path += '.md';
    }
    try {
      const saved = await api.files.writeText({ path, content });
      loadedRef.current = saved.path;
      storage.set(DRAFT_KEY, null);
      setDoc({
        path: saved.path,
        name: saved.name,
        saved: content,
        meta: `data/${saved.path} · ${formatBytes(saved.size)} · saved ${timeAgo(saved.modified)}`,
      });
      route(`/tools/markdown?file=${encodeURIComponent(saved.path)}`, true);
      toast(`Saved ${saved.path}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Save failed', 'error');
    }
  };

  const newDocument = async () => {
    if (doc.path && dirty) {
      const ok = await confirm({ title: 'Discard changes?', message: `Unsaved edits to ${doc.name} will be lost.`, confirmLabel: 'Discard' });
      if (!ok) return;
    }
    route('/tools/markdown?new=1');
  };

  const openLocal = async (file: File | undefined) => {
    if (!file) return;
    openDraft(await file.text(), file.name, 'Opened from this device · not saved yet');
    route('/tools/markdown', true);
  };

  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
    link.download = doc.name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save(event.shiftKey);
      }
    };
    const onDrop = (event: DragEvent) => {
      if (![...(event.dataTransfer?.types ?? [])].includes('Files')) return;
      event.preventDefault();
      void openLocal(event.dataTransfer?.files[0]);
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();
    document.addEventListener('keydown', onKey);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragover', onDragOver);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragover', onDragOver);
    };
  });

  return (
    <>
      <header class="md-bar">
        <div class="md-doc">
          <span class="row-icon">
            <Icon name="file-text" />
          </span>
          <div class="row-main">
            <span class="row-title">
              {doc.name}
              {dirty && (
                <span class="dirty" title="Unsaved changes">
                  ●
                </span>
              )}
            </span>
            <span class="row-meta truncate">{doc.meta}</span>
          </div>
        </div>
        <Segmented
          label="View"
          value={effectiveView}
          onChange={setView}
          options={[
            { value: 'write', label: 'Write', icon: 'pencil' },
            ...(isPhone ? [] : [{ value: 'split' as const, label: 'Split', icon: 'columns' as const }]),
            { value: 'read', label: 'Read', icon: 'book' },
          ]}
        />
        <div class="cluster md-actions">
          <Button variant="ghost" size="sm" icon="plus" onClick={newDocument}>
            <span>New</span>
          </Button>
          <Button variant="ghost" size="sm" icon="upload" title="Open a Markdown file from this device" onClick={() => pickerRef.current?.click()}>
            <span>Open</span>
          </Button>
          <input
            ref={pickerRef}
            type="file"
            accept=".md,.markdown,.mdx,.txt,text/markdown"
            hidden
            onChange={(event) => {
              void openLocal(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <Button variant="ghost" size="sm" icon="download" title="Download as .md" onClick={download}>
            <span>Download</span>
          </Button>
          <Button variant="primary" size="sm" icon="save" title="Save to the data folder (Ctrl+S, Shift for Save as)" onClick={(event) => save(event.shiftKey)}>
            <span>{readOnly ? 'Save copy' : 'Save'}</span>
          </Button>
        </div>
      </header>
      {readOnly && (
        <div class="md-readonly">
          <Notice title="Read-only: this note is in the shared library">
            You can still edit it here. <strong>Save copy</strong> stores your version in My files.
          </Notice>
        </div>
      )}
      <div class="md-workspace" data-view={effectiveView}>
        <label class="sr-only" for="md-editor">
          Markdown source
        </label>
        <textarea
          id="md-editor"
          ref={editorRef}
          spellcheck={false}
          autocomplete="off"
          value={content}
          onInput={(event) => edit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Tab' || event.shiftKey) return;
            event.preventDefault();
            const editor = event.currentTarget;
            editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
            edit(editor.value);
          }}
        />
        {effectiveView !== 'write' && <Preview source={content} layoutKey={effectiveView} />}
      </div>
    </>
  );
}
