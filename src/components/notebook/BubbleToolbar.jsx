// Floating formatting toolbar shown only while text is selected (inside a
// TipTap BubbleMenu). Reuses SYMBOL_GROUPS for the Σ quantum-symbol dropdown.

import { useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Highlighter, Code, Link as LinkIcon,
  Heading1, Heading2, List, ListOrdered, ChevronDown,
} from 'lucide-react'
import { SYMBOL_GROUPS } from './editorActions.js'

function Btn({ title, active, onClick, children }) {
  return (
    <button
      type="button"
      className={`nb-bm-btn${active ? ' is-active' : ''}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function BubbleToolbar({ editor }) {
  const [symOpen, setSymOpen] = useState(false)
  if (!editor) return null

  const cmd = (fn) => fn(editor.chain().focus()).run()

  function setLink() {
    const prev = editor.getAttributes('link').href
    const url = window.prompt('Link URL', prev || 'https://')
    if (url === null) return
    if (url === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().toggleLink({ href: url }).run()
  }

  function wrapSelectionAsMath() {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, ' ')
    editor.chain().focus().deleteSelection().insertInlineMath({ latex: text || 'x' }).run()
  }

  return (
    <div className="nb-bubble-menu">
      <Btn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => cmd((c) => c.toggleBold())}><Bold size={15} /></Btn>
      <Btn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => cmd((c) => c.toggleItalic())}><Italic size={15} /></Btn>
      <Btn title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => cmd((c) => c.toggleUnderline())}><Underline size={15} /></Btn>
      <Btn title="Strikethrough" active={editor.isActive('strike')} onClick={() => cmd((c) => c.toggleStrike())}><Strikethrough size={15} /></Btn>
      <Btn title="Highlight" active={editor.isActive('highlight')} onClick={() => cmd((c) => c.toggleHighlight())}><Highlighter size={15} /></Btn>
      <Btn title="Inline code" active={editor.isActive('code')} onClick={() => cmd((c) => c.toggleCode())}><Code size={15} /></Btn>
      {/* Not Ctrl+K — the notebook binds that to the command palette. */}
      <Btn title="Link" active={editor.isActive('link')} onClick={setLink}><LinkIcon size={15} /></Btn>

      <span className="nb-bm-sep" />

      <Btn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => cmd((c) => c.toggleHeading({ level: 1 }))}><Heading1 size={15} /></Btn>
      <Btn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => cmd((c) => c.toggleHeading({ level: 2 }))}><Heading2 size={15} /></Btn>
      <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => cmd((c) => c.toggleBulletList())}><List size={15} /></Btn>
      <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => cmd((c) => c.toggleOrderedList())}><ListOrdered size={15} /></Btn>

      <span className="nb-bm-sep" />

      <Btn title="Turn selection into an equation" onClick={wrapSelectionAsMath}><span className="nb-bm-glyph">∑</span></Btn>

      <div className="nb-bm-menu">
        <button
          type="button"
          className={`nb-bm-btn nb-bm-btn-wide${symOpen ? ' is-open' : ''}`}
          title="Insert a symbol"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSymOpen((o) => !o)}
        >
          <span className="nb-bm-glyph">Ω</span> <ChevronDown size={12} />
        </button>
        {symOpen && (
          <div className="nb-bm-pop">
            {SYMBOL_GROUPS.map((grp) => (
              <div className="nb-bm-popgroup" key={grp.label}>
                <span className="nb-bm-poplabel">{grp.label}</span>
                <div className="nb-bm-symgrid">
                  {grp.items.map((item) => (
                    <button
                      key={item.tex}
                      type="button"
                      className="nb-bm-sym"
                      title={item.tex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().insertInlineMath({ latex: item.tex }).run()
                        setSymOpen(false)
                      }}
                    >
                      {item.display}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
