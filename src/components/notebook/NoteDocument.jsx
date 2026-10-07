// Single-document note editor (TipTap / ProseMirror).
//
// The whole note is ONE editor: prose flows continuously (cross-block selection,
// backspace-merge, Enter-to-split all come for free), while runnable code and
// embedded circuits are atom node-views living in the same document. On every
// change the doc is serialized back to the note's stored block array (docBlocks),
// so search / export / templates / backlinks keep working untouched.

import { useRef, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Markdown } from '@tiptap/markdown'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import 'katex/dist/katex.min.css'
import { KATEX_MACROS } from '../../lib/mathNormalize.js'
import { listNotes, createNote, getStorageInfo } from '../../lib/notebook/notebookStore.js'
import {
  uploadImage, isAllowedImageType, allowedTypeLabel,
  MAX_UPLOAD_BYTES, MAX_EMBED_BYTES,
} from '../../lib/notebook/assets.js'
import { getUser } from '../../lib/auth.js'
import { blocksToDoc, docToBlocks } from '../../lib/notebook/docBlocks.js'
import BubbleToolbar from './BubbleToolbar.jsx'
import WikiLink from './extensions/WikiLink.js'
import Callout from './extensions/Callout.js'
import RunnableCode from './extensions/RunnableCode.js'
import CircuitNode from './extensions/CircuitNode.js'
import SketchNode from './extensions/SketchNode.js'
import DataPlotNode from './extensions/DataPlotNode.js'
import { SlashCommand } from './extensions/SlashCommand.js'
import { WikiSuggestion } from './extensions/WikiSuggestion.js'
import { toastError } from './ui/toast.js'
import { useConfirm } from './ui/useConfirm.jsx'
import MathPopover from './MathPopover.jsx'

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`

// Task nodes: parsing is native to @tiptap/markdown, rendering is not — add it.
const MdTaskList = TaskList.extend({
  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content, '\n')
  },
})
const MdTaskItem = TaskItem.extend({
  renderMarkdown(node, helpers) {
    const box = node.attrs.checked ? '[x]' : '[ ]'
    return `- ${box} ${helpers.renderChildren(node.content).trim()}`
  },
})

// Screen readers get nothing from a bare embedded image, so default the alt
// text to the file name — better than silence, even if not hand-written.
function altFromFileName(name) {
  return (name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Embedded image'
}

// A wiki link resolves by stored note id first (survives renaming the target),
// then by title for links that were never bound to one.
function resolveWikiTarget(noteId, label) {
  const notes = listNotes()
  const wanted = (label || '').trim().toLowerCase()
  return (
    (noteId && notes.find((n) => n.id === noteId)) ||
    notes.find((n) => (n.title || '').trim().toLowerCase() === wanted) ||
    null
  )
}

// Base64 straight into the note body. Signed out this is the only option, and
// it spends the shared ~5 MB localStorage budget that holds *every* note — hence
// the much smaller cap and the pre-flight check on remaining space.
function embedImageAsDataUrl(editor, file) {
  if (file.size > MAX_EMBED_BYTES) {
    toastError(
      `Image is too large to embed (max ${formatMb(MAX_EMBED_BYTES)}). Sign in to upload images up to ${formatMb(MAX_UPLOAD_BYTES)}.`,
    )
    return
  }
  // Refuse the embed while storage is nearly full rather than letting the save
  // fail afterwards. By then the user has already picked the file, watched it
  // appear, and kept writing — and the note that fails to save is the one now
  // carrying an extra megabyte. Better to say no at the point of insertion.
  if (getStorageInfo().level === 'critical') {
    toastError(
      'Not enough local storage left to embed an image. Export a backup or delete a few notes with images, then try again.',
    )
    return
  }
  const reader = new FileReader()
  reader.onload = () =>
    editor.chain().focus().setImage({ src: String(reader.result), alt: altFromFileName(file.name) }).run()
  reader.readAsDataURL(file)
}

/**
 * Insert a picked / pasted / dropped image.
 *
 * Signed in, the bytes go to Supabase Storage and only a URL lands in the note.
 * Signed out — or if the upload fails — it falls back to embedding base64, so
 * the user's image is never simply lost to a network problem. The fallback is
 * announced, because silently storing 8 MB of base64 in localStorage would be a
 * worse surprise than the upload failing.
 */
async function insertImageFile(editor, file, noteId) {
  if (!file || !file.type.startsWith('image/')) return

  if (!isAllowedImageType(file.type)) {
    toastError(`That image type isn't supported. Use ${allowedTypeLabel()}.`)
    return
  }

  if (!getUser()?.id) {
    embedImageAsDataUrl(editor, file)
    return
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    toastError(`Image is too large (max ${formatMb(MAX_UPLOAD_BYTES)}).`)
    return
  }

  try {
    const { url } = await uploadImage(file, noteId)
    editor.chain().focus().setImage({ src: url, alt: altFromFileName(file.name) }).run()
  } catch (err) {
    console.warn('[notebook] image upload failed, embedding instead:', err?.message)
    if (file.size > MAX_EMBED_BYTES) {
      toastError("Couldn't upload that image, and it's too large to store in this browser. Try again in a moment.")
      return
    }
    toastError("Couldn't upload that image, it's stored in this browser instead.")
    embedImageAsDataUrl(editor, file)
  }
}

export default function NoteDocument({ noteId, initialContent, onChange, autoFocus }) {
  const initial = useRef(initialContent) // captured once — never re-set (would reset the caret)
  const onChangeRef = useRef(onChange)
  // ProseMirror's paste/drop handlers are built once when the editor is created,
  // so reading `noteId` directly inside them would pin the value from that first
  // render. Uploads are keyed by note id, and a stale one files the image under
  // the wrong note — invisible until something tries to clean up by prefix.
  const noteIdRef = useRef(noteId)
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const editorRef = useRef(null)
  const mathClickRef = useRef(null)
  const onDeadLinkRef = useRef(null)
  const [confirm, confirmEl] = useConfirm()

  // renderHTML can only judge a link by whether it stored a note id, but a bare
  // `[[Label]]` still resolves if some note carries that title. Re-check against
  // live titles after every render so "unresolved" styling tells the truth.
  const syncWikiLinkStates = useCallback((ed) => {
    const root = ed?.view?.dom
    if (!root) return
    for (const el of root.querySelectorAll('a[data-type="wiki-link"]')) {
      const resolved = Boolean(
        resolveWikiTarget(el.getAttribute('data-note-id') || null, el.getAttribute('data-label') || ''),
      )
      el.classList.toggle('is-unresolved', !resolved)
      el.title = resolved ? 'Open linked note' : 'No note with this title yet, click to create it'
    }
  }, [])

  // Equation editor session: null | {mode:'insert'|'edit', display, latex, pos, typeName}
  const [mathEdit, setMathEdit] = useState(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    noteIdRef.current = noteId
  }, [noteId])

  const closeMath = useCallback(() => setMathEdit(null), [])
  const handlePickImage = useCallback(() => fileRef.current?.click(), [])
  const handleInsertEquation = useCallback(
    () => setMathEdit({ mode: 'insert', display: 'block', latex: '', seq: Date.now() }),
    [],
  )

  // Clicking a dead `[[link]]` offers to create the note it points at, then
  // binds the link to the new note's id so it stays resolved through renames.
  useEffect(() => {
    onDeadLinkRef.current = async (label, nodePos) => {
      const title = (label || '').trim()
      if (!title) return
      const ok = await confirm({
        title: `Create "${title}"?`,
        message: 'No note has this title yet. Creating one links it here and opens it.',
        confirmLabel: 'Create note',
      })
      if (!ok) return
      const created = createNote({ title })
      const editor = editorRef.current
      if (editor && typeof nodePos === 'number') {
        editor
          .chain()
          .command(({ tr }) => {
            if (tr.doc.nodeAt(nodePos)) tr.setNodeAttribute(nodePos, 'noteId', created.id)
            return true
          })
          .run()
      }
      // Let the binding land in the parent's state before leaving. Navigating in
      // the same tick makes its save-on-exit flush the pre-binding content, since
      // that runs before the effect which refreshes the parent's note ref. (The
      // link would still resolve by title — this just keeps the id binding too.)
      setTimeout(() => navigate(`/notebook/${created.id}`), 0)
    }
  }, [confirm, navigate])

  // Clicking a rendered math node opens the editor on it.
  useEffect(() => {
    mathClickRef.current = (node, pos) =>
      setMathEdit({
        mode: 'edit',
        display: node.type.name === 'inlineMath' ? 'inline' : 'block',
        latex: node.attrs?.latex || '',
        pos,
        typeName: node.type.name,
        seq: Date.now(),
      })
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: "Write, or press '/' for blocks · '[[' to link a note",
      }),
      // The extension has no built-in editor — route clicks (on both block and
      // inline math) to our popover. onClick lives under block/inlineOptions, not
      // at the top level. The ref is only read inside the click handler (a user
      // action), never in render.
      // eslint-disable-next-line react-hooks/refs
      Mathematics.configure({
        katexOptions: { macros: KATEX_MACROS, throwOnError: false },
        blockOptions: { onClick: (node, pos) => mathClickRef.current?.(node, pos) },
        inlineOptions: { onClick: (node, pos) => mathClickRef.current?.(node, pos) },
      }),
      Highlight,
      MdTaskList,
      MdTaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      // Tables: resizable columns, header row, and PM handles the drag/drop of
      // rows and columns natively. The Markdown extension already emits GFM
      // pipe tables for these nodes on export.
      Table.configure({ resizable: true, HTMLAttributes: { class: 'nb-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      WikiLink,
      Callout,
      RunnableCode,
      CircuitNode,
      SketchNode,
      DataPlotNode,
      WikiSuggestion.configure({ getNotes: () => listNotes() }),
      // eslint-disable-next-line react-hooks/refs
      SlashCommand.configure({ onPickImage: handlePickImage, onInsertEquation: handleInsertEquation }),
      Markdown,
    ],
    autofocus: autoFocus ? 'end' : false,
    content: '',
    editorProps: {
      attributes: { class: 'nb-prose nb-doc-prose' },
      handleClickOn: (view, pos, node, nodePos, event) => {
        if (node.type.name !== 'wikiLink') return false
        event.preventDefault()
        const { label, noteId } = node.attrs
        const target = resolveWikiTarget(noteId, label)
        if (target) {
          navigate(`/notebook/${target.id}`)
          return true
        }
        // Dead link. It used to dump the user on a search page that, by
        // definition, found nothing — offer to create the note instead.
        onDeadLinkRef.current?.(label || '', nodePos)
        return true
      },
      handlePaste: (view, event) => {
        const img = Array.from(event.clipboardData?.files || []).find((f) => f.type.startsWith('image/'))
        if (img && editorRef.current) {
          event.preventDefault()
          insertImageFile(editorRef.current, img, noteIdRef.current)
          return true
        }
        return false
      },
      handleDrop: (view, event) => {
        const img = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'))
        if (img && editorRef.current) {
          event.preventDefault()
          insertImageFile(editorRef.current, img, noteIdRef.current)
          return true
        }
        return false
      },
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor
      const manager = editor.storage.markdown?.manager
      if (!manager) return
      try {
        editor.commands.setContent(blocksToDoc(manager, initial.current), { emitUpdate: false })
      } catch {
        /* leave the empty doc if the stored content can't be parsed */
      }
      syncWikiLinkStates(editor)
    },
    onUpdate: ({ editor }) => {
      syncWikiLinkStates(editor)
      const manager = editor.storage.markdown?.manager
      if (!manager) return
      onChangeRef.current?.(docToBlocks(manager, editor.getJSON()))
    },
  })

  const onFilePick = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (file && editor) insertImageFile(editor, file, noteIdRef.current)
      e.target.value = ''
    },
    [editor],
  )

  const submitMath = (latex) => {
    if (!editor || !mathEdit) return
    if (mathEdit.mode === 'insert') {
      const chain = editor.chain().focus()
      if (mathEdit.display === 'inline') chain.insertInlineMath({ latex }).run()
      else chain.insertBlockMath({ latex }).run()
    } else {
      const { pos } = mathEdit
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          if (tr.doc.nodeAt(pos)) tr.setNodeAttribute(pos, 'latex', latex)
          return true
        })
        .run()
    }
    setMathEdit(null)
  }

  const deleteMath = () => {
    if (editor && mathEdit?.mode === 'edit') {
      const { pos } = mathEdit
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(pos)
          if (node) tr.delete(pos, pos + node.nodeSize)
          return true
        })
        .run()
    }
    setMathEdit(null)
  }

  return (
    <div className="nb-doc">
      {editor && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          shouldShow={({ editor, state }) =>
            editor.isEditable &&
            !state.selection.empty &&
            !editor.isActive('image') &&
            !editor.isActive('runnableCode') &&
            !editor.isActive('circuitNode') &&
            !editor.isActive('codeBlock')
          }
        >
          <BubbleToolbar editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className="nb-doc-content" />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFilePick} />
      {mathEdit && (
        <MathPopover key={mathEdit.seq} state={mathEdit} onSubmit={submitMath} onDelete={deleteMath} onClose={closeMath} />
      )}
      {confirmEl}
    </div>
  )
}
