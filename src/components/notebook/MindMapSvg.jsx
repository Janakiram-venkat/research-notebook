// Static SVG rendering of a laid-out mind map. Used by the editable node view and
// by print / read-only views, so a map looks the same on screen and on paper.

import { MM_PAD } from '../../lib/notebook/mindmap.js'

// One hue per top-level branch; the root is the accent colour.
const BRANCH = ['#2A3CF0', '#0E9F6E', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#65A30D', '#DC2626']
const branchColor = (branch) => (branch < 0 ? '#2A3CF0' : BRANCH[branch % BRANCH.length])

function edgePath(a, b) {
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}

function clip(text, w, isRoot) {
  const max = Math.floor((w - (isRoot ? 36 : 26)) / (isRoot ? 8.6 : 7.4)) + 1
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text
}

export default function MindMapSvg({ layout, selectedId, onSelect, onEdit, onToggle }) {
  const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
  const W = layout.width + MM_PAD * 2
  const H = layout.height + MM_PAD * 2
  const interactive = Boolean(onSelect)

  return (
    <svg className="nb-mm-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="presentation">
      <g transform={`translate(${MM_PAD},${MM_PAD})`}>
        {layout.edges.map((e) => {
          const a = byId[e.from]
          const b = byId[e.to]
          return <path key={e.to} d={edgePath(a, b)} fill="none" stroke={branchColor(b.branch)} strokeOpacity="0.55" strokeWidth={a.depth === 0 ? 2.4 : 1.6} />
        })}
        {layout.nodes.map((n) => {
          const isRoot = n.depth === 0
          const color = branchColor(n.branch)
          const isSel = n.id === selectedId
          return (
            <g
              key={n.id}
              className={`nb-mm-node${isSel ? ' is-selected' : ''}`}
              transform={`translate(${n.x},${n.y})`}
              onMouseDown={interactive ? (e) => { e.preventDefault(); onSelect(n.id) } : undefined}
              onDoubleClick={interactive ? () => onEdit?.(n.id) : undefined}
              role={interactive ? 'treeitem' : undefined}
              aria-selected={interactive ? isSel : undefined}
              aria-expanded={n.hasChildren ? !n.collapsed : undefined}
              aria-label={interactive ? n.text || 'Untitled' : undefined}
            >
              {isSel && <rect data-export="skip" x={-4} y={-4} width={n.w + 8} height={n.h + 8} rx={isRoot ? 14 : 12} fill="none" stroke={color} strokeWidth="2" strokeDasharray="0" opacity="0.45" />}
              <rect
                width={n.w}
                height={n.h}
                rx={isRoot ? 11 : 9}
                fill={isRoot ? color : n.depth === 1 ? `${color}26` : undefined}
                style={isRoot || n.depth === 1 ? undefined : { fill: 'var(--mm-node)' }}
                stroke={isRoot ? color : color}
                strokeOpacity={isRoot ? 1 : n.depth === 1 ? 0.5 : 0.35}
                strokeWidth={n.depth === 1 ? 1.4 : 1}
              />
              <text
                x={n.w / 2}
                y={n.h / 2}
                dominantBaseline="central"
                textAnchor="middle"
                fontSize={isRoot ? 14.5 : 13}
                fontWeight={isRoot ? 700 : n.depth === 1 ? 600 : 450}
                fill={isRoot ? '#FFFFFF' : undefined}
                style={{ fontFamily: 'var(--font-sans)', pointerEvents: 'none', ...(isRoot ? null : { fill: 'var(--mm-ink)' }) }}
              >
                {clip(n.text || 'Untitled', n.w, isRoot) || ' '}
              </text>
              {n.hasChildren && (
                <g
                  transform={`translate(${n.w + 2},${n.h / 2 - 8})`}
                  className="nb-mm-fold"
                  data-export={n.collapsed ? undefined : 'skip'}
                  onMouseDown={interactive ? (e) => { e.preventDefault(); e.stopPropagation(); onToggle?.(n.id) } : undefined}
                >
                  <circle cx="8" cy="8" r="7.5" style={{ fill: 'var(--mm-fold)' }} stroke={color} strokeOpacity="0.6" />
                  <text x="8" y="8.5" dominantBaseline="central" textAnchor="middle" fontSize="10" fontWeight="700" fill={color} style={{ pointerEvents: 'none' }}>
                    {n.collapsed ? n.count : '−'}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
