// Equation editor for the note document.
//
// @tiptap/extension-mathematics renders KaTeX but ships no editing UI — clicking
// a math node only fires an onClick. This popover is that missing editor: it
// opens on click (edit) or from the "/" Equation command (insert), shows a live
// KaTeX preview, and offers a compact symbol palette so formulas are easy to
// write without memorising LaTeX.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import katex from 'katex'
import { Trash2, CornerDownLeft } from 'lucide-react'
import { KATEX_MACROS } from '../../lib/mathNormalize.js'
import { SYMBOL_GROUPS } from './editorActions.js'

function renderPreview(latex, displayMode) {
  const src = (latex || '').trim()
  if (!src) return { html: '', empty: true, error: false }
  try {
    return {
      html: katex.renderToString(src, {
        displayMode,
        throwOnError: false,
        macros: KATEX_MACROS,
      }),
      empty: false,
      error: false,
    }
  } catch {
    return { html: '', empty: false, error: true }
  }
}

// Mounted fresh per session (keyed by the caller), so state initialises from
// props and there's no effect-driven seeding.
export default function MathPopover({ state, onSubmit, onDelete, onClose }) {
  const [latex, setLatex] = useState(state.latex || '')
  const taRef = useRef(null)

  // Focus + place the caret at the end on open.
  useEffect(() => {
    const t = window.setTimeout(() => {
      taRef.current?.focus()
      const end = taRef.current?.value.length ?? 0
      taRef.current?.setSelectionRange(end, end)
    }, 20)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const displayMode = state.display !== 'inline'
  const preview = renderPreview(latex, displayMode)

  const insertSymbol = (tex) => {
    const el = taRef.current
    const start = el ? el.selectionStart : latex.length
    const end = el ? el.selectionEnd : latex.length
    const next = latex.slice(0, start) + tex + latex.slice(end)
    setLatex(next)
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + tex.length
      el?.setSelectionRange(caret, caret)
    })
  }

  const submit = () => {
    const value = latex.trim()
    if (!value) {
      onClose()
      return
    }
    onSubmit(value)
  }

  const onTextareaKeyDown = (e) => {
    // Enter submits; Shift+Enter inserts a newline (multi-line LaTeX).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return createPortal(
    <div className="nb-mathed-backdrop" onMouseDown={onClose}>
      <div className="nb-mathed" role="dialog" aria-label="Equation editor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="nb-mathed-head">
          <span className="nb-mathed-title">{state.mode === 'edit' ? 'Edit equation' : 'Insert equation'}</span>
          <span className="nb-mathed-kind">{displayMode ? 'Display' : 'Inline'}</span>
        </div>

        <div className={`nb-mathed-preview${preview.error ? ' is-error' : ''}`} aria-live="polite">
          {preview.empty ? (
            <span className="nb-mathed-preview-empty">Preview appears here</span>
          ) : preview.error ? (
            <span className="nb-mathed-preview-empty">Incomplete LaTeX…</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: preview.html }} />
          )}
        </div>

        <textarea
          ref={taRef}
          className="nb-mathed-input"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={onTextareaKeyDown}
          spellCheck="false"
          placeholder={"e.g.  \\ket{\\psi} = \\alpha\\ket{0} + \\beta\\ket{1}"}
          rows={3}
        />

        <div className="nb-mathed-symbols">
          {SYMBOL_GROUPS.map((grp) => (
            <div className="nb-mathed-symgroup" key={grp.label}>
              {grp.items.map((item) => (
                <button
                  key={item.tex}
                  type="button"
                  className="nb-mathed-sym"
                  title={item.tex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertSymbol(item.tex)}
                >
                  {item.display}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="nb-mathed-actions">
          {state.mode === 'edit' && (
            <button className="nb-mathed-del" onClick={onDelete} type="button">
              <Trash2 size={14} /> Remove
            </button>
          )}
          <span className="nb-mathed-spacer" />
          <button className="nb-mathed-cancel" onClick={onClose} type="button">Cancel</button>
          <button className="nb-mathed-ok" onClick={submit} type="button">
            {state.mode === 'edit' ? 'Save' : 'Insert'} <CornerDownLeft size={13} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
