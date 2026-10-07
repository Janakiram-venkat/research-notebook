// The node view for DataPlotNode: a textarea of numbers beside an inline SVG
// plot. It lives here rather than in the extension so the extension file stays
// plain JS, the same split CircuitNode/CircuitNodeView uses.

import { useMemo, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { LineChart, BarChart3, ScatterChart, Trash2 } from 'lucide-react'

const W = 460
const H = 240
const PAD_L = 44
const PAD_R = 12
const PAD_T = 16
const PAD_B = 32

function parseData(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const points = []
  const errors = []
  lines.forEach((line, i) => {
    if (line.startsWith('#') || line.toLowerCase().startsWith('x,')) return
    const parts = line.split(/[,;\t\s]+/).filter(Boolean)
    if (parts.length === 1) {
      const y = Number(parts[0])
      if (Number.isFinite(y)) points.push({ x: points.length, y })
      else errors.push(`Line ${i + 1}: not a number`)
      return
    }
    const x = Number(parts[0])
    const y = Number(parts[1])
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y })
    else errors.push(`Line ${i + 1}: not two numbers`)
  })
  return { points, errors }
}

function niceStep(range) {
  if (!Number.isFinite(range) || range <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(range)))
  const norm = range / pow
  const step = norm < 1.5 ? 0.2 : norm < 3 ? 0.5 : norm < 7 ? 1 : 2
  return step * pow
}

function ticks(min, max) {
  const step = niceStep((max - min) / 5)
  const out = []
  const start = Math.ceil(min / step) * step
  for (let v = start; v <= max + step * 1e-6; v += step) {
    out.push(Number(v.toFixed(6)))
  }
  return out
}

function Plot({ kind, points, title, xLabel, yLabel }) {
  if (points.length === 0) {
    return (
      <div className="nb-plot-empty">
        Paste rows of numbers on the left. One number per line for a series, or `x, y` per line for a curve.
      </div>
    )
  }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys)
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  const sx = (x) => PAD_L + ((x - xMin) / xSpan) * (W - PAD_L - PAD_R)
  const sy = (y) => H - PAD_B - ((y - yMin) / ySpan) * (H - PAD_T - PAD_B)

  const xTicks = ticks(xMin, xMax)
  const yTicks = ticks(yMin, yMax)

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
  const barWidth = Math.max(2, (W - PAD_L - PAD_R) / points.length - 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="nb-plot-svg" role="img" aria-label={title || 'Data plot'}>
      {title && <text x={W / 2} y={12} textAnchor="middle" className="nb-plot-title">{title}</text>}

      {/* axes */}
      <line x1={PAD_L} y1={sy(yMin)} x2={W - PAD_R} y2={sy(yMin)} className="nb-plot-axis" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="nb-plot-axis" />

      {/* y ticks + gridlines */}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD_L} y1={sy(t)} x2={W - PAD_R} y2={sy(t)} className="nb-plot-grid" />
          <text x={PAD_L - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" className="nb-plot-tick">
            {Number(t.toPrecision(3))}
          </text>
        </g>
      ))}

      {/* x ticks */}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={sx(t)} y1={H - PAD_B} x2={sx(t)} y2={H - PAD_B + 3} className="nb-plot-axis" />
          <text x={sx(t)} y={H - PAD_B + 15} textAnchor="middle" className="nb-plot-tick">
            {Number(t.toPrecision(3))}
          </text>
        </g>
      ))}

      {/* data */}
      {kind === 'bar' && points.map((p, i) => (
        <rect
          key={i}
          x={sx(p.x) - barWidth / 2}
          y={Math.min(sy(p.y), sy(0))}
          width={barWidth}
          height={Math.abs(sy(p.y) - sy(0))}
          className="nb-plot-bar"
        />
      ))}
      {kind === 'line' && <path d={pathD} className="nb-plot-line" fill="none" />}
      {kind === 'scatter' && points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} className="nb-plot-point" />
      ))}
      {kind === 'line' && points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2} className="nb-plot-point" />
      ))}

      {/* labels */}
      {xLabel && (
        <text x={PAD_L + (W - PAD_L - PAD_R) / 2} y={H - 4} textAnchor="middle" className="nb-plot-label">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={-(PAD_T + (H - PAD_T - PAD_B) / 2)}
          y={12}
          textAnchor="middle"
          transform="rotate(-90)"
          className="nb-plot-label"
        >
          {yLabel}
        </text>
      )}
    </svg>
  )
}

function DataPlotView({ node, updateAttributes, editor, getPos }) {
  const [expanded, setExpanded] = useState(!node.attrs.data)
  const data = node.attrs.data || ''
  const kind = node.attrs.kind || 'line'
  const title = node.attrs.title || ''
  const xLabel = node.attrs.xLabel || ''
  const yLabel = node.attrs.yLabel || ''

  const parsed = useMemo(() => parseData(data), [data])

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
    <NodeViewWrapper as="figure" className="nb-plot" data-drag-handle>
      <div className="nb-plot-body">
        {expanded && (
          <div className="nb-plot-editor">
            <div className="nb-plot-fields">
              <input
                type="text"
                className="nb-plot-input"
                value={title}
                onChange={(e) => updateAttributes({ title: e.target.value })}
                placeholder="Title (optional)"
                aria-label="Plot title"
              />
              <div className="nb-plot-row">
                <input
                  type="text"
                  className="nb-plot-input"
                  value={xLabel}
                  onChange={(e) => updateAttributes({ xLabel: e.target.value })}
                  placeholder="x label"
                  aria-label="x axis label"
                />
                <input
                  type="text"
                  className="nb-plot-input"
                  value={yLabel}
                  onChange={(e) => updateAttributes({ yLabel: e.target.value })}
                  placeholder="y label"
                  aria-label="y axis label"
                />
              </div>
              <div className="nb-plot-kinds" role="group" aria-label="Plot type">
                <button
                  type="button"
                  className={`nb-plot-kind${kind === 'line' ? ' is-active' : ''}`}
                  onClick={() => updateAttributes({ kind: 'line' })}
                >
                  <LineChart size={13} /> Line
                </button>
                <button
                  type="button"
                  className={`nb-plot-kind${kind === 'bar' ? ' is-active' : ''}`}
                  onClick={() => updateAttributes({ kind: 'bar' })}
                >
                  <BarChart3 size={13} /> Bar
                </button>
                <button
                  type="button"
                  className={`nb-plot-kind${kind === 'scatter' ? ' is-active' : ''}`}
                  onClick={() => updateAttributes({ kind: 'scatter' })}
                >
                  <ScatterChart size={13} /> Scatter
                </button>
              </div>
            </div>
            <textarea
              className="nb-plot-data"
              value={data}
              onChange={(e) => updateAttributes({ data: e.target.value })}
              placeholder={'0, 0.10\n1, 0.42\n2, 0.68\n3, 0.83\n4, 0.91'}
              spellCheck={false}
              aria-label="Plot data"
              rows={8}
            />
            {parsed.errors.length > 0 && (
              <p className="nb-plot-errors">{parsed.errors[0]}</p>
            )}
          </div>
        )}
        <div className="nb-plot-render">
          <Plot kind={kind} points={parsed.points} title={title} xLabel={xLabel} yLabel={yLabel} />
        </div>
      </div>
      <div className="nb-plot-foot">
        <button type="button" className="nb-plot-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide data' : 'Edit data'}
        </button>
        <span className="nb-plot-count">{parsed.points.length} points</span>
        <button type="button" className="nb-plot-remove" onClick={removeNode} title="Delete plot">
          <Trash2 size={13} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}

export default DataPlotView
