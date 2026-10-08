// Graph view: every note as a dot, every [[link]] as a line. Hover to see a note's
// neighbourhood, click to open it, drag to pan, scroll or use the buttons to zoom.
// Colour is the note's folder; size grows with how connected it is.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Maximize, Search, Waypoints } from 'lucide-react'
import { listNotes } from '../lib/notebook/notebookStore.js'
import { buildGraph, layoutGraph, neighbours } from '../lib/notebook/graph.js'
import '../components/notebook/notebook.css'
import '../components/graph.css'

const W = 1200
const H = 800
const PALETTE = ['#2A3CF0', '#0E9F6E', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#65A30D', '#DC2626', '#475569']

export default function NotebookGraph() {
  const navigate = useNavigate()
  const [notes, setNotes] = useState(() => listNotes())
  const [hideOrphans, setHideOrphans] = useState(false)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    const refresh = () => setNotes(listNotes())
    window.addEventListener('nb:notes-changed', refresh)
    return () => window.removeEventListener('nb:notes-changed', refresh)
  }, [])

  const full = useMemo(() => buildGraph(notes), [notes])
  const graph = useMemo(() => {
    if (!hideOrphans) return full
    const keep = new Set(full.nodes.filter((n) => n.degree > 0).map((n) => n.id))
    return { nodes: full.nodes.filter((n) => keep.has(n.id)), edges: full.edges }
  }, [full, hideOrphans])
  const pos = useMemo(() => layoutGraph(graph, { width: W, height: H }), [graph])

  const folders = useMemo(() => [...new Set(graph.nodes.map((n) => n.folder))].sort(), [graph])
  const colorOf = (folder) => PALETTE[folders.indexOf(folder) % PALETTE.length]

  const focusSet = useMemo(() => (hover ? new Set([hover, ...neighbours(graph, hover)]) : null), [graph, hover])
  const q = query.trim().toLowerCase()
  const matches = useMemo(() => (q ? new Set(graph.nodes.filter((n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))).map((n) => n.id)) : null), [graph, q])
  const dim = (id) => (focusSet && !focusSet.has(id)) || (matches && !matches.has(id))
  const maxDegree = Math.max(1, ...graph.nodes.map((n) => n.degree))
  const radius = (n) => 6 + 10 * Math.sqrt(n.degree / maxDegree)

  // Wheel zoom around the cursor. Non-passive so the page itself does not scroll.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * W
      const my = ((e.clientY - rect.top) / rect.height) * H
      setView((v) => {
        const k = Math.min(4, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f) => setView((v) => {
    const k = Math.min(4, Math.max(0.3, v.k * f))
    return { k, x: W / 2 - ((W / 2 - v.x) / v.k) * k, y: H / 2 - ((H / 2 - v.y) / v.k) * k }
  })

  const onPointerDown = (e) => {
    if (e.target.closest('.graph-node')) return
    drag.current = { x: e.clientX, y: e.clientY, v: view }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const s = W / rect.width
    setView({ ...drag.current.v, x: drag.current.v.x + (e.clientX - drag.current.x) * s, y: drag.current.v.y + (e.clientY - drag.current.y) * s })
  }
  const onPointerUp = () => { drag.current = null }

  const linked = full.nodes.filter((n) => n.degree > 0).length
  // Small notebooks: label everything. Large ones: hubs, hovered and matching notes, or when zoomed in.
  const showLabel = (n) => graph.nodes.length <= 40 || view.k >= 1.4 || n.degree >= Math.max(2, maxDegree * 0.5) || n.id === hover || focusSet?.has(n.id) || matches?.has(n.id)

  return (
    <div className="graph-page">
      <header className="graph-head">
        <Link to="/notebook" className="nb-icon-btn" aria-label="Back to notes"><ArrowLeft size={18} /></Link>
        <div>
          <h1><Waypoints size={20} aria-hidden="true" /> Knowledge graph</h1>
          <p>{full.nodes.length} notes · {full.edges.length} links · {full.nodes.length - linked} not linked yet</p>
        </div>
        <span className="graph-spacer" />
        <label className="graph-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Highlight notes…" aria-label="Highlight notes by title or tag" />
        </label>
        <label className="graph-toggle">
          <input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} /> Only linked notes
        </label>
      </header>

      {graph.nodes.length === 0 ? (
        <div className="graph-empty">
          <Waypoints size={28} aria-hidden="true" />
          <h2>{full.nodes.length ? 'No links yet' : 'No notes yet'}</h2>
          <p>Link notes by typing <code>[[</code> and a note title. Each link becomes a line here, so you can see how your ideas connect.</p>
          <Link to="/notebook" className="nb-new-btn">Go to notes</Link>
        </div>
      ) : (
        <div className="graph-stage">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="graph-svg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            role="img"
            aria-label={`Graph of ${graph.nodes.length} notes and ${graph.edges.length} links`}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {graph.edges.map((e) => {
                const a = pos.get(e.source)
                const b = pos.get(e.target)
                if (!a || !b) return null
                const lit = focusSet && focusSet.has(e.source) && focusSet.has(e.target) && (e.source === hover || e.target === hover)
                return (
                  <line key={`${e.source}-${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    className={`graph-edge${lit ? ' is-lit' : ''}${focusSet && !lit ? ' is-dim' : ''}`} strokeWidth={1.2 / view.k + 0.4} />
                )
              })}
              {graph.nodes.map((n) => {
                const p = pos.get(n.id)
                const r = radius(n)
                return (
                  <g
                    key={n.id}
                    className={`graph-node${dim(n.id) ? ' is-dim' : ''}${n.id === hover ? ' is-hover' : ''}`}
                    transform={`translate(${p.x},${p.y})`}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => navigate(`/notebook/${n.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/notebook/${n.id}`) } }}
                    tabIndex={0}
                    role="link"
                    aria-label={`${n.title}, ${n.degree} links`}
                  >
                    <circle r={r + 4} className="graph-halo" />
                    <circle r={r} fill={colorOf(n.folder)} />
                    {showLabel(n) && (
                      <text y={r + 14} textAnchor="middle" fontSize={12.5 / Math.sqrt(view.k)} className="graph-label">
                        {n.title.length > 32 ? n.title.slice(0, 31) + '…' : n.title}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          <div className="graph-controls">
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in"><Plus size={16} /></button>
            <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out"><Minus size={16} /></button>
            <button type="button" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="Reset view"><Maximize size={16} /></button>
          </div>

          <ul className="graph-legend" aria-label="Folders">
            {folders.map((f) => (
              <li key={f}><span style={{ background: colorOf(f) }} />{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
