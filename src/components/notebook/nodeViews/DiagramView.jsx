// Node view for DiagramNode: the rendered diagram, with a source editor that opens
// beside it. Re-renders as you type (debounced); a syntax error keeps the last good
// picture and says what is wrong instead of blanking the block.

import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { Code2, Check, Workflow, Loader2 } from 'lucide-react'
import { renderDiagram, DIAGRAM_EXAMPLES } from '../../../lib/notebook/diagram.js'
import { getResolvedTheme, onThemeChange } from '../../../lib/theme.js'
import ExportMenu from '../ExportMenu.jsx'

// A file name from the diagram: its `title` line if it has one, else its kind.
function diagramName(code) {
  const lines = (code || '').split('\n').map((l) => l.trim())
  const title = lines.find((l) => l.startsWith('title '))
  return title ? title.slice(6) : (lines[0] || 'diagram').split(' ')[0] || 'diagram'
}

export default function DiagramView({ node, updateAttributes, editor, selected }) {
  const code = node.attrs.code || ''
  const editable = editor?.isEditable !== false
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(code)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const textRef = useRef(null)
  const viewRef = useRef(null)
  const [theme, setTheme] = useState(getResolvedTheme)
  useEffect(() => onThemeChange(setTheme), [])

  const source = editing ? draft : code

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const result = await renderDiagram(source, theme)
      if (cancelled) return
      setLoading(false)
      if (result.svg) { setSvg(result.svg); setError('') } else setError(result.error)
    }, editing ? 350 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [source, editing, theme])

  const open = () => { setDraft(code); setEditing(true); setTimeout(() => textRef.current?.focus(), 0) }
  const done = () => { if (draft !== code) updateAttributes({ code: draft }); setEditing(false) }

  return (
    <NodeViewWrapper className={`nb-diagram${selected ? ' is-node-selected' : ''}${editing ? ' is-editing' : ''}`} data-drag-handle="">
      <div className="nb-mm-toolbar" contentEditable={false} data-capture-events="">
        <span className="nb-mm-label"><Workflow size={13} aria-hidden="true" /> Diagram</span>
        <span className="nb-mm-spacer" />
        {svg && !editing && <ExportMenu getSvg={() => viewRef.current?.querySelector('.nb-diagram-svg svg')} name={diagramName(code)} />}
        {editable && (editing ? (
          <button type="button" className="is-primary" onClick={done}><Check size={14} /> Done</button>
        ) : (
          <button type="button" onClick={open}><Code2 size={14} /> Edit</button>
        ))}
      </div>
      <div className="nb-diagram-body" contentEditable={false} data-capture-events="">
        {editing && (
          <div className="nb-diagram-editor">
            <textarea
              ref={textRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); done() }
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const el = e.currentTarget
                  const { selectionStart: s, selectionEnd: en } = el
                  const next = draft.slice(0, s) + '  ' + draft.slice(en)
                  setDraft(next)
                  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2 })
                }
              }}
              spellCheck={false}
              aria-label="Diagram source (Mermaid)"
              rows={Math.min(18, Math.max(6, draft.split('\n').length + 1))}
            />
            <div className="nb-diagram-examples">
              <span>Start from:</span>
              {DIAGRAM_EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" onClick={() => setDraft(ex.code)}>{ex.label}</button>
              ))}
              <a href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noreferrer noopener">Syntax guide</a>
            </div>
          </div>
        )}
        <div className="nb-diagram-view" ref={viewRef} onDoubleClick={editable && !editing ? open : undefined}>
          {loading && !svg && <p className="nb-diagram-status"><Loader2 size={14} className="animate-spin" /> Drawing…</p>}
          {/* Mermaid output, rendered with securityLevel 'strict' (sanitised, no scripts). */}
          {svg && <div className="nb-diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />}
          {error && <p className="nb-diagram-error" role="status">{error}</p>}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
