// Gate metadata + 2x2 complex matrices for the client-side simulator.
// Convention: little-endian (Qiskit). Qubit q corresponds to bit q of the
// state index; basis labels print qubit n-1 leftmost ... qubit 0 rightmost.

const c = (re, im = 0) => ({ re, im })
const SQRT1_2 = Math.SQRT1_2

// Static 2x2 matrices for non-parameterized gates: [[a, b], [c, d]]
export const STATIC_MATRICES = {
  H: [[c(SQRT1_2), c(SQRT1_2)], [c(SQRT1_2), c(-SQRT1_2)]],
  X: [[c(0), c(1)], [c(1), c(0)]],
  Y: [[c(0), c(0, -1)], [c(0, 1), c(0)]],
  Z: [[c(1), c(0)], [c(0), c(-1)]],
  S: [[c(1), c(0)], [c(0), c(0, 1)]],
  Sdg: [[c(1), c(0)], [c(0), c(0, -1)]],
  T: [[c(1), c(0)], [c(0), c(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4))]],
  Tdg: [[c(1), c(0)], [c(0), c(Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4))]],
  I: [[c(1), c(0)], [c(0), c(1)]],
}

// Parameterized rotation matrices
export function rotationMatrix(type, theta) {
  const co = Math.cos(theta / 2)
  const si = Math.sin(theta / 2)
  if (type === 'RX') return [[c(co), c(0, -si)], [c(0, -si), c(co)]]
  if (type === 'RY') return [[c(co), c(-si)], [c(si), c(co)]]
  // RZ
  return [[c(co, -si), c(0)], [c(0), c(co, si)]]
}

// Phase matrix applied to the target when a Controlled-Phase gate's control
// is |1⟩: diag(1, e^{iθ}). Unlike RZ this carries no global-phase ambiguity —
// it's the same convention as Qiskit's `cp`/OpenQASM's `cu1`.
export function phaseMatrix(theta) {
  return [[c(1), c(0)], [c(0), c(Math.cos(theta), Math.sin(theta))]]
}

// Per-qubit initial states (single-qubit amplitude pairs [a0, a1])
export const INIT_PRESETS = {
  '|0>': [c(1), c(0)],
  '|1>': [c(0), c(1)],
  '|+>': [c(SQRT1_2), c(SQRT1_2)],
  '|->': [c(SQRT1_2), c(-SQRT1_2)],
  '|i>': [c(SQRT1_2), c(0, SQRT1_2)],
  '|-i>': [c(SQRT1_2), c(0, -SQRT1_2)],
}

export const INIT_ORDER = ['|0>', '|1>', '|+>', '|->', '|i>', '|-i>']

// ── Gate catalogue ──────────────────────────────────────────────────────────
// category: single | rotation | two | multi | meas
// controls: number of control qubits, targets: number of target qubits
// purpose: one-line what-it-does · example: a representative transformation
export const GATE_DEFS = {
  H: { type: 'H', label: 'Hadamard', glyph: 'H', category: 'single', controls: 0, targets: 1, color: 'unitary',
    purpose: 'Creates an equal superposition of |0⟩ and |1⟩.', example: '|0⟩ → (|0⟩ + |1⟩)/√2' },
  X: { type: 'X', label: 'Pauli-X', glyph: 'X', category: 'single', controls: 0, targets: 1, color: 'unitary',
    purpose: 'Bit flip, the quantum NOT gate.', example: '|0⟩ → |1⟩,  |1⟩ → |0⟩' },
  Y: { type: 'Y', label: 'Pauli-Y', glyph: 'Y', category: 'single', controls: 0, targets: 1, color: 'unitary',
    purpose: 'Combined bit + phase flip about the Y axis.', example: '|0⟩ → i|1⟩,  |1⟩ → −i|0⟩' },
  Z: { type: 'Z', label: 'Pauli-Z', glyph: 'Z', category: 'single', controls: 0, targets: 1, color: 'unitary',
    purpose: 'Phase flip, negates the |1⟩ amplitude.', example: '|1⟩ → −|1⟩' },
  S: { type: 'S', label: 'Phase S', glyph: 'S', category: 'single', controls: 0, targets: 1, color: 'phase',
    purpose: 'Quarter turn (90°) phase gate, √Z.', example: '|1⟩ → i|1⟩' },
  Sdg: { type: 'Sdg', label: 'Phase S-dagger', glyph: 'S†', category: 'single', controls: 0, targets: 1, color: 'phase',
    purpose: 'Inverse quarter turn (−90°) phase gate, undoes S.', example: '|1⟩ → −i|1⟩' },
  T: { type: 'T', label: 'Phase T', glyph: 'T', category: 'single', controls: 0, targets: 1, color: 'phase',
    purpose: 'Eighth turn (45°) phase gate, √S.', example: '|1⟩ → e^{iπ/4}|1⟩' },
  Tdg: { type: 'Tdg', label: 'Phase T-dagger', glyph: 'T†', category: 'single', controls: 0, targets: 1, color: 'phase',
    purpose: 'Inverse eighth turn (−45°) phase gate, undoes T.', example: '|1⟩ → e^{−iπ/4}|1⟩' },
  RX: { type: 'RX', label: 'X-Rotation', glyph: 'RX', category: 'rotation', controls: 0, targets: 1, color: 'rotation', param: true,
    purpose: 'Rotates the state by θ around the X axis.', example: 'RX(π) = X (up to phase)' },
  RY: { type: 'RY', label: 'Y-Rotation', glyph: 'RY', category: 'rotation', controls: 0, targets: 1, color: 'rotation', param: true,
    purpose: 'Rotates the state by θ around the Y axis.', example: 'RY(π/2)|0⟩ = (|0⟩+|1⟩)/√2' },
  RZ: { type: 'RZ', label: 'Z-Rotation', glyph: 'RZ', category: 'rotation', controls: 0, targets: 1, color: 'rotation', param: true,
    purpose: 'Rotates the state by θ around the Z axis.', example: 'Adds relative phase e^{iθ}' },
  CX: { type: 'CX', label: 'CNOT', glyph: '⊕', category: 'two', controls: 1, targets: 1, color: 'controlled',
    purpose: 'Flips the target iff the control is |1⟩. Key entangler.', example: '|10⟩ → |11⟩' },
  CY: { type: 'CY', label: 'Controlled-Y', glyph: 'Y', category: 'two', controls: 1, targets: 1, color: 'controlled',
    purpose: 'Applies Y to the target iff the control is |1⟩.', example: '|11⟩ → −i|10⟩' },
  CZ: { type: 'CZ', label: 'Controlled-Z', glyph: 'Z', category: 'two', controls: 1, targets: 1, color: 'controlled',
    purpose: 'Phase-flips |11⟩. Symmetric in control/target.', example: '|11⟩ → −|11⟩' },
  CP: { type: 'CP', label: 'Controlled-Phase', glyph: 'P', category: 'two', controls: 1, targets: 1, color: 'controlled', param: true,
    purpose: 'Applies a tunable phase e^{iθ} to |11⟩, the building block of QFT and QPE.', example: '|11⟩ → e^{iθ}|11⟩' },
  SWAP: { type: 'SWAP', label: 'Swap', glyph: '×', category: 'two', controls: 0, targets: 2, color: 'controlled',
    purpose: 'Exchanges the states of two qubits.', example: '|01⟩ → |10⟩' },
  CCX: { type: 'CCX', label: 'Toffoli', glyph: '⊕', category: 'multi', controls: 2, targets: 1, color: 'controlled',
    purpose: 'Flips the target iff both controls are |1⟩. Universal for classical logic.', example: '|110⟩ → |111⟩' },
  MEASURE: { type: 'MEASURE', label: 'Measure', glyph: 'M', category: 'meas', controls: 0, targets: 1, color: 'measure',
    purpose: 'Samples a random outcome, collapsing the qubit to |0⟩ or |1⟩. Re-roll to sample again.', example: '(|0⟩+|1⟩)/√2 → 0 or 1, ~50/50' },
  BARRIER: { type: 'BARRIER', label: 'Barrier', glyph: '❙', category: 'meas', controls: 0, targets: 1, color: 'measure',
    purpose: 'Marks a stage boundary across the whole register, no effect on the simulation.', example: '|ψ⟩ → |ψ⟩ (unchanged)' },
}

export const PALETTE_GROUPS = [
  { label: 'Single Qubit', gates: ['H', 'X', 'Y', 'Z'] },
  { label: 'Phase Gates', gates: ['S', 'Sdg', 'T', 'Tdg'] },
  { label: 'Rotations', gates: ['RX', 'RY', 'RZ'] },
  { label: 'Controlled Gates', gates: ['CX', 'CY', 'CZ', 'CP', 'SWAP'] },
  // BARRIER used to be withheld here. It no-ops in the simulator, and when it
  // drew as a one-wire box a learner who placed one saw every panel stay
  // identical and concluded the tool was broken. It now draws as a dashed
  // divider across the whole register, which reads as a stage marker rather
  // than an operation, so the confusion it was hidden to avoid is gone.
  { label: 'Advanced Gates', gates: ['CCX', 'MEASURE', 'BARRIER'] },
]

// Accent colour per gate role.
//
// Gates used to carry eleven unrelated hues, which made the palette read as a
// colour chart and told the learner nothing: violet-vs-rose says nothing about
// what H does differently from X. Colour now encodes the one thing that is
// actually shared within a group — what kind of operation it is — and the
// glyph does the identifying. Measurement is the only non-unitary gate here,
// the only one that destroys the state, so it is the only one in pink.
//
// These are CSS variable references, not literals: every consumer feeds
// `.accent` into a style prop or a custom property, so the browser resolves it
// against whichever theme is active. They used to be raw hex, which meant the
// gate palette stayed dark-theme cyan on a light page.
//
// Each entry borrows the swatch of the gate that best represents its role, so
// the palette, the canvas and the rendered diagram all agree on what an H is.
// (This map previously also carried `box`/`dot`/`stroke` Tailwind class
// strings hardcoded to cyan and pink. Nothing read them — every call site uses
// `.accent` — and they could not follow the theme, so they are gone.)
export const GATE_COLORS = {
  unitary:    { accent: 'var(--gate-h-stroke)' },
  phase:      { accent: 'var(--gate-z-stroke)' },
  rotation:   { accent: 'var(--gate-y-stroke)' },
  controlled: { accent: 'var(--gate-cnot-stroke)' },
  measure:    { accent: 'var(--gate-measure-stroke)' },
}

export function gateColor(type) {
  const def = GATE_DEFS[type]
  return GATE_COLORS[def?.color] || GATE_COLORS.controlled
}
