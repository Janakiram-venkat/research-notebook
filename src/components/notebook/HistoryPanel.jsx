// Version history for one note.
//
// Two things this panel deliberately does NOT do:
//
//   - It never restores without first snapshotting what is on screen. Restoring
//     is itself a destructive edit, and an undo button that cannot be undone is
//     how people lose the thing they were trying to protect.
//   - It never reports an empty history when the request failed. `listVersions`
//     returns an explicit error for exactly that reason — telling someone their
//     safety net is empty when it is merely unreachable is the worse lie.

import { useEffect, useState } from 'react'
import { History, X, RotateCcw, FilePlus2, Loader2, TriangleAlert } from 'lucide-react'
import { listVersions, describeReason } from '../../lib/notebook/versions.js'
import MarkdownView from './MarkdownView.jsx'

function relativeTime(ts) {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

function exactTime(ts) {
  return new Date(ts).toLocaleString()
}

function wordCount(content) {
  const text = (content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.markdown || '')
    .join(' ')
    .trim()
  return text ? text.split(/\s+/).filter(Boolean).length : 0
}

// Compact read-only rendering of a stored version. Mirrors PrintDocument's
// shape rather than mounting the real editor: this is a thing to look at before
// deciding, not a thing to edit.
function VersionPreview({ version }) {
  return (
    <div className="nb-history-preview-body">
      {(version.content || []).map((block) => {
        if (block.type === 'text') {
          return (
            <div key={block.id} className="nb-history-preview-block">
              <MarkdownView markdown={block.markdown || ''} />
            </div>
          )
        }
        if (block.type === 'code') {
          return (
            <div key={block.id} className="nb-history-preview-block">
              <p className="nb-history-preview-label">Code · {block.framework || 'python'}</p>
              <pre className="nb-history-preview-code">{block.code || '# Empty code block'}</pre>
            </div>
          )
        }
        return (
          <div key={block.id} className="nb-history-preview-block">
            <p className="nb-history-preview-label">
              Circuit{block.name ? ` · ${block.name}` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default function HistoryPanel({ noteId, onClose, onRestore, onCopy }) {
  const [state, setState] = useState({ loading: true, versions: [], error: null })
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    listVersions(noteId).then(({ versions, error }) => {
      if (cancelled) return
      setState({ loading: false, versions, error })
      if (versions.length > 0) setSelectedId(versions[0].id)
    })
    return () => { cancelled = true }
  }, [noteId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selected = state.versions.find((v) => v.id === selectedId) || null

  async function handleRestore() {
    if (!selected || busy) return
    setBusy(true)
    await onRestore(selected)
    setBusy(false)
  }

  return (
    <div className="nb-modal-backdrop" onClick={onClose}>
      <div className="nb-modal nb-history-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Version history">
        <div className="nb-modal-head">
          <div>
            <h2><History size={17} /> Version history</h2>
            <p className="nb-modal-sub">
              A snapshot is kept the first time you open this note each day, and before anything
              that would overwrite it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {state.loading && (
          <div className="nb-history-empty">
            <Loader2 size={16} className="animate-spin" /> Loading history…
          </div>
        )}

        {/* An error is not an empty history, and must not read like one. */}
        {!state.loading && state.error && (
          <div className="nb-history-empty nb-history-error">
            <TriangleAlert size={16} />
            <span>
              Couldn’t load version history, {state.error}. Your note itself is unaffected.
            </span>
          </div>
        )}

        {!state.loading && !state.error && state.versions.length === 0 && (
          <div className="nb-history-empty">
            No earlier versions yet. The first one is saved next time you open this note on a new day,
            or right now via “Save a version”.
          </div>
        )}

        {!state.loading && !state.error && state.versions.length > 0 && (
          <div className="nb-history-body">
            <ul className="nb-history-list">
              {state.versions.map((v) => (
                <li key={v.id}>
                  <button
                    className={`nb-history-item${v.id === selectedId ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                    title={exactTime(v.createdAt)}
                  >
                    <span className="nb-history-when">{relativeTime(v.createdAt)}</span>
                    <span className="nb-history-reason">{describeReason(v.reason)}</span>
                    <span className="nb-history-meta">{wordCount(v.content)} words</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="nb-history-preview">
              {selected && (
                <>
                  <div className="nb-history-preview-head">
                    <div>
                      <strong>{selected.title || 'Untitled note'}</strong>
                      <span className="nb-history-meta">{exactTime(selected.createdAt)}</span>
                    </div>
                    <div className="nb-history-actions">
                      <button className="nb-history-btn" onClick={() => onCopy(selected)} disabled={busy}>
                        <FilePlus2 size={14} /> Copy as new note
                      </button>
                      <button className="nb-history-btn is-primary" onClick={handleRestore} disabled={busy}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Restore this version
                      </button>
                    </div>
                  </div>
                  <VersionPreview version={selected} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
