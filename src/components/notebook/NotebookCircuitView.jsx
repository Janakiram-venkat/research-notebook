// Read-only circuit renderer for notebook circuit blocks.
//
// Driven directly by the canonical circuit model ({ numQubits, gates, inits })
// so it understands columns, controls and multi-qubit gates (CX/CZ/SWAP/CCX,
// rotations, measure) — unlike the lesson-oriented CircuitRenderer which takes a
// flat op list. Colours come from the shared gate catalogue.

import { gateColor } from '../../lib/quantum/gates.js'
import { maxColumn, gateWires } from '../../lib/quantum/circuitModel.js'

const CELL_W = 72
const ROW_H = 64
const TOP_PAD = 18
const LEFT_PAD = 58
const RIGHT_PAD = 28

function rowY(row) {
  return TOP_PAD + row * ROW_H + ROW_H / 2
}

function fmtAngle(p) {
  if (p == null) return ''
  const r = p / Math.PI
  if (Math.abs(r - Math.round(r)) < 1e-6) {
    const k = Math.round(r)
    if (k === 0) return '0'
    if (k === 1) return 'π'
    if (k === -1) return '-π'
    return `${k}π`
  }
  return `${p.toFixed(2)}`
}

export default function NotebookCircuitView({ circuit }) {
  if (!circuit || !circuit.gates) return null

  const { numQubits, inits = [] } = circuit
  const cols = maxColumn(circuit) + 1
  const drawCols = Math.max(cols, 1)
  const svgW = LEFT_PAD + drawCols * CELL_W + RIGHT_PAD
  const svgH = TOP_PAD * 2 + numQubits * ROW_H

  const colX = (col) => LEFT_PAD + col * CELL_W + CELL_W / 2

  return (
    <div className="nb-circuit-scroll">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} className="nb-circuit-svg" role="img" aria-label="Quantum circuit">
        {/* wires + qubit labels */}
        {Array.from({ length: numQubits }).map((_, q) => {
          const y = rowY(q)
          return (
            <g key={`w${q}`}>
              <line x1={LEFT_PAD - 18} y1={y} x2={svgW - RIGHT_PAD + 8} y2={y} stroke="var(--diagram-wire, #3f3f46)" strokeWidth="1.5" />
              <text x={LEFT_PAD - 26} y={y + 4} textAnchor="end" fontFamily="monospace" fontSize="12" fontWeight="600" fill="var(--text-secondary)">
                {inits[q] || '|0>'}
              </text>
              <text x={LEFT_PAD - 26} y={y + 17} textAnchor="end" fontFamily="monospace" fontSize="9" fill="var(--text-muted)">
                q{q}
              </text>
            </g>
          )
        })}

        {/* gates */}
        {circuit.gates.map((g) => {
          const c = gateColor(g.type)
          const stroke = c.accent
          const x = colX(g.column)
          const targets = g.targets || []
          const controls = g.controls || []
          const wires = gateWires(g)
          const yMin = rowY(Math.min(...wires))
          const yMax = rowY(Math.max(...wires))

          // vertical connector for multi-wire gates
          const connector =
            wires.length > 1 ? (
              <line x1={x} y1={yMin} x2={x} y2={yMax} stroke={stroke} strokeWidth="2.5" opacity="0.7" />
            ) : null

          const controlDots = controls.map((ctrl, k) => (
            <circle key={`ct${k}`} cx={x} cy={rowY(ctrl)} r="6" fill={stroke} />
          ))

          // CX target = ⊕
          if (g.type === 'CX' || g.type === 'CCX') {
            const ty = rowY(targets[0])
            return (
              <g key={g.id}>
                {connector}
                {controlDots}
                <circle cx={x} cy={ty} r="15" fill="var(--bg-card, #151C2C)" stroke={stroke} strokeWidth="2.5" />
                <line x1={x - 15} y1={ty} x2={x + 15} y2={ty} stroke={stroke} strokeWidth="2.5" />
                <line x1={x} y1={ty - 15} x2={x} y2={ty + 15} stroke={stroke} strokeWidth="2.5" />
              </g>
            )
          }

          // CZ target = dot
          if (g.type === 'CZ') {
            return (
              <g key={g.id}>
                {connector}
                {controlDots}
                <circle cx={x} cy={rowY(targets[0])} r="6" fill={stroke} />
              </g>
            )
          }

          // SWAP = two ×
          if (g.type === 'SWAP') {
            return (
              <g key={g.id}>
                {connector}
                {targets.map((t, k) => {
                  const ty = rowY(t)
                  return (
                    <g key={`sw${k}`} stroke={stroke} strokeWidth="2.5">
                      <line x1={x - 9} y1={ty - 9} x2={x + 9} y2={ty + 9} />
                      <line x1={x - 9} y1={ty + 9} x2={x + 9} y2={ty - 9} />
                    </g>
                  )
                })}
              </g>
            )
          }

          // MEASURE = meter box
          if (g.type === 'MEASURE') {
            const ty = rowY(targets[0])
            return (
              <g key={g.id}>
                <rect x={x - 18} y={ty - 18} width="36" height="36" rx="8" fill={`${stroke}22`} stroke={stroke} strokeWidth="2" />
                <path d={`M ${x - 10} ${ty + 6} A 10 10 0 0 1 ${x + 10} ${ty + 6}`} fill="none" stroke={stroke} strokeWidth="2" />
                <line x1={x} y1={ty + 6} x2={x + 8} y2={ty - 6} stroke={stroke} strokeWidth="2" />
              </g>
            )
          }

          // controlled-Y (box with control) and default single/rotation boxes
          const ty = rowY(targets[0])
          const isRot = g.params && g.params.length
          const label = isRot ? g.type : g.type
          const sub = isRot ? fmtAngle(g.params[0]) : null
          return (
            <g key={g.id}>
              {connector}
              {controlDots}
              <rect x={x - 18} y={ty - 18} width="36" height="36" rx="8" fill={`${stroke}22`} stroke={stroke} strokeWidth="2" />
              <text x={x} y={sub ? ty - 1 : ty + 5} textAnchor="middle" fontFamily="monospace" fontSize={label.length > 1 ? '12' : '15'} fontWeight="700" fill={stroke}>
                {label}
              </text>
              {sub && (
                <text x={x} y={ty + 12} textAnchor="middle" fontFamily="monospace" fontSize="8" fill={stroke}>
                  {sub}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
