// The notebook as a graph: notes are nodes, [[wiki links]] are edges.
//
// buildGraph() is the data, layoutGraph() a small force-directed layout (repulsion
// between every pair, springs along links, a gentle pull to the centre). It runs a
// fixed number of steps from a deterministic start, so the same notebook always
// draws the same picture and nothing jitters on re-render.

import { outgoingLinks } from './noteUtils.js'

export function buildGraph(notes) {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const byTitle = new Map(notes.map((n) => [(n.title || '').trim().toLowerCase(), n]))
  const seen = new Set()
  const edges = []
  for (const n of notes) {
    const { ids, labels } = outgoingLinks(n)
    const targets = [...ids].map((id) => byId.get(id)).concat([...labels].map((l) => byTitle.get(l)))
    for (const t of targets) {
      if (!t || t.id === n.id) continue
      const key = n.id < t.id ? `${n.id}|${t.id}` : `${t.id}|${n.id}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ source: n.id, target: t.id })
    }
  }
  const degree = new Map(notes.map((n) => [n.id, 0]))
  for (const e of edges) {
    degree.set(e.source, degree.get(e.source) + 1)
    degree.set(e.target, degree.get(e.target) + 1)
  }
  const nodes = notes.map((n) => ({
    id: n.id, title: n.title || 'Untitled note', folder: n.folder || 'General', tags: n.tags || [], degree: degree.get(n.id),
  }))
  return { nodes, edges }
}

export function neighbours(graph, id) {
  const out = new Set()
  for (const e of graph.edges) {
    if (e.source === id) out.add(e.target)
    else if (e.target === id) out.add(e.source)
  }
  return out
}

// Returns Map(id -> {x, y}) inside a width x height box.
export function layoutGraph(graph, { width = 900, height = 600, steps = 260 } = {}) {
  const n = graph.nodes.length
  const pos = new Map()
  if (!n) return pos
  // Start on a spiral (deterministic, already spread out).
  graph.nodes.forEach((node, i) => {
    const a = i * 2.399963 // golden angle
    const r = 14 * Math.sqrt(i + 1)
    pos.set(node.id, { x: width / 2 + r * Math.cos(a), y: height / 2 + r * Math.sin(a), vx: 0, vy: 0 })
  })
  const area = width * height
  // Ideal edge length: shorter for big graphs, capped so a handful of notes stays a cluster.
  const k = Math.min(140, Math.sqrt(area / Math.max(n, 1)) * 0.45)
  const list = graph.nodes.map((node) => pos.get(node.id))
  for (let step = 0; step < steps; step += 1) {
    const cool = 1 - step / steps
    for (let i = 0; i < n; i += 1) {
      const p = list[i]
      for (let j = i + 1; j < n; j += 1) {
        const q = list[j]
        let dx = p.x - q.x
        let dy = p.y - q.y
        let d2 = dx * dx + dy * dy
        if (d2 < 0.01) { dx = 0.1 * (i - j); dy = 0.1; d2 = dx * dx + dy * dy }
        const f = (k * k) / d2
        p.vx += dx * f * 0.02; p.vy += dy * f * 0.02
        q.vx -= dx * f * 0.02; q.vy -= dy * f * 0.02
      }
    }
    for (const e of graph.edges) {
      const p = pos.get(e.source)
      const q = pos.get(e.target)
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = ((d - k) / d) * 0.06
      p.vx += dx * f; p.vy += dy * f
      q.vx -= dx * f; q.vy -= dy * f
    }
    for (const p of list) {
      // Gravity keeps unlinked notes near the middle instead of flung to the edges.
      p.vx += (width / 2 - p.x) * 0.02
      p.vy += (height / 2 - p.y) * 0.02
      const max = 18 * cool + 1
      p.x += Math.max(-max, Math.min(max, p.vx))
      p.y += Math.max(-max, Math.min(max, p.vy))
      p.vx *= 0.5; p.vy *= 0.5
    }
  }
  // Fit into the box with a margin.
  const xs = list.map((p) => p.x)
  const ys = list.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const m = 60
  const sx = (width - 2 * m) / Math.max(maxX - minX, 1)
  const sy = (height - 2 * m) / Math.max(maxY - minY, 1)
  const s = Math.min(sx, sy, 1.6)
  const ox = (width - (maxX - minX) * s) / 2
  const oy = (height - (maxY - minY) * s) / 2
  const out = new Map()
  for (const node of graph.nodes) {
    const p = pos.get(node.id)
    out.set(node.id, { x: ox + (p.x - minX) * s, y: oy + (p.y - minY) * s })
  }
  return out
}
