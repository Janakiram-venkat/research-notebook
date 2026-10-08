import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue, memo, lazy, Suspense } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Plus, X, Check,
  Folder, Copy, Star, Download, Printer, ClipboardCheck, MoreHorizontal,
  ListTree, Command, Keyboard, FileText, History, Save, Link2, Link2Off,
  FlaskConical, Share2, PenLine, Maximize2, Minimize2, Bot,
} from 'lucide-react'
import { AGENT_PRESETS, askAgent } from '../lib/agentPresets.js'
import { layoutMindMap, mindMapToMarkdown, normalizeMindMap } from '../lib/notebook/mindmap.js'
import MindMapSvg from '../components/notebook/MindMapSvg.jsx'
import {
  getNote, createNote, updateNote, deleteNote, duplicateNote, restoreNote,
  allFolders, allTags, listNotes, pushRecentNote, syncWithRemote, fetchNoteRemote, DEFAULT_FOLDER,
} from '../lib/notebook/notebookStore.js'
import { TEMPLATES } from '../lib/notebook/templates.js'
import { extractOutline, tagColor, findBacklinks } from '../lib/notebook/noteUtils.js'
import MarkdownView from '../components/notebook/MarkdownView.jsx'
import CommandPalette from '../components/notebook/CommandPalette.jsx'
import OutlinePanel from '../components/notebook/OutlinePanel.jsx'
import ShortcutsHelp from '../components/notebook/ShortcutsHelp.jsx'
import BacklinksPanel from '../components/notebook/BacklinksPanel.jsx'
import HistoryPanel from '../components/notebook/HistoryPanel.jsx'
import { saveVersion, maybeSaveDailyVersion } from '../lib/notebook/versions.js'
import { resolveAttachment } from '../lib/notebook/attachments.js'
import ReportView from '../components/notebook/ReportView.jsx'
import { buildReport, reportToMarkdown } from '../lib/notebook/report.js'
import { getShare, publishShare, revokeShare, shareUrl } from '../lib/notebook/sharing.js'
import { useSessionUser } from '../lib/useSessionUser.js'
import ToastHost from '../components/notebook/ui/ToastHost.jsx'
import { toast, toastSuccess, toastError } from '../components/notebook/ui/toast.js'
import { useConfirm } from '../components/notebook/ui/useConfirm.jsx'
import '../components/notebook/notebook.css'

// The whole-note editor embeds heavy libraries (TipTap, Monaco, KaTeX). Code-split
// it so the note shell loads first and the editor streams in on demand.
const NoteDocument = lazy(() => import('../components/notebook/NoteDocument.jsx'))

function countWords(note) {
  const text = (note?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.markdown || '')
    .join('\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+?\$/g, ' ')
    .replace(/[#>*_`[\](){}\\|-]/g, ' ')
    .trim()

  return text ? text.split(/\s+/).filter(Boolean).length : 0
}

function noteToMarkdown(note) {
  if (!note) return ''

  const lines = [`# ${note.title || 'Untitled note'}`]

  if (note.folder) lines.push('', `Folder: ${note.folder}`)
  if (note.tags?.length) lines.push('', `Tags: ${note.tags.map((t) => `#${t}`).join(' ')}`)

  for (const block of note.content || []) {
    lines.push('')

    if (block.type === 'text') {
      lines.push(block.markdown || '')
      continue
    }

    if (block.type === 'code') {
      lines.push(`\`\`\`${block.framework || 'python'}`)
      lines.push(block.code || '')
      lines.push('```')
      continue
    }

    if (block.type === 'sketch' && block.src) {
      lines.push(`![Sketch](${block.src})`)
      continue
    }

    if (block.type === 'mindmap') {
      lines.push(mindMapToMarkdown(normalizeMindMap(block.root)))
      continue
    }

    if (block.type === 'diagram') {
      lines.push('```mermaid', block.code || '', '```')
      continue
    }

    if (block.type === 'plot') {
      const meta = []
      if (block.title) meta.push(`title: ${block.title}`)
      if (block.kind) meta.push(`kind: ${block.kind}`)
      if (block.xLabel) meta.push(`xLabel: ${block.xLabel}`)
      if (block.yLabel) meta.push(`yLabel: ${block.yLabel}`)
      lines.push('```csv')
      if (meta.length) lines.push(`# ${meta.join(' | ')}`)
      if (block.data) lines.push(block.data.trimEnd())
      lines.push('```')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function safeFilename(title) {
  return (title || 'note')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'note'
}

function deriveTitleFromContent(content = []) {
  for (const block of content) {
    if (block.type !== 'text' || !block.markdown) continue
    const heading = block.markdown
      .split('\n')
      .map((line) => line.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim())
      .find(Boolean)

    if (heading) return heading.slice(0, 80)
  }
  return ''
}

// Print-only mirror of the note. It stays mounted (see the render site) so the
// browser's native print works, and is memoized + fed a deferred note so
// re-rendering it never blocks typing in the editor.
const PrintDocument = memo(function PrintDocument({ note, wordTotal }) {
  if (!note) return null

  return (
    <article className="nb-print-document" aria-hidden="true">
      <header className="nb-print-header">
        <p>Research Notebook</p>
        <h1>{note.title || 'Untitled note'}</h1>
        <div>
          <span>{note.folder || DEFAULT_FOLDER}</span>
          <span>{wordTotal} words</span>
          {note.tags?.length > 0 && <span>{note.tags.map((tag) => `#${tag}`).join(' ')}</span>}
        </div>
      </header>

      {(note.content || []).map((block) => {
        if (block.type === 'text') {
          return (
            <section key={block.id} className="nb-print-block">
              <MarkdownView markdown={block.markdown || ''} />
            </section>
          )
        }

        if (block.type === 'code') {
          return (
            <section key={block.id} className="nb-print-block">
              <p className="nb-print-block-label">Code · {block.framework || 'python'}</p>
              <pre className="nb-print-code">{block.code || '# Empty code block'}</pre>
              {block.lastResult?.output && (
                <>
                  <p className="nb-print-block-label">Output</p>
                  <pre className="nb-print-code">{block.lastResult.output}</pre>
                </>
              )}
            </section>
          )
        }

        if (block.type === 'mindmap') {
          return (
            <section key={block.id} className="nb-print-block">
              <p className="nb-print-block-label">Mind map</p>
              <MindMapSvg layout={layoutMindMap(normalizeMindMap(block.root))} />
            </section>
          )
        }

        if (block.type === 'diagram') {
          return (
            <section key={block.id} className="nb-print-block">
              <p className="nb-print-block-label">Diagram</p>
              <pre className="nb-print-code">{block.code}</pre>
            </section>
          )
        }

        if (block.type === 'sketch' && block.src) {
          return (
            <section key={block.id} className="nb-print-block">
              <p className="nb-print-block-label">Sketch</p>
              <img src={block.src} alt="Sketch" className="nb-print-sketch" />
            </section>
          )
        }

        if (block.type === 'plot') {
          return (
            <section key={block.id} className="nb-print-block">
              <p className="nb-print-block-label">Plot{block.title ? ` · ${block.title}` : ''}</p>
              <pre className="nb-print-code">{block.data || '(no data)'}</pre>
            </section>
          )
        }

        return null
      })}
    </article>
  )
})

// The route reuses this page across `:id` changes (wiki-links, backlinks, command
// palette). Keying the inner component by id remounts it per note, so its state
// starts from that note instead of being reset by an effect.
export default function NotebookNote() {
  const { id } = useParams()
  return <NotebookNoteInner key={id} id={id} />
}

function NotebookNoteInner({ id }) {
  const navigate = useNavigate()

  const [confirm, confirmEl] = useConfirm()
  const [note, setNote] = useState(() => getNote(id))
  // True while we're still checking Supabase for a note this browser hasn't
  // synced locally yet (e.g. a link followed on a device that never opened
  // the dashboard). Guards the "redirect if missing" effect below from firing
  // before that check resolves.
  const [checkingRemote, setCheckingRemote] = useState(() => !getNote(id))
  const [tagDraft, setTagDraft] = useState('')
  const [folderDraft, setFolderDraft] = useState(() => getNote(id)?.folder || DEFAULT_FOLDER)
  // Starts at 'saved': a freshly opened note matches storage by definition, and
  // now that autosave no longer fires on open, nothing else would clear 'idle'.
  const [saveState, setSaveState] = useState('saved') // idle | saving | saved | error
  const [printRequested, setPrintRequested] = useState(false)
  const [copiedMarkdown, setCopiedMarkdown] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Report mode is a *view*, never an editing surface — the note itself is
  // untouched by it, which is why this is plain local state and not persisted.
  const [reportMode, setReportMode] = useState(false)
  const [share, setShare] = useState(null) // { slug } once published
  const [sharing, setSharing] = useState(false)
  const signedIn = Boolean(useSessionUser())
  // Open by default only where the rail sits beside the text. Narrower than that
  // it overlays the note, so it should be opt-in via the toggle.
  const [showOutline, setShowOutline] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1280,
  )
  // Focus mode hides every piece of chrome that isn't the title or the editor,
  // so a session that ended up as "twelve icons around a paragraph" can shrink
  // to a paragraph. Persisted so a reader who works this way is not made to
  // toggle it back on every visit. Off on a fresh browser.
  const [focusMode, setFocusMode] = useState(() => {
    try { return localStorage.getItem('qcb.notebook.focus') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('qcb.notebook.focus', focusMode ? '1' : '0') } catch { /* private mode */ }
  }, [focusMode])
  const saveTimer = useRef(null)
  const titleEditedRef = useRef(false)
  // True between an edit and the autosave that persists it. While it's set we
  // never adopt a remote version — the user's in-flight typing outranks it.
  const dirtyRef = useRef(false)
  // `epoch` is bumped when we adopt content from another device; it's part of the
  // editor's key, so the editor actually reloads instead of silently keeping (and
  // then re-saving) the stale document it captured on mount. `adoptedId` records
  // which note that was, so a reload the user didn't ask for doesn't grab the
  // caret — while opening a note still does.
  const [editorReload, setEditorReload] = useState({ epoch: 0, adoptedId: null })

  // Everything below the editor — word count, outline, the print mirror — is
  // read-only chrome that doesn't need to be frame-exact with the caret. Deriving
  // it from a deferred copy of the note keeps that work off the typing path;
  // React renders it at low priority once keystrokes settle.
  const deferredNote = useDeferredValue(note)
  const wordTotal = useMemo(() => countWords(deferredNote), [deferredNote])
  const outline = useMemo(() => extractOutline(deferredNote), [deferredNote])
  // Whether there is anything here worth exporting or publishing. A note is
  // created empty and the reader's first act is to type into it, so offering
  // "Export PDF" and "Share as a report" on that blank page is offering to
  // hand someone a blank page. Any word, any code is enough.
  const hasSubstance = useMemo(
    () =>
      wordTotal > 0 ||
      (deferredNote?.content || []).some(
        (b) => b.type === 'code' && b.code?.trim(),
      ),
    [deferredNote, wordTotal],
  )

  // Backlinks depend on the *other* notes and on this note's identity — never on
  // its body. Scanning every note's markdown on each keystroke (the old `[note]`
  // dep) was pure waste; a title edit is the only local change that can affect
  // the result, since unresolved links match on title.
  const backlinks = useMemo(
    () => (note ? findBacklinks({ id: note.id, title: note.title }, listNotes()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- body changes can't alter this note's backlinks
    [note?.id, note?.title],
  )

  // Datalist options: per-note, not per-render (folders) and not once-per-mount
  // (tags, which used `[]` and went stale for the whole session).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when the open note changes
  const folderOptions = useMemo(() => allFolders(listNotes()), [id])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when the open note changes
  const tagOptions = useMemo(() => allTags(listNotes()), [id])

  // Latest note, readable from async callbacks without re-running their effects.
  const noteRef = useRef(note)
  useEffect(() => {
    noteRef.current = note
  }, [note])

  // Track this note as recently opened (for the dashboard's Recent list).
  useEffect(() => {
    if (id) pushRecentNote(id)
  }, [id])

  // A note this browser has not seen (e.g. a link followed on a device that never
  // opened the dashboard) is looked up remotely once; state already starts right
  // for a note that exists locally.
  useEffect(() => {
    // The outgoing note was flushed by the cleanup above; clear the flag so a failed
    // flush can't make this note look unsaved and get rewritten on first render.
    dirtyRef.current = false
    if (getNote(id)) return undefined
    let cancelled = false
    fetchNoteRemote(id).then((remote) => {
      if (cancelled) return
      setCheckingRemote(false)
      if (remote) {
        setNote(remote)
        setFolderDraft(remote.folder || DEFAULT_FOLDER)
      }
    })
    return () => { cancelled = true }
  }, [id])

  // Signed-in users: catch edits made on another device to the note already open
  // here. Adopting one means reloading the editor (see editorReload) — updating
  // `note` alone left the editor holding the old document, which the next
  // keystroke then wrote back over the newer remote version.
  useEffect(() => {
    let cancelled = false
    syncWithRemote().then(({ synced, conflicts }) => {
      if (cancelled || !synced) return

      // A divergence on the note currently open is the one case the user has to
      // hear about immediately — their editor still holds the local side, and
      // the other device's version now exists as a separate note they'd
      // otherwise never think to look for.
      const mine = (conflicts || []).find((c) => c.id === id)
      if (mine) {
        toast('This note was also edited on another device. Your version is open; the other was saved beside it.', {
          tone: 'error',
          duration: 12000,
          action: { label: 'Open the other version', run: () => navigate(`/notebook/${mine.conflictId}`) },
        })
        return // don't also adopt below — local deliberately won
      }

      const fresh = getNote(id)
      const cur = noteRef.current
      if (!fresh || !cur || cur.id !== fresh.id) return
      if ((fresh.updatedAt || 0) <= (cur.updatedAt || 0)) return
      // Unsaved local edits win: replacing the doc under the caret would lose
      // what the user is typing. Their save will push and become the newer side.
      if (dirtyRef.current) return
      setNote(fresh)
      setFolderDraft(fresh.folder || DEFAULT_FOLDER)
      titleEditedRef.current = false
      setEditorReload((r) => ({ epoch: r.epoch + 1, adoptedId: fresh.id }))
      toastSuccess('Loaded newer changes to this note from another device')
    })
    return () => { cancelled = true }
  }, [id, navigate])

  // The assistant writes to notes on the server; applyRemoteNotes() puts the result
  // in the local store and fires nb:notes-changed. If the open note was one of them
  // and there are no unsaved edits here, show the new text now, after snapshotting
  // the old text so "Undo" (or History) can bring it back.
  useEffect(() => {
    let busy = false
    const onChanged = async () => {
      if (busy) return
      const fresh = getNote(id)
      const cur = noteRef.current
      if (!fresh || !cur || cur.id !== fresh.id) return
      if ((fresh.updatedAt || 0) <= (cur.updatedAt || 0)) return
      if (dirtyRef.current) return
      busy = true
      try {
        await saveVersion(cur, 'pre-agent')
        setNote(fresh)
        setFolderDraft(fresh.folder || DEFAULT_FOLDER)
        setEditorReload((r) => ({ epoch: r.epoch + 1, adoptedId: fresh.id }))
        toast('The assistant added to this note.', {
          duration: 9000,
          action: {
            label: 'Undo',
            run: () => {
              const back = updateNote(id, { title: cur.title, content: cur.content })
              if (!back) return
              dirtyRef.current = false
              setNote(back)
              setEditorReload((r) => ({ epoch: r.epoch + 1, adoptedId: back.id }))
            },
          },
        })
      } finally {
        busy = false
      }
    }
    window.addEventListener('nb:notes-changed', onChanged)
    return () => window.removeEventListener('nb:notes-changed', onChanged)
  }, [id])

  // The day's first snapshot, taken when the note is opened rather than when it
  // is saved: what someone reaching for history wants back is the note as it was
  // before today's editing, not after it.
  //
  // Depends on `note`, not just `id`, because a note followed by link on a fresh
  // device isn't in local storage yet — it arrives from Supabase a moment later,
  // and an `[id]`-only effect would have already run against null and never
  // fire again. The ref makes every later run (one per keystroke) a no-op, so
  // what gets captured is still the opened state.
  const dailySnapshotRef = useRef(null)
  useEffect(() => {
    if (!note || note.id !== id) return
    if (dailySnapshotRef.current === id) return
    dailySnapshotRef.current = id
    maybeSaveDailyVersion(note)
  }, [id, note])

  // Does this note already have a live share link? Answered on open so the menu
  // can offer "Copy link" / "Update" instead of "Share" without a round trip at
  // the moment the user reaches for it.
  useEffect(() => {
    if (!signedIn || !id) return
    let cancelled = false
    getShare(id).then((found) => { if (!cancelled) setShare(found) })
    return () => { cancelled = true }
  }, [signedIn, id])

  // Outline items are derived from the same content in document order, so match
  // them positionally against the headings rendered in the single editor.
  const jumpToOutline = useCallback((item) => {
    const headings = [...document.querySelectorAll('.nb-doc-prose h1, .nb-doc-prose h2, .nb-doc-prose h3')]
    const idx = outline.indexOf(item)
    const el = (idx >= 0 && headings[idx]) || headings.find((h) => h.textContent.trim() === item.text)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [outline])

  // Close the actions menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e) {
      if (!e.target.closest?.('.nb-more-menu')) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // Redirect if the note doesn't exist — but only after the remote check
  // above (if any) has had a chance to resolve.
  useEffect(() => {
    if (!note && !checkingRemote) navigate('/notebook', { replace: true })
  }, [note, checkingRemote, navigate])

  // A single place that persists the note and reports whether the write landed.
  // updateNote returns null when localStorage rejected the write (quota full),
  // which we surface instead of the old silent "Saved" lie.
  const persist = useCallback((n) => {
    const ok = updateNote(n.id, {
      title: n.title,
      content: n.content,
      tags: n.tags,
      folder: n.folder || DEFAULT_FOLDER,
      pinned: Boolean(n.pinned),
    })
    if (ok) {
      dirtyRef.current = false
      setSaveState('saved')
    } else {
      setSaveState('error')
      toastError('Could not save, browser storage is full. Export this note (⋯ → Export .md) to keep it safe.')
    }
    return Boolean(ok)
  }, [])

  const saveNow = useCallback(() => {
    if (note) persist(note)
  }, [note, persist])

  // Autosave — but only for changes the user actually made. This effect also runs
  // on mount and whenever a note is loaded or adopted from sync, and saving then
  // rewrote the note, bumped `updatedAt` and pushed it to Supabase just for being
  // opened. `dirtyRef` is set by the edit paths (patchNote / handleContentChange).
  useEffect(() => {
    if (!note || !dirtyRef.current) return
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(note), 400)
    return () => clearTimeout(saveTimer.current)
  }, [note, persist])

  // Leaving a note inside the 400ms autosave window used to drop the edit: the
  // effect above clears its timer and nothing else wrote it. Keyed on `id` so the
  // cleanup fires both on unmount and when navigating note→note (wiki-links,
  // backlinks, palette) — that transition was the worse case, because the stale
  // dirty flag then made the *incoming* note absorb the outgoing note's save.
  useEffect(
    () => () => {
      if (dirtyRef.current && noteRef.current) persist(noteRef.current)
    },
    [id, persist],
  )

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveNow()
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        saveNow()
        setPrintRequested(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        // Ctrl+. toggles focus mode. Chosen over Ctrl+Shift+F (find in files
        // reflex in editors) and F11 (fullscreen the browser, not the note).
        e.preventDefault()
        setFocusMode((f) => !f)
      } else if (e.key === 'Escape' && focusMode) {
        // Escape only exits focus when it can, otherwise it belongs to the
        // topmost overlay (history, help, palette).
        if (!historyOpen && !helpOpen && !cmdOpen) {
          setFocusMode(false)
        }
      } else if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        // only when not typing into a field / the editor
        const el = e.target
        const typing = el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName)
        if (!typing) {
          e.preventDefault()
          setHelpOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveNow, focusMode, historyOpen, helpOpen, cmdOpen])

  useEffect(() => {
    if (!printRequested) return
    const timer = window.setTimeout(() => {
      window.print()
      setPrintRequested(false)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [printRequested])

  const patchNote = useCallback((patch) => {
    dirtyRef.current = true
    setNote((n) => (n ? { ...n, ...patch } : n))
  }, [])

  // The single editor emits the whole note's block array on every change. Derive
  // the title from the first heading until the user names the note themselves.
  const handleContentChange = useCallback((content) => {
    dirtyRef.current = true
    setNote((n) => {
      if (!n) return n
      const derivedTitle = deriveTitleFromContent(content)
      const shouldAutoTitle =
        !titleEditedRef.current && derivedTitle && (!n.title || n.title === 'Untitled note')
      return { ...n, content, title: shouldAutoTitle ? derivedTitle : n.title }
    })
  }, [])

  function addTag() {
    const t = tagDraft.trim().toLowerCase()
    if (!t) return
    if (!note.tags.includes(t)) patchNote({ tags: [...note.tags, t] })
    setTagDraft('')
  }

  function removeTag(t) {
    patchNote({ tags: note.tags.filter((x) => x !== t) })
  }

  function applyFolder() {
    const folder = folderDraft.trim() || DEFAULT_FOLDER
    patchNote({ folder })
    setFolderDraft(folder)
  }

  async function handleDeleteNote() {
    const ok = await confirm({
      title: 'Delete this note?',
      message: 'This note and all its blocks will be removed. You can undo this from the notification.',
      confirmLabel: 'Delete note',
      danger: true,
    })
    if (!ok) return
    // Snapshot before deleting so Undo can put the note back under its original
    // id — anything linking to it keeps resolving.
    const snapshot = note
    dirtyRef.current = false // don't let the unmount flush resurrect it
    // deleteNote snapshots to history on its way out — see the store. That copy
    // deliberately outlives the note: the undo toast lasts eight seconds, and
    // this is the safety net for the regret that arrives later.
    deleteNote(note.id)
    navigate('/notebook')
    toast(`Deleted "${snapshot.title || 'Untitled note'}"`, {
      duration: 8000,
      action: {
        label: 'Undo',
        run: () => {
          const back = restoreNote(snapshot)
          if (back) navigate(`/notebook/${back.id}`)
          else toastError("Couldn't restore that note.")
        },
      },
    })
  }

  function togglePin() {
    patchNote({ pinned: !note.pinned })
  }

  // Restoring is itself a destructive edit, so snapshot what's on screen first —
  // an undo that can't be undone is how people lose the thing they were trying
  // to protect. The editor is then remounted via `editorReload`: updating `note`
  // alone leaves TipTap holding the old document, and the next keystroke writes
  // that straight back over the version just restored.
  async function handleRestoreVersion(version) {
    const ok = await confirm({
      title: 'Restore this version?',
      message: 'The note’s current content is saved to history first, so you can undo this.',
      confirmLabel: 'Restore',
    })
    if (!ok) return

    saveNow()
    await saveVersion(noteRef.current, 'pre-restore')

    const restored = updateNote(id, { title: version.title, content: version.content })
    if (!restored) {
      toastError('Could not restore, the note was not saved.')
      return
    }
    dirtyRef.current = false
    setNote(restored)
    titleEditedRef.current = true
    setEditorReload((r) => ({ epoch: r.epoch + 1, adoptedId: restored.id }))
    setHistoryOpen(false)
    toastSuccess('Version restored. The previous content is in history.')
  }

  // Side-by-side comparison without touching the original — the safer option
  // when someone isn't sure which version they want.
  function handleCopyVersion(version) {
    const copy = createNote({
      title: `${version.title || 'Untitled note'} (from history)`,
      content: version.content,
      folder: noteRef.current?.folder || DEFAULT_FOLDER,
      tags: [...(noteRef.current?.tags || [])],
    })
    setHistoryOpen(false)
    navigate(`/notebook/${copy.id}`)
  }

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    try {
      saveNow()
      const { slug, url } = await publishShare(noteRef.current, share?.slug)
      setShare({ slug })
      // Clipboard first, because a link nobody can copy is not a share.
      try {
        await navigator.clipboard.writeText(url)
        toastSuccess('Share link copied to your clipboard.')
      } catch {
        toastSuccess(`Report published at ${url}`)
      }
    } catch (err) {
      // publishShare throws on purpose — see the note in sharing.js. Someone who
      // believes they shared a report will send the link to other people.
      toastError(err?.message || 'Could not publish the share link.')
    } finally {
      setSharing(false)
    }
  }

  async function handleCopyShareLink() {
    if (!share?.slug) return
    try {
      await navigator.clipboard.writeText(shareUrl(share.slug))
      toastSuccess('Share link copied.')
    } catch {
      toastError("Couldn't copy, clipboard blocked.")
    }
  }

  async function handleRevokeShare() {
    if (!share?.slug) return
    const ok = await confirm({
      title: 'Revoke this share link?',
      message: 'Anyone who already has the link will stop being able to open it.',
      confirmLabel: 'Revoke link',
      danger: true,
    })
    if (!ok) return
    try {
      await revokeShare(share.slug)
      setShare(null)
      toastSuccess('Share link revoked.')
    } catch (err) {
      toastError(err?.message || 'Could not revoke the link.')
    }
  }

  async function handleSaveVersion() {
    saveNow()
    const ok = await saveVersion(noteRef.current, 'manual')
    if (ok) toastSuccess('Version saved to history.')
    else toastError('Could not save a version.')
  }

  function handleDuplicate() {
    saveNow()
    const copy = duplicateNote(note.id)
    if (copy) navigate(`/notebook/${copy.id}`)
  }

  // Both exporters follow whichever view is open. Exporting the raw note while
  // report mode is on screen would hand back something that doesn't match what
  // the user is looking at.
  function currentMarkdown() {
    return reportMode ? reportToMarkdown(buildReport(note)) : noteToMarkdown(note)
  }

  async function copyMarkdown() {
    if (!note) return
    const markdown = currentMarkdown()
    try {
      await navigator.clipboard.writeText(markdown)
      setCopiedMarkdown(true)
      toastSuccess('Note copied as Markdown')
      setTimeout(() => setCopiedMarkdown(false), 1600)
    } catch {
      setCopiedMarkdown(false)
      toastError("Couldn't copy, clipboard blocked")
    }
  }

  function exportMarkdown() {
    if (!note) return
    const blob = new Blob([currentMarkdown()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeFilename(note.title)}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toastSuccess('Markdown file downloaded')
  }

  function exportPdf() {
    saveNow()
    setPrintRequested(true)
  }

  const commandItems = useMemo(() => {
    if (!note) return []
    const actions = [
      { key: 'pin', section: 'This note', title: note.pinned ? 'Unpin note' : 'Pin note', Icon: Star, run: togglePin },
      { key: 'dup', section: 'This note', title: 'Duplicate note', Icon: Copy, run: handleDuplicate },
      { key: 'copymd', section: 'This note', title: 'Copy as Markdown', Icon: Copy, run: copyMarkdown },
      { key: 'exportmd', section: 'This note', title: 'Export .md', Icon: Download, run: exportMarkdown },
      { key: 'exportpdf', section: 'This note', title: 'Export PDF', hint: 'Ctrl+Shift+P', Icon: Printer, run: exportPdf },
      { key: 'outline', section: 'This note', title: showOutline ? 'Hide outline' : 'Show outline', Icon: ListTree, run: () => setShowOutline((o) => !o) },
      ...AGENT_PRESETS.map((p) => ({ key: `ask-${p.key}`, section: 'This note', title: p.label, Icon: Bot, run: () => askAgent(p) })),
      { key: 'help', section: 'This note', title: 'Keyboard shortcuts', hint: '?', Icon: Keyboard, run: () => setHelpOpen(true) },
      { key: 'delete', section: 'This note', title: 'Delete note', Icon: Trash2, run: handleDeleteNote },
    ]
    const create = [
      { key: 'new-blank', section: 'Create', title: 'New blank note', Icon: Plus, run: () => navigate(`/notebook/${createNote({ folder: note.folder }).id}`) },
      ...TEMPLATES.map((t) => ({
        key: `new-${t.id}`, section: 'Create', title: `New: ${t.label}`, hint: t.description, Icon: Plus,
        run: () => navigate(`/notebook/${createNote({ ...t.build(), templateType: t.id }).id}`),
      })),
    ]
    // No slice — the palette filters the full list and caps only what it renders.
    const openNotes = listNotes()
      .filter((n) => n.id !== note.id)
      .map((n) => ({
        key: `open-${n.id}`, section: 'Open note', title: n.title || 'Untitled note', hint: n.folder, Icon: FileText, keywords: (n.tags || []).join(' '),
        run: () => navigate(`/notebook/${n.id}`),
      }))
    return [...actions, ...create, ...openNotes]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, showOutline])

  const attachment = resolveAttachment(note?.attachedTo)
  // Deferred note, same as the print mirror: projecting on every keystroke
  // while report mode is open would put the whole projection on the typing path.
  const report = useMemo(() => (deferredNote ? buildReport(deferredNote) : null), [deferredNote])

  const saveLabel = {
    idle: 'Editing…',
    saving: 'Saving…',
    // This half is the write to this browser; the pill beside it names where
    // the work has reached ("Saved to cloud", "Waiting to sync", "Saved on this
    // device"). Repeating the scope here would say the same thing twice.
    saved: 'Saved',
    error: 'Save failed',
  }[saveState]

  if (!note) return null

  // A reading-time estimate for the topbar. 200 wpm is the standard prose
  // estimate; below 100 words the number rounds to nothing useful, and above
  // that a "~ N min read" chip is exactly the signal a reader wants beside
  // the word count.
  const readingMin = wordTotal >= 100 ? Math.max(1, Math.round(wordTotal / 200)) : 0

  return (
    <div className={`nb-note-page nb-note-page-pro${focusMode ? ' is-focus' : ''}`}>
      {focusMode && (
        <button
          className="nb-focus-exit"
          onClick={() => setFocusMode(false)}
          title="Exit focus mode (Esc)"
          aria-label="Exit focus mode"
        >
          <Minimize2 size={13} /> Exit focus
        </button>
      )}
      <div className="nb-note-topbar">
        <Link to="/notebook" className="nb-back-link">
          <ArrowLeft size={15} /> All notes
        </Link>
        <div className="nb-note-topbar-right">
          <span className={`nb-saved-hint nb-saved-${saveState}`}>{saveLabel}</span>
          <span className="nb-topbar-count">{wordTotal} words</span>
          {readingMin > 0 && (
            <span className="nb-topbar-count nb-topbar-read" title="Reading time at 200 words per minute">
              ~{readingMin} min read
            </span>
          )}
          <button
            className="nb-icon-btn"
            onClick={() => setFocusMode(true)}
            title="Focus mode (Ctrl+.)"
            aria-label="Enter focus mode"
          >
            <Maximize2 size={17} />
          </button>
          <button
            className={`nb-icon-btn${reportMode ? ' is-open' : ''}`}
            onClick={() => setReportMode((r) => !r)}
            title={reportMode ? 'Back to editing' : 'View as a lab report'}
            aria-pressed={reportMode}
            aria-label={reportMode ? 'Back to editing' : 'View as a lab report'}
          >
            {reportMode ? <PenLine size={17} /> : <FlaskConical size={17} />}
          </button>
          {/* Report mode is where someone is deciding whether this is
              finished, so the two things they do next belong on screen rather
              than three clicks into a menu. They stay in the menu too, for the
              editing view. */}
          {reportMode && hasSubstance && (
            <>
              <button className="nb-topbar-action" onClick={exportPdf}>
                <Printer size={15} /> Export PDF
              </button>
              {signedIn && (
                <button
                  className="nb-topbar-action"
                  onClick={share ? handleCopyShareLink : handleShare}
                  disabled={sharing}
                >
                  <Share2 size={15} /> {share ? 'Copy link' : 'Share'}
                </button>
              )}
            </>
          )}
          {/* The outline jumps to a heading in the editor, and report mode
              unmounts it. A control that can only fail is worse than one that
              is not there. */}
          {outline.length > 0 && !reportMode && (
            <button className={`nb-icon-btn nb-outline-toggle${showOutline ? ' is-open' : ''}`} onClick={() => setShowOutline((o) => !o)} title="Toggle outline" aria-label="Toggle outline">
              <ListTree size={17} />
            </button>
          )}
          <button className="nb-icon-btn" onClick={() => setCmdOpen(true)} title="Command palette (Ctrl+K)" aria-label="Command palette">
            <Command size={17} />
          </button>
          <button className="nb-icon-btn" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
            <Keyboard size={17} />
          </button>
          <div className="nb-more-menu">
            <button
              className={`nb-icon-btn${menuOpen ? ' is-open' : ''}`}
              onClick={() => setMenuOpen((o) => !o)}
              title="Note actions"
              aria-label="Note actions"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              /* Grouped and gated rather than one flat list of eleven rows.
                 The groups say what kind of action each row is; the gating is
                 what stops the menu offering to export, print or publish a note
                 that has nothing in it yet. */
              <div className="nb-more-pop">
                <span className="nb-more-label">This note</span>
                <button onClick={() => { togglePin(); setMenuOpen(false) }}>
                  <Star size={15} /> {note.pinned ? 'Unpin note' : 'Pin note'}
                </button>
                <button onClick={() => { handleDuplicate() }}>
                  <Copy size={15} /> Duplicate
                </button>

                <div className="nb-more-sep" />
                <span className="nb-more-label">Ask the assistant</span>
                {AGENT_PRESETS.map((p) => (
                  <button key={p.key} onClick={() => { askAgent(p); setMenuOpen(false) }}>
                    <Bot size={15} /> {p.label}
                  </button>
                ))}
                {hasSubstance && (
                  <>
                    <div className="nb-more-sep" />
                    <span className="nb-more-label">Take it with you</span>
                    <button onClick={() => { copyMarkdown() }}>
                      {copiedMarkdown ? <ClipboardCheck size={15} /> : <Copy size={15} />}
                      {copiedMarkdown ? 'Copied' : 'Copy as Markdown'}
                    </button>
                    <button onClick={() => { exportMarkdown(); setMenuOpen(false) }}>
                      <Download size={15} /> Export .md
                    </button>
                    <button onClick={() => { exportPdf(); setMenuOpen(false) }}>
                      <Printer size={15} /> Export PDF
                    </button>
                  </>
                )}

                {/* Sharing publishes a snapshot to a public URL, so it needs an
                    account to own and revoke it. Hidden when signed out for the
                    same reason as version history. Revoking stays available on
                    an emptied note: the published copy is still out there. */}
                {signedIn && (hasSubstance || share) && (
                  <>
                    <div className="nb-more-sep" />
                    <span className="nb-more-label">Share</span>
                    {share ? (
                      <>
                        <button onClick={() => { handleCopyShareLink(); setMenuOpen(false) }}>
                          <Share2 size={15} /> Copy share link
                        </button>
                        <button onClick={() => { handleShare(); setMenuOpen(false) }} disabled={sharing}>
                          <Share2 size={15} /> Update shared copy
                        </button>
                        <button className="nb-more-danger" onClick={() => { setMenuOpen(false); handleRevokeShare() }}>
                          <Link2Off size={15} /> Revoke share link
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { handleShare(); setMenuOpen(false) }} disabled={sharing}>
                        <Share2 size={15} /> Share as a report…
                      </button>
                    )}
                  </>
                )}
                {/* History is server-side, so it exists only for signed-in
                    users — see the note at the top of lib/notebook/versions.js.
                    Hidden rather than disabled: a greyed row with no
                    explanation is worse than no row. */}
                {signedIn && (
                  <>
                    <div className="nb-more-sep" />
                    <span className="nb-more-label">History</span>
                    <button onClick={() => { handleSaveVersion(); setMenuOpen(false) }}>
                      <Save size={15} /> Save a version
                    </button>
                    <button onClick={() => { setHistoryOpen(true); setMenuOpen(false) }}>
                      <History size={15} /> Version history
                    </button>
                  </>
                )}
                <div className="nb-more-sep" />
                <button className="nb-more-danger" onClick={() => { setMenuOpen(false); handleDeleteNote() }}>
                  <Trash2 size={15} /> Delete note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        className="nb-note-title"
        value={note.title}
        onChange={(e) => {
          titleEditedRef.current = true
          patchNote({ title: e.target.value })
        }}
        placeholder="Untitled note"
      />

      {/* Report mode replaces the editing surface rather than sitting beside
          it: the title input, the folder/tag row and the editor all describe a
          note being written, and showing them around a finished report would
          duplicate its title and blur which one you are looking at. The note
          itself is untouched — this is a view. */}
      {reportMode ? (
        <ReportView report={report} showHints />
      ) : (
        <>
        {/* What this note is about, when it was started from a lesson or a lab.
            A lesson that has since left the roster still shows its label — the
            context is worth keeping — but loses the link rather than offering a
            dead one. */}
        {attachment && (
          <div className="nb-attach-chip-row">
            {attachment.href ? (
              <Link to={attachment.href} className="nb-attach-chip" title={`Open this ${attachment.kind}`}>
                <Link2 size={12} aria-hidden="true" />
                <span className="nb-attach-chip-kind">{attachment.kind}</span>
                {attachment.label}
              </Link>
            ) : (
              <span className="nb-attach-chip is-unresolved" title={`This ${attachment.kind} is no longer available`}>
                <Link2Off size={12} aria-hidden="true" />
                <span className="nb-attach-chip-kind">{attachment.kind}</span>
                {attachment.label}
              </span>
            )}
            <button
              className="nb-attach-detach"
              onClick={() => patchNote({ attachedTo: null })}
              title="Detach this note"
              aria-label="Detach this note"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="nb-note-organizer nb-note-organizer-slim">
          <div className="nb-folder-editor">
            <Folder size={13} />
            <input
              list="nb-folder-options"
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              onBlur={applyFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyFolder()
                }
              }}
              placeholder="Folder"
            />
            <datalist id="nb-folder-options">
              {folderOptions.map((folder) => <option key={folder} value={folder} />)}
            </datalist>
          </div>

          <div className="nb-tagbar">
            {note.tags.map((t) => (
              <span key={t} className="nb-tag" style={tagColor(t)}>
                {t}
                <button onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <span className="nb-tag-input-wrap">
              <input
                className="nb-tag-input"
                list="nb-tag-options"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                placeholder="add tag"
              />
              <datalist id="nb-tag-options">
                {tagOptions.map((t) => <option key={t} value={t} />)}
              </datalist>
              {tagDraft && (
                <button className="nb-tag-add" onClick={addTag} aria-label="Add tag">
                  <Check size={12} />
                </button>
              )}
            </span>
          </div>
        </div>

        <Suspense fallback={<div className="nb-editor-skeleton" aria-hidden="true" />}>
          <NoteDocument
            key={`${note.id}:${editorReload.epoch}`}
            noteId={note.id}
            initialContent={note.content}
            onChange={handleContentChange}
            autoFocus={editorReload.adoptedId !== note.id}
          />
        </Suspense>
        </>
      )}

      {historyOpen && (
        <HistoryPanel
          noteId={id}
          onClose={() => setHistoryOpen(false)}
          onRestore={handleRestoreVersion}
          onCopy={handleCopyVersion}
        />
      )}

      <BacklinksPanel links={backlinks} onOpen={(nid) => navigate(`/notebook/${nid}`)} />

      {/* Always mounted (display:none off-print). The print stylesheet hides
          every other element, so if this only rendered on the in-app export the
          browser's own Ctrl+P would print a blank page. */}
      <PrintDocument note={deferredNote} wordTotal={wordTotal} />

      {showOutline && !reportMode && <OutlinePanel items={outline} onJump={jumpToOutline} onClose={() => setShowOutline(false)} />}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={commandItems} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {confirmEl}
      <ToastHost />
    </div>
  )
}
