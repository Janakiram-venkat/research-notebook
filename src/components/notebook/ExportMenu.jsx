// "Export" button for a drawing block: PNG for slides and chat, SVG for print and
// editing in a vector app. `getSvg` returns the live <svg> element to save.

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { downloadPng, downloadSvg, fileStem } from '../../lib/notebook/exportImage.js'
import { toastError } from './ui/toast.js'

export default function ExportMenu({ getSvg, name }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const run = async (kind) => {
    setOpen(false)
    const svg = getSvg()
    if (!svg) { toastError('Nothing to export yet.'); return }
    try {
      if (kind === 'png') await downloadPng(svg, fileStem(name))
      else downloadSvg(svg, fileStem(name))
    } catch (err) {
      toastError(err.message || 'Export failed.')
    }
  }

  return (
    <span className="nb-export" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Export as image">
        <Download size={14} /> Export
      </button>
      {open && (
        <span className="nb-export-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run('png')}>PNG image <small>for slides, chat, documents</small></button>
          <button type="button" role="menuitem" onClick={() => run('svg')}>SVG <small>sharp at any size, editable</small></button>
        </span>
      )}
    </span>
  )
}
