// The node view for SketchNode: an inline canvas with pen, eraser and clear
// that commits to a PNG data URL. Kept out of the extension file so that stays
// plain JS, the same split CircuitNode/CircuitNodeView uses.
//
// The two colours below are canvas ink on a canvas sheet, not CSS: the
// sketch is exported as a flat PNG, so it carries its own white ground.

import { useRef, useEffect, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { Pencil, Eraser, Trash2, Check, X } from 'lucide-react'

const CANVAS_W = 720
const CANVAS_H = 260

function SketchView({ node, updateAttributes, editor, getPos }) {
  const src = node.attrs.src || ''
  const [editing, setEditing] = useState(!src)
  const [tool, setTool] = useState('pen') // 'pen' | 'eraser'
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)

  // On enter-edit, seed the canvas with what was saved so the user can pick
  // up where they left off. A fresh sketch just clears.
  useEffect(() => {
    if (!editing) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, c.width, c.height)
    if (src) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = src
    }
  }, [editing, src])

  const relativePoint = (e) => {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * c.width
    const y = ((e.clientY - rect.top) / rect.height) * c.height
    return { x, y }
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastRef.current = relativePoint(e)
  }
  const onPointerMove = (e) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    const p = relativePoint(e)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (tool === 'pen') {
      ctx.strokeStyle = '#0B0F2A'
      ctx.lineWidth = 2
      ctx.globalCompositeOperation = 'source-over'
    } else {
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 16
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }
  const onPointerUp = (e) => {
    drawingRef.current = false
    try { canvasRef.current?.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
  }

  const clearCanvas = () => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, c.width, c.height)
  }

  const commit = () => {
    const dataUrl = canvasRef.current.toDataURL('image/png')
    updateAttributes({ src: dataUrl })
    setEditing(false)
  }

  const removeNode = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    editor.chain().focus().command(({ tr }) => {
      const n = tr.doc.nodeAt(pos)
      if (n) tr.delete(pos, pos + n.nodeSize)
      return true
    }).run()
  }

  return (
    <NodeViewWrapper as="figure" className="nb-sketch" data-drag-handle>
      {editing ? (
        <>
          <div className="nb-sketch-tools" role="toolbar" aria-label="Sketch tools">
            <button
              type="button"
              className={`nb-sketch-tool${tool === 'pen' ? ' is-active' : ''}`}
              onClick={() => setTool('pen')}
              title="Pen"
              aria-pressed={tool === 'pen'}
            >
              <Pencil size={14} /> Pen
            </button>
            <button
              type="button"
              className={`nb-sketch-tool${tool === 'eraser' ? ' is-active' : ''}`}
              onClick={() => setTool('eraser')}
              title="Eraser"
              aria-pressed={tool === 'eraser'}
            >
              <Eraser size={14} /> Eraser
            </button>
            <span className="nb-sketch-sep" />
            <button type="button" className="nb-sketch-tool" onClick={clearCanvas} title="Clear canvas">
              <Trash2 size={14} /> Clear
            </button>
            <span className="nb-sketch-spacer" />
            <button type="button" className="nb-sketch-tool nb-sketch-primary" onClick={commit} title="Save sketch">
              <Check size={14} /> Save
            </button>
            {src && (
              <button type="button" className="nb-sketch-tool" onClick={() => setEditing(false)} title="Cancel">
                <X size={14} /> Cancel
              </button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="nb-sketch-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </>
      ) : (
        <>
          <img
            src={src}
            alt="Freehand sketch"
            className="nb-sketch-image"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          />
          <div className="nb-sketch-tools nb-sketch-view-tools">
            <button type="button" className="nb-sketch-tool" onClick={() => setEditing(true)} title="Edit sketch">
              <Pencil size={13} /> Edit
            </button>
            <button type="button" className="nb-sketch-tool" onClick={removeNode} title="Delete sketch">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
      )}
    </NodeViewWrapper>
  )
}

export default SketchView
