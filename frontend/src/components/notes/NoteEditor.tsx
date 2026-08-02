'use client';

/**
 * Rich note editor (TipTap / ProseMirror) — the Superlist-style writing
 * surface: headings, bullet/numbered lists, checklists, quotes and inline
 * formatting, with a slim toolbar. Emits HTML on change (debounced upstream
 * for autosave). Read-only mode renders the same schema, which is also what
 * keeps stored HTML safe to display (only known nodes are rendered).
 */

import { useEffect, useReducer } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Heading1,
  Heading2,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Quote,
} from 'lucide-react';

export function NoteEditor({
  value,
  editable = true,
  placeholder,
  onChange,
}: {
  value: string;
  editable?: boolean;
  placeholder?: string;
  onChange?: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
    ],
    content: value || '',
    editorProps: { attributes: { class: 'note-prose focus:outline-none' } },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  // Re-render on every transaction so the toolbar's active states track the
  // selection.
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const h = () => force();
    editor.on('transaction', h);
    return () => {
      editor.off('transaction', h);
    };
  }, [editor]);

  // When the selected note changes, swap content without emitting an update.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    [
      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
      active ? 'bg-cherry/10 text-cherry' : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
    ].join(' ');

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 border-b border-line bg-surface/90 py-1.5 backdrop-blur">
      <button className={btn(editor.isActive('heading', { level: 1 }))} title="Heading" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 size={16} />
      </button>
      <button className={btn(editor.isActive('heading', { level: 2 }))} title="Subheading" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={16} />
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button className={btn(editor.isActive('bold'))} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon size={16} />
      </button>
      <button className={btn(editor.isActive('italic'))} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon size={16} />
      </button>
      <button className={btn(editor.isActive('strike'))} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={16} />
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button className={btn(editor.isActive('bulletList'))} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={16} />
      </button>
      <button className={btn(editor.isActive('orderedList'))} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={16} />
      </button>
      <button className={btn(editor.isActive('taskList'))} title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks size={16} />
      </button>
      <button className={btn(editor.isActive('blockquote'))} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={16} />
      </button>
    </div>
  );
}

/** Plain-text snippet from note HTML, for list previews. */
export function noteSnippet(html: string, max = 140): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
