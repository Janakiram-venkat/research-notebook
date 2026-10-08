import { describe, expect, it } from 'vitest'
import {
  addChild, addSibling, defaultMindMap, findNode, layoutMindMap, mindMapFromOutline, mindMapToMarkdown,
  mmNode, moveNode, neighbour, normalizeMindMap, removeNode, renameNode, toggleCollapsed,
} from './mindmap.js'

const sample = () => {
  const root = mmNode('Root', [mmNode('A', [mmNode('A1'), mmNode('A2')]), mmNode('B')])
  return root
}

describe('mind map tree ops', () => {
  it('adds children and siblings, returning the new id', () => {
    const root = sample()
    const [t1, c] = addChild(root, root.children[1].id, 'B1')
    expect(findNode(t1, c).text).toBe('B1')
    const [t2, s] = addSibling(t1, t1.children[0].id, 'A+')
    expect(t2.children.map((n) => n.text)).toEqual(['A', 'A+', 'B'])
    expect(findNode(t2, s).text).toBe('A+')
    expect(root.children[1].children).toHaveLength(0) // original untouched
  })

  it('a sibling of the root becomes a child', () => {
    const root = sample()
    const [t] = addSibling(root, root.id, 'C')
    expect(t.children.map((n) => n.text)).toEqual(['A', 'B', 'C'])
  })

  it('removes a node, picks a sensible next selection, never removes the root', () => {
    const root = sample()
    const a = root.children[0]
    const [t, next] = removeNode(root, a.children[0].id)
    expect(findNode(t, a.id).children.map((n) => n.text)).toEqual(['A2'])
    expect(findNode(t, next).text).toBe('A2')
    expect(removeNode(root, root.id)[0]).toBe(root)
  })

  it('renames, collapses, moves', () => {
    let t = renameNode(sample(), sample().id, 'x') // unknown id: no change
    t = sample()
    t = renameNode(t, t.children[1].id, 'Bee')
    expect(t.children[1].text).toBe('Bee')
    t = toggleCollapsed(t, t.children[0].id)
    expect(t.children[0].collapsed).toBe(true)
    t = moveNode(t, t.children[1].id, -1)
    expect(t.children.map((n) => n.text)).toEqual(['Bee', 'A'])
  })

  it('navigates with arrow keys', () => {
    const t = sample()
    const [a, b] = t.children
    expect(neighbour(t, t.id, 'ArrowRight')).toBe(a.id)
    expect(neighbour(t, a.id, 'ArrowDown')).toBe(b.id)
    expect(neighbour(t, a.children[0].id, 'ArrowLeft')).toBe(a.id)
  })
})

describe('mind map layout', () => {
  it('places every visible node without overlaps, parents centred on children', () => {
    const t = sample()
    const { nodes, edges, width, height } = layoutMindMap(t)
    expect(nodes).toHaveLength(5)
    expect(edges).toHaveLength(4)
    const byText = Object.fromEntries(nodes.map((n) => [n.text, n]))
    expect(byText.A.y).toBe((byText.A1.y + byText.A2.y) / 2)
    expect(byText.A1.x).toBeGreaterThan(byText.A.x + byText.A.w)
    const leaves = nodes.filter((n) => !n.hasChildren).sort((p, q) => p.y - q.y)
    for (let i = 1; i < leaves.length; i += 1) expect(leaves[i].y - leaves[i - 1].y).toBeGreaterThanOrEqual(leaves[i].h)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('hides collapsed subtrees', () => {
    const t = toggleCollapsed(sample(), sample().children[0].id)
    expect(layoutMindMap(t).nodes).toHaveLength(5) // different ids: toggle did nothing
    const s = sample()
    expect(layoutMindMap(toggleCollapsed(s, s.children[0].id)).nodes).toHaveLength(3)
  })
})

describe('mind map markdown', () => {
  it('round-trips through an outline', () => {
    const md = mindMapToMarkdown(sample())
    expect(md).toBe('**Root**\n\n- A\n  - A1\n  - A2\n- B')
    const back = mindMapFromOutline(md)
    expect(back.text).toBe('Root')
    expect(back.children.map((n) => n.text)).toEqual(['A', 'B'])
    expect(back.children[0].children.map((n) => n.text)).toEqual(['A1', 'A2'])
  })

  it('normalizes junk into a usable tree', () => {
    expect(normalizeMindMap(null).children.length).toBeGreaterThan(0)
    expect(normalizeMindMap('{bad json').text).toBe(defaultMindMap().text)
    const fixed = normalizeMindMap({ text: 5, children: [{ text: 'ok' }, 'junk'] })
    expect(fixed.text).toBe('')
    expect(fixed.children.map((n) => n.text)).toEqual(['ok'])
  })
})
