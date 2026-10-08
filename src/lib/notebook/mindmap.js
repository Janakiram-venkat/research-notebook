// Mind map model: a tree of { id, text, children, collapsed }.
//
// Every operation is pure (returns a new tree) so the node view can hand the
// result straight to updateAttributes and undo/redo keeps working. Layout is a
// classic left-to-right tree: each subtree gets the height of its leaves, each
// depth gets the width of its widest node.

let seq = 0
export function mmId() {
  seq += 1
  return `m${Date.now().toString(36)}${seq.toString(36)}`
}

export function mmNode(text = '', children = []) {
  return { id: mmId(), text, children, collapsed: false }
}

export function defaultMindMap() {
  return mmNode('Central idea', [mmNode('First branch'), mmNode('Second branch'), mmNode('Third branch')])
}

// Accepts whatever is stored and returns a well-formed tree (never throws).
export function normalizeMindMap(value) {
  const fix = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 40) return null
    return {
      id: typeof n.id === 'string' && n.id ? n.id : mmId(),
      text: typeof n.text === 'string' ? n.text : '',
      collapsed: Boolean(n.collapsed),
      children: Array.isArray(n.children) ? n.children.map((c) => fix(c, depth + 1)).filter(Boolean) : [],
    }
  }
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { parsed = null }
  }
  return fix(parsed, 0) || defaultMindMap()
}

function mapTree(node, fn) {
  const next = fn(node)
  if (next !== node) return next
  const children = node.children.map((c) => mapTree(c, fn))
  return children.some((c, i) => c !== node.children[i]) ? { ...node, children } : node
}

export function findNode(root, id) {
  if (root.id === id) return root
  for (const c of root.children) {
    const hit = findNode(c, id)
    if (hit) return hit
  }
  return null
}

export function findParent(root, id) {
  for (const c of root.children) {
    if (c.id === id) return root
    const hit = findParent(c, id)
    if (hit) return hit
  }
  return null
}

export function renameNode(root, id, text) {
  return mapTree(root, (n) => (n.id === id ? { ...n, text } : n))
}

export function toggleCollapsed(root, id) {
  return mapTree(root, (n) => (n.id === id && n.children.length ? { ...n, collapsed: !n.collapsed } : n))
}

// Returns [tree, newNodeId].
export function addChild(root, parentId, text = '') {
  const child = mmNode(text)
  const tree = mapTree(root, (n) => (n.id === parentId ? { ...n, collapsed: false, children: [...n.children, child] } : n))
  return [tree, child.id]
}

// A sibling goes right after the node. The root has no siblings, so it gets a child.
export function addSibling(root, id, text = '') {
  const parent = findParent(root, id)
  if (!parent) return addChild(root, id, text)
  const sib = mmNode(text)
  const tree = mapTree(root, (n) => {
    if (n.id !== parent.id) return n
    const i = n.children.findIndex((c) => c.id === id)
    const children = [...n.children]
    children.splice(i + 1, 0, sib)
    return { ...n, children }
  })
  return [tree, sib.id]
}

// Returns [tree, idToSelectNext]. The root cannot be removed.
export function removeNode(root, id) {
  const parent = findParent(root, id)
  if (!parent) return [root, root.id]
  const i = parent.children.findIndex((c) => c.id === id)
  const next = parent.children[i + 1] || parent.children[i - 1] || parent
  const tree = mapTree(root, (n) => (n.id === parent.id ? { ...n, children: n.children.filter((c) => c.id !== id) } : n))
  return [tree, next.id]
}

// Move a node up or down among its siblings (dir = -1 | 1).
export function moveNode(root, id, dir) {
  const parent = findParent(root, id)
  if (!parent) return root
  const i = parent.children.findIndex((c) => c.id === id)
  const j = i + dir
  if (j < 0 || j >= parent.children.length) return root
  return mapTree(root, (n) => {
    if (n.id !== parent.id) return n
    const children = [...n.children]
    ;[children[i], children[j]] = [children[j], children[i]]
    return { ...n, children }
  })
}

// ── navigation (arrow keys) ───────────────────────────────────────────────────
export function neighbour(root, id, key) {
  const node = findNode(root, id)
  const parent = findParent(root, id)
  if (!node) return root.id
  if (key === 'ArrowLeft') return parent ? parent.id : id
  if (key === 'ArrowRight') return !node.collapsed && node.children.length ? node.children[0].id : id
  if (!parent) return id
  const i = parent.children.findIndex((c) => c.id === id)
  const j = key === 'ArrowUp' ? i - 1 : i + 1
  return parent.children[j]?.id || id
}

// ── layout ────────────────────────────────────────────────────────────────────
export const NODE_H = 34
// Space around the map inside its SVG (shared by the view's input overlay).
export const MM_PAD = 16
const V_GAP = 12
const H_GAP = 56

// Rough text width so layout needs no DOM measuring (works in tests and print).
export function nodeWidth(text, isRoot) {
  const chars = Math.max(4, Math.min((text || '').length, 34))
  return Math.round(chars * (isRoot ? 8.6 : 7.4) + (isRoot ? 36 : 26))
}

// Returns { nodes: [{id,text,x,y,w,h,depth,branch,hasChildren,collapsed}], edges: [{from,to}], width, height }.
export function layoutMindMap(root) {
  const colWidth = []
  const walkWidths = (n, d) => {
    colWidth[d] = Math.max(colWidth[d] || 0, nodeWidth(n.text, d === 0))
    if (!n.collapsed) n.children.forEach((c) => walkWidths(c, d + 1))
  }
  walkWidths(root, 0)
  const colX = []
  colWidth.reduce((x, w, d) => { colX[d] = x; return x + w + H_GAP }, 0)

  const nodes = []
  const edges = []
  let cursor = 0
  const place = (n, d, branch) => {
    const kids = n.collapsed ? [] : n.children
    let y
    if (!kids.length) {
      y = cursor
      cursor += NODE_H + V_GAP
    } else {
      const ys = kids.map((c, i) => place(c, d + 1, d === 0 ? i : branch))
      y = (ys[0] + ys[ys.length - 1]) / 2
      kids.forEach((c) => edges.push({ from: n.id, to: c.id }))
    }
    nodes.push({
      id: n.id, text: n.text, depth: d, branch, x: colX[d], y,
      w: nodeWidth(n.text, d === 0), h: NODE_H, hasChildren: n.children.length > 0, collapsed: n.collapsed,
      count: n.children.length,
    })
    return y
  }
  place(root, 0, -1)
  const width = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0)
  const height = Math.max(NODE_H, cursor - V_GAP)
  return { nodes, edges, width, height }
}

// ── markdown ──────────────────────────────────────────────────────────────────
// Export / print / search / AI all see the map as a nested list.
export function mindMapToMarkdown(root) {
  const lines = [`**${root.text || 'Mind map'}**`, '']
  const walk = (n, depth) => n.children.forEach((c) => {
    lines.push(`${'  '.repeat(depth)}- ${c.text || '…'}`)
    walk(c, depth + 1)
  })
  walk(root, 0)
  return lines.join('\n').trimEnd()
}

// "- a\n  - b" (or a heading + list) -> tree. Lets people turn an outline into a map.
export function mindMapFromOutline(markdown, fallbackTitle = 'Central idea') {
  const root = mmNode(fallbackTitle)
  const stack = [{ indent: -1, node: root }]
  for (const raw of (markdown || '').split('\n')) {
    const heading = /^\s*#{1,6}\s+(.+)$/.exec(raw) || /^\s*\*\*(.+)\*\*\s*$/.exec(raw)
    if (heading && root.children.length === 0 && root.text === fallbackTitle) { root.text = heading[1].trim(); continue }
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(raw) || /^(\s*)\d+[.)]\s+(.*)$/.exec(raw)
    if (!item) continue
    const indent = item[1].replace(/\t/g, '  ').length
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const node = mmNode(item[2].trim())
    stack[stack.length - 1].node.children.push(node)
    stack.push({ indent, node })
  }
  return root
}
