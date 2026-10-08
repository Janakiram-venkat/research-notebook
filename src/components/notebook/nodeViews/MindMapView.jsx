// Node view for MindMapNode: an editable mind map inside a note.
//
// Rendering is one SVG (MindMapSvg, also used for print), with an HTML input laid
// over the node being renamed. Keys follow the mind-map apps people already know:
//   Tab add child · Enter add sibling · F2 / double-click rename · Delete remove
//   Space fold · arrows move · Alt+↑/↓ reorder
// Keystrokes are kept away from the editor by the node's stopEvent (see MindMapNode).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { GitBranchPlus, ListPlus, Trash2, Minus, Plus, Maximize, ChevronsDownUp, Keyboard } from 'lucide-react'
import {
  addChild, addSibling, findNode, layoutMindMap, moveNode, neighbour, normalizeMindMap,
  removeNode, renameNode, toggleCollapsed, MM_PAD,
} from '../../../lib/notebook/mindmap.js'
import MindMapSvg from '../MindMapSvg.jsx'
import ExportMenu from '../ExportMenu.jsx'

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5]

export default function MindMapView({ node, updateAttributes, editor, selected }) {
  const tree = useMemo(() => normalizeMindMap(node.attrs.data), [node.attrs.data])
  const layout = useMemo(() => layoutMindMap(tree), [tree])
  const editable = editor?.isEditable !== false
  const [sel, setSel] = useState(tree.id)
  const [editing, setEditing] = useState(null) // { id, draft, isNew }
  const [zoom, setZoom] = useState(1)
  const [showKeys, setShowKeys] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const selectedId = findNode(tree, sel) ? sel : tree.id
  const commit = useCallback((next) => updateAttributes({ data: next }), [updateAttributes])

  // Renaming via F2 / double-click selects the old text so typing replaces it.
  // Renaming by just typing has already put the first letter in the draft, so the
  // caret goes after it instead (selecting would let the next key overwrite it).
  useEffect(() => {
    const el = inputRef.current
    if (!editing || !el) return
    if (editing.fromTyping) el.setSelectionRange(el.value.length, el.value.length)
    else el.select()
  }, [editing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (id, isNew = false) => {
    if (!editable) return
    setSel(id)
    setEditing({ id, draft: findNode(tree, id)?.text ?? '', isNew })
  }

  // New nodes are created empty and opened for typing straight away. `base` and
  // `fromId` let a rename and the add that follows it land as one change.
  const create = (kind, base = tree, fromId = selectedId) => {
    const [next, id] = kind === 'child' ? addChild(base, fromId) : addSibling(base, fromId)
    commit(next)
    setSel(id)
    setEditing({ id, draft: '', isNew: true })
  }

  // Ends a rename. `thenAdd` ('child' | 'sibling') chains Enter / Tab from the input.
  const finishEdit = (thenAdd) => {
    if (!editing) return
    const text = editing.draft.trim()
    if (!text && editing.isNew) {
      // An abandoned new node is removed rather than left blank, and ends the chain.
      const [t, after] = removeNode(tree, editing.id)
      commit(t)
      setSel(after)
      setEditing(null)
      boxRef.current?.focus()
      return
    }
    const next = text !== (findNode(tree, editing.id)?.text ?? '') ? renameNode(tree, editing.id, text || 'Untitled') : tree
    if (thenAdd) { create(thenAdd, next, editing.id); return }
    setEditing(null)
    if (next !== tree) commit(next)
    boxRef.current?.focus()
  }

  const remove = () => {
    if (selectedId === tree.id) return
    const [next, after] = removeNode(tree, selectedId)
    commit(next)
    setSel(after)
  }

  const onKeyDown = (e) => {
    if (editing || !editable) {
      if (!editable && e.key.startsWith('Arrow')) { e.preventDefault(); setSel(neighbour(tree, selectedId, e.key)) }
      return
    }
    const k = e.key
    // Undo / redo belong to the whole note. The map keeps keys away from the
    // editor (so Enter and Delete act on nodes), which would otherwise swallow
    // Ctrl+Z too and leave an accidental delete with no way back.
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z' || k === 'y')) {
      e.preventDefault()
      const redo = k === 'y' || e.shiftKey
      if (redo) editor.commands.redo()
      else editor.commands.undo()
      return
    }
    if (k === 'Tab') { e.preventDefault(); create('child') }
    else if (k === 'Enter') { e.preventDefault(); create('sibling') }
    else if (k === 'F2') { e.preventDefault(); startEdit(selectedId) }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove() }
    else if (k === ' ') { e.preventDefault(); commit(toggleCollapsed(tree, selectedId)) }
    else if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); commit(moveNode(tree, selectedId, k === 'ArrowUp' ? -1 : 1)) }
    else if (k.startsWith('Arrow')) { e.preventDefault(); setSel(neighbour(tree, selectedId, k)) }
    else if (k === 'Escape') { e.preventDefault(); boxRef.current?.blur() }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing on a selected node starts renaming it, like a spreadsheet cell.
      e.preventDefault()
      setEditing({ id: selectedId, draft: k, isNew: false, fromTyping: true })
    }
  }

  const onInputKey = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); finishEdit('sibling') }
    else if (e.key === 'Tab') { e.preventDefault(); finishEdit('child') }
    else if (e.key === 'Escape') {
      e.preventDefault()
      if (editing.isNew) {
        const [t, after] = removeNode(tree, editing.id)
        commit(t)
        setSel(after)
      }
      setEditing(null)
      boxRef.current?.focus()
    }
  }

  const box = layout.nodes.find((n) => n.id === editing?.id)
  const fit = () => {
    const avail = (boxRef.current?.clientWidth || 700) - 24
    const want = (layout.width + MM_PAD * 2) * 1
    const z = Math.min(1.5, Math.max(0.6, avail / want))
    setZoom(ZOOMS.reduce((best, v) => (Math.abs(v - z) < Math.abs(best - z) ? v : best), 1))
  }
  const step = (d) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + d))])
  const selNode = findNode(tree, selectedId)

  return (
    <NodeViewWrapper className={`nb-mindmap${selected ? ' is-node-selected' : ''}`} data-drag-handle="">
      <div className="nb-mm-toolbar" contentEditable={false} data-capture-events="">
        <span className="nb-mm-label">Mind map</span>
        {editable && (
          <>
            <button type="button" onClick={() => create('child')} title="Add child (Tab)"><GitBranchPlus size={14} /> Child</button>
            <button type="button" onClick={() => create('sibling')} title="Add sibling (Enter)"><ListPlus size={14} /> Sibling</button>
            <button type="button" onClick={remove} disabled={selectedId === tree.id} title="Delete (Del)" aria-label="Delete node"><Trash2 size={14} /></button>
            <button type="button" onClick={() => commit(toggleCollapsed(tree, selectedId))} disabled={!selNode?.children.length} title="Fold / unfold (Space)" aria-label="Fold or unfold"><ChevronsDownUp size={14} /></button>
          </>
        )}
        <span className="nb-mm-spacer" />
        <button type="button" onClick={() => step(-1)} aria-label="Zoom out"><Minus size={14} /></button>
        <span className="nb-mm-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => step(1)} aria-label="Zoom in"><Plus size={14} /></button>
        <button type="button" onClick={fit} title="Fit to width" aria-label="Fit to width"><Maximize size={14} /></button>
        <ExportMenu getSvg={() => boxRef.current?.querySelector('svg.nb-mm-svg')} name={tree.text || 'mind-map'} />
        {editable && <button type="button" onClick={() => setShowKeys((v) => !v)} aria-pressed={showKeys} title="Keyboard shortcuts" aria-label="Keyboard shortcuts"><Keyboard size={14} /></button>}
      </div>
      {showKeys && (
        <p className="nb-mm-keys" contentEditable={false}>
          <kbd>Tab</kbd> child · <kbd>Enter</kbd> sibling · type or <kbd>F2</kbd> to rename · <kbd>Del</kbd> remove · <kbd>Space</kbd> fold · arrows to move · <kbd>Alt</kbd>+<kbd>↑↓</kbd> reorder · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
        </p>
      )}
      <div
        ref={boxRef}
        className="nb-mm-canvas"
        tabIndex={0}
        contentEditable={false}
        data-capture-events=""
        onKeyDown={onKeyDown}
        role="tree"
        aria-label={`Mind map: ${tree.text}. ${editable ? 'Tab adds a branch, Enter a sibling, type to rename.' : ''}`}
      >
        <div className="nb-mm-stage" style={{ width: (layout.width + MM_PAD * 2) * zoom, height: (layout.height + MM_PAD * 2) * zoom }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'relative' }}>
            <MindMapSvg
              layout={layout}
              selectedId={selectedId}
              onSelect={(id) => { if (editing) finishEdit(); setSel(id); boxRef.current?.focus() }}
              onEdit={(id) => startEdit(id)}
              onToggle={(id) => editable && commit(toggleCollapsed(tree, id))}
            />
            {editing && box && (
              <input
                ref={inputRef}
                className={`nb-mm-input${box.depth === 0 ? ' is-root' : ''}`}
                style={{ left: box.x + MM_PAD, top: box.y + MM_PAD, width: Math.max(box.w, 140), height: box.h }}
                value={editing.draft}
                placeholder={box.depth === 0 ? 'Central idea' : 'Type an idea'}
                onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                onKeyDown={onInputKey}
                onBlur={() => finishEdit()}
                aria-label="Node text"
                autoFocus
              />
            )}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
