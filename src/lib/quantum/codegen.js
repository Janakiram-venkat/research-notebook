// Generate Qiskit / Cirq / PennyLane code from the canonical circuit.
// Gates are emitted in (column, then min-row) order.
//
// A gate may carry `condition: { bit, value }` — run only if classical bit
// c[bit] equals value. The four SDKs spell feed-forward four different ways, so
// each generator supplies its own wrapper rather than sharing one shape.

import { gateWires, conditionClauses } from './circuitModel.js'

function orderedGates(circuit) {
  return [...circuit.gates].sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column
    return Math.min(...gateWires(a)) - Math.min(...gateWires(b))
  })
}

const fmtAngle = (v) => {
  const r = v / Math.PI
  const rounded = Math.round(r * 100) / 100
  if (Math.abs(rounded) < 1e-9) return '0'
  if (Math.abs(rounded - 1) < 1e-9) return 'pi'
  if (Math.abs(rounded + 1) < 1e-9) return '-pi'
  return `${rounded} * pi`
}

// A bare fraction of pi (for APIs that take "turns" rather than radians, e.g.
// cirq's *PowGate `exponent`).
const fmtTurns = (v) => Math.round((v / Math.PI) * 1000) / 1000

// Init-state prep lines (only for non-|0> qubits) so exported code matches viz.
function initPrep(circuit, emit) {
  const lines = []
  circuit.inits.forEach((preset, q) => {
    if (!preset || preset === '|0>') return
    const seq = {
      '|1>': ['X'],
      '|+>': ['H'],
      '|->': ['X', 'H'],
      '|i>': ['H', 'S'],
      '|-i>': ['H', 'Sdg'],
    }[preset] || []
    seq.forEach(g => lines.push(emit(g, q)))
  })
  return lines
}

export function generateQiskit(circuit) {
  const n = circuit.numQubits
  const emit = (g, q) => {
    const map = { X: `qc.x(${q})`, H: `qc.h(${q})`, S: `qc.s(${q})`, Sdg: `qc.sdg(${q})` }
    return map[g]
  }
  const prep = initPrep(circuit, emit)

  const lines = []
  // Qiskit 1.0 removed Instruction.c_if; if_test is the supported form. A
  // single clbit can be passed as a (bit, value) pair, but a conjunction needs
  // the classical expression builder, so multi-bit conditions go through expr.
  const term = c => (c.value ? `qc.clbits[${c.bit}]` : `expr.logic_not(qc.clbits[${c.bit}])`)
  const emitOp = (g, line) => {
    const clauses = conditionClauses(g)
    if (!clauses.length) return lines.push(line)
    const test = clauses.length === 1 && clauses[0].value === 1
      ? `(qc.clbits[${clauses[0].bit}], 1)`
      : clauses.map(term).reduce((a, b) => `expr.logic_and(${a}, ${b})`)
    return lines.push(`with qc.if_test(${test}):\n    ${line}`)
  }
  for (const g of orderedGates(circuit)) {
    const t = g.targets
    const cs = g.controls || []
    const a = g.params?.[0] ?? 0
    switch (g.type) {
      case 'H': emitOp(g, `qc.h(${t[0]})`); break
      case 'X': emitOp(g, `qc.x(${t[0]})`); break
      case 'Y': emitOp(g, `qc.y(${t[0]})`); break
      case 'Z': emitOp(g, `qc.z(${t[0]})`); break
      case 'S': emitOp(g, `qc.s(${t[0]})`); break
      case 'Sdg': emitOp(g, `qc.sdg(${t[0]})`); break
      case 'T': emitOp(g, `qc.t(${t[0]})`); break
      case 'Tdg': emitOp(g, `qc.tdg(${t[0]})`); break
      case 'RX': emitOp(g, `qc.rx(${fmtAngle(a)}, ${t[0]})`); break
      case 'RY': emitOp(g, `qc.ry(${fmtAngle(a)}, ${t[0]})`); break
      case 'RZ': emitOp(g, `qc.rz(${fmtAngle(a)}, ${t[0]})`); break
      case 'CX': emitOp(g, `qc.cx(${cs[0]}, ${t[0]})`); break
      case 'CY': emitOp(g, `qc.cy(${cs[0]}, ${t[0]})`); break
      case 'CZ': emitOp(g, `qc.cz(${cs[0]}, ${t[0]})`); break
      case 'CP': emitOp(g, `qc.cp(${fmtAngle(a)}, ${cs[0]}, ${t[0]})`); break
      case 'CCX': emitOp(g, `qc.ccx(${cs[0]}, ${cs[1]}, ${t[0]})`); break
      case 'SWAP': emitOp(g, `qc.swap(${t[0]}, ${t[1]})`); break
      case 'MEASURE': emitOp(g, `qc.measure(${t[0]}, ${t[0]})`); break
      case 'BARRIER': emitOp(g, `qc.barrier()`); break
      default: break
    }
  }

  const body = [...prep, ...lines]
  const measures = circuit.gates.some(g => g.type === 'MEASURE')
  // Statevector.from_instruction raises on a circuit that measures, and a
  // conditional circuit has no single statevector to ask for, so a measuring
  // circuit gets a sampler footer rather than one that fails on first run.
  // expr is only imported when a condition actually needs it.
  const needsExpr = circuit.gates.some(g => {
    const c = conditionClauses(g)
    return c.length > 1 || (c.length === 1 && c[0].value === 0)
  })
  const exprImport = needsExpr ? '\nfrom qiskit.circuit.classical import expr' : ''
  const header = (measures
    ? 'from qiskit import QuantumCircuit\nfrom qiskit.primitives import StatevectorSampler'
    : 'from qiskit import QuantumCircuit\nfrom qiskit.quantum_info import Statevector') + exprImport
  const footer = measures
    ? `# Run it and tally the classical register
result = StatevectorSampler().run([qc], shots=1024).result()
print(result[0].data.c.get_counts())`
    : `# Inspect the statevector / probabilities
state = Statevector.from_instruction(qc)
print(state.probabilities_dict())`

  return `${header}

qc = QuantumCircuit(${n}, ${n})
${body.length ? '# --- gates in time order ---\n' + body.join('\n') : '# (empty circuit)'}

${footer}`
}

export function generateCirq(circuit) {
  const n = circuit.numQubits
  const emit = (g, q) => {
    const map = { X: `cirq.X(q[${q}])`, H: `cirq.H(q[${q}])`, S: `cirq.S(q[${q}])`, Sdg: `cirq.S(q[${q}]) ** -1` }
    return map[g]
  }
  const prep = initPrep(circuit, emit)

  const lines = []
  // Cirq conditions on a measurement *key*, which is why MEASURE below names
  // its key m{qubit}. Testing for 0 has no shorthand and needs a sympy predicate.
  // Bare keys mean "this measurement was 1", so an all-ones conjunction is
  // just a list of keys. Anything testing for 0 needs a sympy predicate.
  const needsSympy = circuit.gates.some(g => conditionClauses(g).some(c => c.value === 0))
  const emitOp = (g, line) => {
    const clauses = conditionClauses(g)
    if (!clauses.length) return lines.push(line)
    const controls = clauses.every(c => c.value === 1)
      ? clauses.map(c => `'m${c.bit}'`).join(', ')
      : clauses.map(c => `sympy.Eq(sympy.Symbol('m${c.bit}'), ${c.value})`).join(', ')
    return lines.push(`${line}.with_classical_controls(${controls})`)
  }
  for (const g of orderedGates(circuit)) {
    const t = g.targets
    const cs = g.controls || []
    const a = g.params?.[0] ?? 0
    switch (g.type) {
      case 'H': emitOp(g, `cirq.H(q[${t[0]}])`); break
      case 'X': emitOp(g, `cirq.X(q[${t[0]}])`); break
      case 'Y': emitOp(g, `cirq.Y(q[${t[0]}])`); break
      case 'Z': emitOp(g, `cirq.Z(q[${t[0]}])`); break
      case 'S': emitOp(g, `cirq.S(q[${t[0]}])`); break
      case 'Sdg': emitOp(g, `cirq.S(q[${t[0]}]) ** -1`); break
      case 'T': emitOp(g, `cirq.T(q[${t[0]}])`); break
      case 'Tdg': emitOp(g, `cirq.T(q[${t[0]}]) ** -1`); break
      case 'RX': emitOp(g, `cirq.rx(${fmtAngle(a)})(q[${t[0]}])`); break
      case 'RY': emitOp(g, `cirq.ry(${fmtAngle(a)})(q[${t[0]}])`); break
      case 'RZ': emitOp(g, `cirq.rz(${fmtAngle(a)})(q[${t[0]}])`); break
      case 'CX': emitOp(g, `cirq.CNOT(q[${cs[0]}], q[${t[0]}])`); break
      case 'CY': emitOp(g, `cirq.Y(q[${t[0]}]).controlled_by(q[${cs[0]}])`); break
      case 'CZ': emitOp(g, `cirq.CZ(q[${cs[0]}], q[${t[0]}])`); break
      case 'CP': emitOp(g, `cirq.CZPowGate(exponent=${fmtTurns(a)})(q[${cs[0]}], q[${t[0]}])`); break
      case 'CCX': emitOp(g, `cirq.CCNOT(q[${cs[0]}], q[${cs[1]}], q[${t[0]}])`); break
      case 'SWAP': emitOp(g, `cirq.SWAP(q[${t[0]}], q[${t[1]}])`); break
      case 'MEASURE': emitOp(g, `cirq.measure(q[${t[0]}], key='m${t[0]}')`); break
      default: break
    }
  }

  const body = [...prep, ...lines]
  const indented = body.length ? body.map(l => '    ' + l).join(',\n') : '    # (empty circuit)'
  return `import cirq${needsSympy ? '\nimport sympy' : ''}

q = cirq.LineQubit.range(${n})
circuit = cirq.Circuit([
${indented}
])
print(circuit)

state = cirq.Simulator().simulate(circuit)
print(state.dirac_notation())`
}

export function generatePennyLane(circuit) {
  const n = circuit.numQubits
  const emit = (g, q) => {
    const map = { X: `qml.PauliX(wires=${q})`, H: `qml.Hadamard(wires=${q})`, S: `qml.S(wires=${q})`, Sdg: `qml.adjoint(qml.S)(wires=${q})` }
    return map[g]
  }
  const prep = initPrep(circuit, emit)

  const lines = []
  // qml.cond takes the operator *class* and its arguments separately, so the
  // already-generated call is split at its first paren and reassembled.
  const emitOp = (g, line) => {
    const clauses = conditionClauses(g)
    if (!clauses.length) return lines.push(line)
    const paren = line.indexOf('(')
    if (paren === -1) return lines.push(line)
    // Mid-circuit measurement values support &, so clauses conjoin directly.
    // A lone clause needs no parentheses around it.
    const test = clauses.length === 1
      ? `m${clauses[0].bit} == ${clauses[0].value}`
      : clauses.map(c => `(m${c.bit} == ${c.value})`).join(' & ')
    return lines.push(`qml.cond(${test}, ${line.slice(0, paren)})${line.slice(paren)}`)
  }
  for (const g of orderedGates(circuit)) {
    const t = g.targets
    const cs = g.controls || []
    const a = g.params?.[0] ?? 0
    switch (g.type) {
      case 'H': emitOp(g, `qml.Hadamard(wires=${t[0]})`); break
      case 'X': emitOp(g, `qml.PauliX(wires=${t[0]})`); break
      case 'Y': emitOp(g, `qml.PauliY(wires=${t[0]})`); break
      case 'Z': emitOp(g, `qml.PauliZ(wires=${t[0]})`); break
      case 'S': emitOp(g, `qml.S(wires=${t[0]})`); break
      case 'Sdg': emitOp(g, `qml.adjoint(qml.S)(wires=${t[0]})`); break
      case 'T': emitOp(g, `qml.T(wires=${t[0]})`); break
      case 'Tdg': emitOp(g, `qml.adjoint(qml.T)(wires=${t[0]})`); break
      case 'RX': emitOp(g, `qml.RX(${fmtAngle(a)}, wires=${t[0]})`); break
      case 'RY': emitOp(g, `qml.RY(${fmtAngle(a)}, wires=${t[0]})`); break
      case 'RZ': emitOp(g, `qml.RZ(${fmtAngle(a)}, wires=${t[0]})`); break
      case 'CX': emitOp(g, `qml.CNOT(wires=[${cs[0]}, ${t[0]}])`); break
      case 'CY': emitOp(g, `qml.CY(wires=[${cs[0]}, ${t[0]}])`); break
      case 'CZ': emitOp(g, `qml.CZ(wires=[${cs[0]}, ${t[0]}])`); break
      case 'CP': emitOp(g, `qml.ControlledPhaseShift(${fmtAngle(a)}, wires=[${cs[0]}, ${t[0]}])`); break
      case 'CCX': emitOp(g, `qml.Toffoli(wires=[${cs[0]}, ${cs[1]}, ${t[0]}])`); break
      case 'SWAP': emitOp(g, `qml.SWAP(wires=[${t[0]}, ${t[1]}])`); break
      case 'MEASURE': emitOp(g, `m${t[0]} = qml.measure(${t[0]})`); break
      default: break
    }
  }

  const body = [...prep, ...lines]
  const indented = body.length ? body.map(l => '    ' + l).join('\n') : '    pass  # (empty circuit)'
  return `import pennylane as qml

dev = qml.device("default.qubit", wires=${n})

@qml.qnode(dev)
def circuit():
${indented}
    return qml.probs(wires=range(${n}))

print(circuit())`
}

export function generateQASM(circuit) {
  const n = circuit.numQubits
  const emit = (g, q) => ({ X: `x q[${q}];`, H: `h q[${q}];`, S: `s q[${q}];`, Sdg: `sdg q[${q}];` }[g])
  const prep = initPrep(circuit, emit)

  // OpenQASM 2's `if` compares a whole classical register against an integer:
  // it cannot address one bit of a register, and it has no boolean operators.
  // So every distinct set of bits a condition reads gets a register of its own,
  // and each Measure copies its outcome into the sets that need it. Re-reading
  // a qubit that has already collapsed is deterministic, so the copy is exact.
  const condRegs = []
  const regIndex = new Map()
  const keyOf = clauses => clauses.map(c => c.bit).join(',')
  for (const g of orderedGates(circuit)) {
    const clauses = conditionClauses(g)
    if (!clauses.length) continue
    const key = keyOf(clauses)
    if (regIndex.has(key)) continue
    regIndex.set(key, condRegs.length)
    condRegs.push(clauses.map(c => c.bit))
  }
  const copiesFor = bit => condRegs.flatMap((bits, i) => {
    const slot = bits.indexOf(bit)
    return slot === -1 ? [] : [`measure q[${bit}] -> k${i}[${slot}];`]
  })

  const lines = []
  const emitOp = (g, line) => {
    const clauses = conditionClauses(g)
    if (!clauses.length) return lines.push(line)
    // Slot j of the register holds clause j, so the register reads as an
    // integer with clause j contributing bit j.
    const value = clauses.reduce((acc, c, j) => acc | (c.value << j), 0)
    return lines.push(`if (k${regIndex.get(keyOf(clauses))}==${value}) ${line}`)
  }
  for (const g of orderedGates(circuit)) {
    const t = g.targets
    const cs = g.controls || []
    const a = g.params?.[0] ?? 0
    switch (g.type) {
      case 'H': emitOp(g, `h q[${t[0]}];`); break
      case 'X': emitOp(g, `x q[${t[0]}];`); break
      case 'Y': emitOp(g, `y q[${t[0]}];`); break
      case 'Z': emitOp(g, `z q[${t[0]}];`); break
      case 'S': emitOp(g, `s q[${t[0]}];`); break
      case 'Sdg': emitOp(g, `sdg q[${t[0]}];`); break
      case 'T': emitOp(g, `t q[${t[0]}];`); break
      case 'Tdg': emitOp(g, `tdg q[${t[0]}];`); break
      case 'RX': emitOp(g, `rx(${fmtAngle(a)}) q[${t[0]}];`); break
      case 'RY': emitOp(g, `ry(${fmtAngle(a)}) q[${t[0]}];`); break
      case 'RZ': emitOp(g, `rz(${fmtAngle(a)}) q[${t[0]}];`); break
      case 'CX': emitOp(g, `cx q[${cs[0]}],q[${t[0]}];`); break
      case 'CY': emitOp(g, `cy q[${cs[0]}],q[${t[0]}];`); break
      case 'CZ': emitOp(g, `cz q[${cs[0]}],q[${t[0]}];`); break
      case 'CP': emitOp(g, `cu1(${fmtAngle(a)}) q[${cs[0]}],q[${t[0]}];`); break
      case 'CCX': emitOp(g, `ccx q[${cs[0]}],q[${cs[1]}],q[${t[0]}];`); break
      case 'SWAP': emitOp(g, `swap q[${t[0]}],q[${t[1]}];`); break
      case 'MEASURE':
        emitOp(g, `measure q[${t[0]}] -> c[${t[0]}];`)
        for (const copy of copiesFor(t[0])) lines.push(copy)
        break
      case 'BARRIER': emitOp(g, `barrier q;`); break
      default: break
    }
  }

  const body = [...prep, ...lines]
  return `OPENQASM 2.0;
include "qelib1.inc";

qreg q[${n}];
creg c[${n}];
${condRegs.map((bits, i) => `creg k${i}[${bits.length}];  // c${bits.join(', c')}`).join('\n')}
${body.length ? body.join('\n') : '// (empty circuit)'}`
}

export const CODEGEN = {
  qiskit: generateQiskit,
  cirq: generateCirq,
  pennylane: generatePennyLane,
  qasm: generateQASM,
}
