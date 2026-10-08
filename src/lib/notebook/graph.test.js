import { describe, expect, it } from 'vitest'
import { buildGraph, layoutGraph, neighbours } from './graph.js'

const text = (markdown) => [{ type: 'text', markdown }]
const notes = [
  { id: 'a', title: 'Alpha', content: text('see [[Beta]] and [[c|Gamma]] and [[Alpha]]') },
  { id: 'b', title: 'Beta', content: text('back to [[a|Alpha]]') },
  { id: 'c', title: 'Gamma', content: text('nothing') },
  { id: 'd', title: 'Orphan', content: text('[[Missing note]]') },
]

describe('note graph', () => {
  it('links by id and by title, ignores self links, missing targets and duplicates', () => {
    const g = buildGraph(notes)
    expect(g.edges).toHaveLength(2) // a-b (both directions count once), a-c
    expect(g.nodes.find((n) => n.id === 'a').degree).toBe(2)
    expect(g.nodes.find((n) => n.id === 'd').degree).toBe(0)
    expect([...neighbours(g, 'a')].sort()).toEqual(['b', 'c'])
  })

  it('lays every node out inside the box, deterministically, without stacking', () => {
    const g = buildGraph(notes)
    const p1 = layoutGraph(g, { width: 400, height: 300 })
    const p2 = layoutGraph(g, { width: 400, height: 300 })
    for (const n of g.nodes) {
      const p = p1.get(n.id)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(400)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(300)
      expect(p2.get(n.id)).toEqual(p)
    }
    const pts = [...p1.values()]
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(10)
      }
    }
  })

  it('handles an empty notebook', () => {
    expect(layoutGraph(buildGraph([])).size).toBe(0)
  })
})
