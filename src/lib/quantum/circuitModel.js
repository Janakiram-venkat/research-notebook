// Canonical circuit model + pure layout engine (span reservation, collision,
// auto-arrange). Everything (render / sim / export) derives from this object.
//
//   Circuit = { numQubits, gates: GateInstance[], inits: string[] }
//   GateInstance = { id, type, targets:number[], controls:number[], params?, column,
//                    condition? }
//
// The classical register is implicit: one bit per qubit wire, where c[q] is
// written by a Measure on qubit q. That is the shape the exported code has
// always declared (`creg c[n]`, `measure q[t] -> c[t]`), so conditioning needs
// no separate register-size control and no second layout axis.
//
//   condition = { bits: [{ bit:number, value:0|1 }, ...] }
//
// The clauses are ANDed: the gate runs only if every listed bit already holds
// its listed value. One clause is the common case (teleportation's corrections);
// two are what a syndrome needs, since "ancilla 0 fired and ancilla 1 did not"
// is a different error from "both fired" and a single bit cannot tell them
// apart. The legacy one-bit shape { bit, value } is still read on load.

import { GATE_DEFS, INIT_ORDER } from './gates.js'

// Single source of truth for register size — the dense statevector simulator
// is O(2^n), and every layer (UI stepper, model, persistence) must agree or a
// circuit built at one limit can silently violate another when loaded.
export const MIN_QUBITS = 1
// Raised from 8 once the simulator moved to typed arrays: one run of a deep
// 12-qubit circuit is a few milliseconds, and the panels below all filter to
// populated basis states rather than walking the whole register.
export const MAX_QUBITS = 12

let _idCounter = 0
export function newId() {
  _idCounter += 1
  return `g${Date.now().toString(36)}_${_idCounter}`
}

export function emptyCircuit(numQubits = 3) {
  return {
    numQubits,
    gates: [],
    inits: Array.from({ length: numQubits }, () => INIT_ORDER[0]),
  }
}

// All wires a gate touches (targets + controls).
export function gateWires(gate) {
  return [...(gate.targets || []), ...(gate.controls || [])]
}

// Continuous vertical span [min,max] the gate reserves (incl. pass-through).
export function gateSpan(gate) {
  const wires = gateWires(gate)
  return { min: Math.min(...wires), max: Math.max(...wires) }
}

// Is every cell of [span] x col free (ignoring gate `excludeId`)?
export function isColumnFree(circuit, span, col, excludeId = null) {
  return !circuit.gates.some(g => {
    if (g.id === excludeId) return false
    if (g.column !== col) return false
    const s = gateSpan(g)
    // Overlap of [span.min,span.max] and [s.min,s.max]
    return span.min <= s.max && s.min <= span.max
  })
}

// Smallest column >= fromCol whose span is free.
export function findFreeColumn(circuit, span, fromCol, excludeId = null) {
  let col = Math.max(0, fromCol)
  while (!isColumnFree(circuit, span, col, excludeId)) col += 1
  return col
}

export function maxColumn(circuit) {
  return circuit.gates.reduce((m, g) => Math.max(m, g.column), -1)
}

// Number of grid columns to render (trailing empty column for dropping).
export function columnCount(circuit, minCols = 8) {
  return Math.max(minCols, maxColumn(circuit) + 2)
}

// Build a default gate instance of `type` near the drop `row`. Multi-qubit gates
// occupy a COMPACT, CONTIGUOUS block of wires anchored so the primary target
// sits on `row` (clamped to stay on-grid). Convention: controls on the wires
// above the target(s). This keeps gates local to where the user drops them
// instead of stretching across the whole register.
export function makeGate(type, row, numQubits) {
  const def = GATE_DEFS[type]
  const gate = { id: newId(), type, targets: [], controls: [], column: 0 }
  if (def.param) gate.params = [Math.PI / 2]

  // A barrier marks a stage boundary for the whole register, not one wire. It
  // holds every wire so span reservation, auto-arrange and the drawing all
  // agree that nothing crosses it.
  if (type === 'BARRIER') {
    gate.targets = Array.from({ length: numQubits }, (_, i) => i)
    return gate
  }

  const total = def.controls + def.targets

  // Top of the contiguous block so the LAST wire (primary target) lands on `row`.
  let top = row - (total - 1)
  top = Math.max(0, Math.min(top, numQubits - total))

  const wires = Array.from({ length: total }, (_, i) => top + i)
  gate.controls = wires.slice(0, def.controls)     // controls first (top)
  gate.targets = wires.slice(def.controls)          // target(s) at the bottom
  return gate
}

// ── Mutations (return new circuit; never mutate in place) ────────────────────

export function placeNewGate(circuit, type, row, col) {
  const def = GATE_DEFS[type]
  if (!def) return circuit
  if (def.controls + def.targets > circuit.numQubits) return circuit // not enough wires

  const gate = makeGate(type, row, circuit.numQubits)
  const span = gateSpan(gate)
  gate.column = findFreeColumn(circuit, span, col)
  return { ...circuit, gates: [...circuit.gates, gate] }
}

// Move a gate so the grabbed wire (`grabRow`, the node the user actually picked
// up) lands on `row`. Falls back to the top wire when no grab wire is given.
// The whole multi-qubit shape shifts together and is clamped to stay on-grid.
export function moveGate(circuit, id, row, col, grabRow = null) {
  const gate = circuit.gates.find(g => g.id === id)
  if (!gate) return circuit

  // A barrier spans everything, so a drag can only move it in time.
  if (gate.type === 'BARRIER') {
    const moved = { ...gate, column: findFreeColumn(circuit, gateSpan(gate), col, id) }
    return { ...circuit, gates: circuit.gates.map(g => (g.id === id ? moved : g)) }
  }

  const anchor = grabRow != null ? grabRow : Math.min(...gateWires(gate))
  const delta = row - anchor
  let targets = gate.targets.map(t => t + delta)
  let controls = (gate.controls || []).map(c => c + delta)

  // Keep within bounds; if shifting pushes off-grid, clamp the whole gate.
  const all = [...targets, ...controls]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  if (lo < 0) {
    targets = targets.map(t => t - lo)
    controls = controls.map(c => c - lo)
  } else if (hi > circuit.numQubits - 1) {
    const over = hi - (circuit.numQubits - 1)
    targets = targets.map(t => t - over)
    controls = controls.map(c => c - over)
  }

  const moved = { ...gate, targets, controls }
  const span = gateSpan(moved)
  moved.column = findFreeColumn(circuit, span, col, id)
  return { ...circuit, gates: circuit.gates.map(g => (g.id === id ? moved : g)) }
}

/**
 * Point one control of `id` at `row`, moving the gate to `col`.
 *
 * `makeGate` builds every multi-qubit gate as a contiguous block, so a drag can
 * only ever produce adjacent wires. Re-pointing a control is what makes a
 * CX from q0 to q2 reachable by dragging rather than only through the
 * inspector's dropdowns. Returns the circuit unchanged when the wire is
 * already spoken for, so an illegal drop is a no-op rather than a corruption.
 */
export function rewireControl(circuit, id, index, row, col) {
  const gate = circuit.gates.find(g => g.id === id)
  if (!gate) return circuit

  const controls = [...(gate.controls || [])]
  if (index < 0 || index >= controls.length) return circuit
  if (row < 0 || row >= circuit.numQubits) return circuit
  // One wire cannot be both a control and a target, nor two controls at once.
  if (gate.targets.includes(row)) return circuit
  if (controls.some((c, i) => i !== index && c === row)) return circuit

  controls[index] = row
  const moved = { ...gate, controls }
  moved.column = findFreeColumn(circuit, gateSpan(moved), col, id)
  return { ...circuit, gates: circuit.gates.map(g => (g.id === id ? moved : g)) }
}

export function updateGate(circuit, id, patch) {
  return {
    ...circuit,
    gates: circuit.gates.map(g => (g.id === id ? { ...g, ...patch } : g)),
  }
}

/**
 * Copy `id` onto the first free column at or after its own.
 *
 * Rebuilding a gate by hand — pick the type, re-point every control, re-enter
 * the angle, re-attach the condition — is the slowest thing in the composer,
 * and it is what people do most while exploring.
 */
export function duplicateGate(circuit, id) {
  const gate = circuit.gates.find(g => g.id === id)
  if (!gate) return { circuit, id: null }

  const copy = {
    ...gate,
    id: newId(),
    targets: [...gate.targets],
    controls: [...(gate.controls || [])],
    ...(gate.params ? { params: [...gate.params] } : {}),
    ...(gate.condition ? { condition: { bits: conditionClauses(gate).map(c => ({ ...c })) } } : {}),
  }
  copy.column = findFreeColumn(circuit, gateSpan(copy), gate.column + 1)
  return { circuit: { ...circuit, gates: [...circuit.gates, copy] }, id: copy.id }
}

/**
 * Paste `gate` (a detached copy, from another circuit or an earlier session)
 * onto `row`/`col`, shifting its whole shape so the primary target lands there.
 * Returns the original circuit when the gate cannot fit the register.
 */
export function pasteGate(circuit, gate, row, col) {
  if (!gate || !GATE_DEFS[gate.type]) return { circuit, id: null }

  const wires = gateWires(gate)
  if (wires.length > circuit.numQubits) return { circuit, id: null }

  if (gate.type === 'BARRIER') {
    const placed = { ...makeGate('BARRIER', 0, circuit.numQubits), column: 0 }
    placed.column = findFreeColumn(circuit, gateSpan(placed), col)
    return { circuit: { ...circuit, gates: [...circuit.gates, placed] }, id: placed.id }
  }

  // Anchor on the primary target, the same wire a drag would land on.
  const anchor = gate.targets[gate.targets.length - 1]
  let delta = row - anchor
  const lo = Math.min(...wires) + delta
  const hi = Math.max(...wires) + delta
  if (lo < 0) delta -= lo
  else if (hi > circuit.numQubits - 1) delta -= hi - (circuit.numQubits - 1)

  const placed = {
    ...gate,
    id: newId(),
    targets: gate.targets.map(t => t + delta),
    controls: (gate.controls || []).map(c => c + delta),
    ...(gate.params ? { params: [...gate.params] } : {}),
    // A pasted condition names classical bits, which do not shift with the
    // wires; anything off the end of this register is dropped rather than
    // silently re-pointed at a bit the user never chose.
    ...(gate.condition
      ? { condition: normalizeCondition(conditionClauses(gate), circuit.numQubits) }
      : {}),
  }
  placed.column = findFreeColumn(circuit, gateSpan(placed), Math.max(0, col))
  return { circuit: { ...circuit, gates: [...circuit.gates, placed] }, id: placed.id }
}

export function removeGate(circuit, id) {
  return { ...circuit, gates: circuit.gates.filter(g => g.id !== id) }
}

export function setNumQubits(circuit, n) {
  const next = Math.max(MIN_QUBITS, Math.min(MAX_QUBITS, n))
  // Drop gates that no longer fit; grow/shrink inits. A gate conditioned on a
  // classical bit that just went away keeps the gate and loses the condition —
  // shrinking the register should not silently delete an operation.
  const gates = circuit.gates
    .map(g => (g.type === 'BARRIER'
      ? { ...g, targets: Array.from({ length: next }, (_, i) => i) }
      : g))
    .filter(g => gateWires(g).every(w => w < next))
    .map(g => (g.condition
      ? { ...g, condition: normalizeCondition(conditionClauses(g), next) }
      : g))
  const inits = Array.from({ length: next }, (_, i) => circuit.inits[i] || INIT_ORDER[0])
  return { ...circuit, numQubits: next, gates, inits }
}

export function setInit(circuit, row, preset) {
  const inits = [...circuit.inits]
  inits[row] = preset
  return { ...circuit, inits }
}

// ── Classical conditions (c_if) ──────────────────────────────────────────────

// Measurement writes the register and a barrier is a drawing, so neither can
// itself be conditional; everything else can.
export function canBeConditional(gate) {
  return gate.type !== 'MEASURE' && gate.type !== 'BARRIER'
}

/**
 * A gate's condition as a clause list, reading the legacy one-bit shape too.
 * Every consumer goes through here so no caller has to know both shapes exist.
 */
export function conditionClauses(gate) {
  const c = gate?.condition
  if (!c) return []
  if (Array.isArray(c.bits)) return c.bits
  if (typeof c.bit === 'number') return [{ bit: c.bit, value: c.value ? 1 : 0 }]
  return []
}

export const conditionBits = gate => conditionClauses(gate).map(c => c.bit)

// Sorted, de-duplicated, in range. Returns null for "no condition" so the
// absence of a condition has exactly one representation.
export function normalizeCondition(clauses, numQubits) {
  const byBit = new Map()
  for (const clause of clauses || []) {
    const bit = clause?.bit | 0
    if (bit < 0 || bit >= numQubits) continue
    byBit.set(bit, { bit, value: clause.value ? 1 : 0 })
  }
  if (byBit.size === 0) return null
  return { bits: [...byBit.values()].sort((a, b) => a.bit - b.bit) }
}

/** Human-readable form, shared by tooltips, validation and the inspector. */
export function describeCondition(gate) {
  return conditionClauses(gate).map(c => `c${c.bit}=${c.value}`).join(' and ')
}

// Accepts a clause list, the legacy { bit, value }, or null to clear.
export function setCondition(circuit, id, condition) {
  const gate = circuit.gates.find(g => g.id === id)
  if (!gate || !canBeConditional(gate)) return circuit
  const clauses = Array.isArray(condition)
    ? condition
    : conditionClauses({ condition })
  return updateGate(circuit, id, { condition: normalizeCondition(clauses, circuit.numQubits) })
}

// Column of the Measure that last writes c[bit] before `beforeColumn`, or -1.
// Validation uses it to catch a gate conditioned on a bit nothing has written
// yet — which reads as "the gate silently never fires".
export function measureColumnFor(circuit, bit, beforeColumn = Infinity) {
  let found = -1
  for (const g of circuit.gates) {
    if (g.type !== 'MEASURE') continue
    if (g.targets[0] !== bit) continue
    if (g.column >= beforeColumn) continue
    if (g.column > found) found = g.column
  }
  return found
}

// ── Optimization: cancel inverse pairs + merge adjacent rotations ────────────

const SELF_INVERSE = new Set(['H', 'X', 'Y', 'Z', 'CX', 'CY', 'CZ', 'SWAP', 'CCX'])
const PAIR_INVERSE = { S: 'Sdg', Sdg: 'S', T: 'Tdg', Tdg: 'T' }
const ROTATIONS = new Set(['RX', 'RY', 'RZ'])
const TWO_PI = Math.PI * 2

// A conditional gate is never cancelled or merged. Whether it runs at all
// depends on a classical bit that a Measure elsewhere in the circuit may write
// between the two candidates, so the "nothing happened on this wire in between"
// argument that justifies every rewrite below does not hold for it.
const isRewritable = g => !g.condition

const isSingle = g =>
  (g.targets || []).length === 1 && (g.controls || []).length === 0 && isRewritable(g)
const sameWireSet = (a, b) => {
  const wa = gateWires(a).slice().sort((x, y) => x - y).join(',')
  const wb = gateWires(b).slice().sort((x, y) => x - y).join(',')
  return wa === wb
}
// Same operation acting on the same control/target roles (for 2-qubit cancel).
const sameOp = (a, b) =>
  a.type === b.type &&
  (a.targets || []).join(',') === (b.targets || []).join(',') &&
  (a.controls || []).join(',') === (b.controls || []).join(',')

function nextOnWire(gates, from, wire) {
  for (let j = from + 1; j < gates.length; j++) {
    if (gateWires(gates[j]).includes(wire)) return j
  }
  return -1
}

/**
 * Simplify a circuit by removing trivially cancelling adjacent gates and
 * merging consecutive same-axis rotations. Never reorders operations on a
 * wire, so the unitary is preserved. Returns { circuit, removed }.
 */
export function optimizeCircuit(circuit) {
  let gates = [...circuit.gates].map(g => ({ ...g }))
  let removed = 0
  let changed = true
  let guard = 0

  while (changed && guard++ < 500) {
    changed = false
    gates.sort((a, b) => (a.column !== b.column ? a.column - b.column
      : Math.min(...gateWires(a)) - Math.min(...gateWires(b))))

    for (let i = 0; i < gates.length && !changed; i++) {
      const g = gates[i]

      // Single-qubit simplifications (the next gate on this wire).
      if (isSingle(g)) {
        const w = g.targets[0]
        const j = nextOnWire(gates, i, w)
        if (j !== -1 && isSingle(gates[j]) && gates[j].targets[0] === w) {
          const h = gates[j]
          if (SELF_INVERSE.has(g.type) && h.type === g.type) {
            gates.splice(j, 1); gates.splice(i, 1); removed += 2; changed = true; break
          }
          if (PAIR_INVERSE[g.type] === h.type) {
            gates.splice(j, 1); gates.splice(i, 1); removed += 2; changed = true; break
          }
          if (ROTATIONS.has(g.type) && h.type === g.type) {
            const sum = (g.params[0] + h.params[0]) % TWO_PI
            if (Math.abs(sum) < 1e-9 || Math.abs(Math.abs(sum) - TWO_PI) < 1e-9) {
              gates.splice(j, 1); gates.splice(i, 1); removed += 2
            } else {
              g.params = [sum]; gates.splice(j, 1); removed += 1
            }
            changed = true; break
          }
        }
        continue
      }

      // Multi-qubit self-inverse cancel: same gate is the immediate successor
      // on every wire it touches.
      if (SELF_INVERSE.has(g.type) && isRewritable(g)) {
        const wires = gateWires(g)
        const succ = wires.map(w => nextOnWire(gates, i, w))
        const j = succ[0]
        if (j !== -1 && succ.every(s => s === j) && isRewritable(gates[j]) &&
            sameOp(g, gates[j]) && sameWireSet(g, gates[j])) {
          gates.splice(j, 1); gates.splice(i, 1); removed += 2; changed = true; break
        }
      }
    }
  }

  return { circuit: autoArrange({ ...circuit, gates }), removed }
}

// ── Auto-arrange: greedy left-packing, preserving per-qubit gate order ───────
export function autoArrange(circuit) {
  // Process gates in current (column, min-row) order so per-wire order is kept.
  const ordered = [...circuit.gates].sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column
    return Math.min(...gateWires(a)) - Math.min(...gateWires(b))
  })

  const placed = []
  const lastColOnWire = new Array(circuit.numQubits).fill(-1)
  // Column of the most recent Measure writing each classical bit. Packing is a
  // pure left-shift on the quantum wires, which would happily slide a
  // conditional gate ahead of the Measure that feeds it — leaving a gate that
  // reads a bit nothing has written yet and so never fires.
  const lastWriteOnCbit = new Array(circuit.numQubits).fill(-1)

  for (const gate of ordered) {
    const wires = gateWires(gate)
    const span = { min: Math.min(...wires), max: Math.max(...wires) }
    // Earliest column: after the last gate on every wire it touches.
    let earliest = 0
    for (let w = span.min; w <= span.max; w++) {
      earliest = Math.max(earliest, lastColOnWire[w] + 1)
    }
    for (const bit of conditionBits(gate)) {
      earliest = Math.max(earliest, lastWriteOnCbit[bit] + 1)
    }
    // Respect span-reservation against already-placed gates.
    let col = earliest
    while (placed.some(g => {
      if (g.column !== col) return false
      const s = { min: Math.min(...gateWires(g)), max: Math.max(...gateWires(g)) }
      return span.min <= s.max && s.min <= span.max
    })) col += 1

    const next = { ...gate, column: col }
    placed.push(next)
    for (let w = span.min; w <= span.max; w++) lastColOnWire[w] = col
    if (gate.type === 'MEASURE') lastWriteOnCbit[gate.targets[0]] = col
  }

  return { ...circuit, gates: placed }
}
