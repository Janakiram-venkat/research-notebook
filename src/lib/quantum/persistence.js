// Circuit persistence: localStorage projects, JSON import/export, share links.
// A circuit is plain data ({ numQubits, gates, inits }); we store a compact,
// id-free "portable" form and regenerate ids on load.

import {
  newId, MIN_QUBITS, MAX_QUBITS, conditionClauses, normalizeCondition,
} from './circuitModel.js'
import { GATE_DEFS, INIT_ORDER } from './gates.js'

const STORE_KEY = 'qcb.sandbox.projects'

function toPortable(circuit) {
  return {
    n: circuit.numQubits,
    i: circuit.inits,
    g: circuit.gates.map(g => ({
      t: g.type,
      tg: g.targets,
      c: g.controls || [],
      p: g.params,
      col: g.column,
      // [[bit, value], ...] — omitted entirely when the gate is unconditional,
      // so circuits saved before classical control round-trip byte-identical.
      ...(g.condition ? { cond: conditionClauses(g).map(c => [c.bit, c.value]) } : {}),
    })),
  }
}

// `cond` is [[bit, value], ...]. The pre-multi-bit files wrote a bare
// [bit, value] pair, which is still accepted so old links keep working.
function readCond(cond) {
  if (cond.length === 2 && typeof cond[0] === 'number') {
    return { bits: [{ bit: cond[0] | 0, value: cond[1] ? 1 : 0 }] }
  }
  const bits = cond
    .filter(Array.isArray)
    .map(([bit, value]) => ({ bit: bit | 0, value: value ? 1 : 0 }))
  return bits.length ? { bits } : null
}

function fromPortable(p) {
  const numQubits = Math.max(MIN_QUBITS, Math.min(MAX_QUBITS, p.n | 0))
  const inits = Array.from({ length: numQubits }, (_, i) => p.i?.[i] || INIT_ORDER[0])
  const gates = (p.g || [])
    .filter(g => GATE_DEFS[g.t] && Array.isArray(g.tg))
    .map(g => ({
      id: newId(),
      type: g.t,
      targets: g.tg,
      controls: g.c || [],
      ...(g.p ? { params: g.p } : {}),
      column: g.col | 0,
      ...(Array.isArray(g.cond) ? { condition: readCond(g.cond) } : {}),
    }))
    // A clause pointing off the end of the register is dropped, not honoured:
    // the file may have been saved on a wider circuit, and a gate that can never
    // fire is worse than an unconditional one.
    .map(g => (g.condition
      ? { ...g, condition: normalizeCondition(conditionClauses(g), numQubits) }
      : g))
  return { numQubits, inits, gates }
}

// Portable form is the `qcircuit.json@1` interchange contract used by the
// notebook: it embeds a circuit inline without ids so it stays self-contained.
export function circuitToPortable(circuit) {
  return toPortable(circuit)
}
export function portableToCircuit(portable) {
  return fromPortable(portable)
}

// ── JSON file import/export ───────────────────────────────────────────────────

export function circuitToJSON(circuit) {
  return JSON.stringify(toPortable(circuit), null, 2)
}

export function circuitFromJSON(text) {
  const parsed = JSON.parse(text)
  if (parsed == null || typeof parsed.n !== 'number') throw new Error('Not a valid circuit file.')
  return fromPortable(parsed)
}

export function downloadCircuit(circuit, name = 'circuit') {
  const blob = new Blob([circuitToJSON(circuit)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Share links (circuit encoded in URL) ─────────────────────────────────────

const b64url = {
  encode: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
}

export function encodeShare(circuit) {
  return b64url.encode(JSON.stringify(toPortable(circuit)))
}

export function decodeShare(code) {
  return fromPortable(JSON.parse(b64url.decode(code)))
}

export function shareURL(circuit) {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}?c=${encodeShare(circuit)}`
}

// Read a shared circuit from the current URL (?c=...), or null.
export function readSharedCircuit() {
  try {
    const code = new URLSearchParams(window.location.search).get('c')
    return code ? decodeShare(code) : null
  } catch { return null }
}

// ── localStorage projects ─────────────────────────────────────────────────────

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {} } catch { return {} }
}
function writeStore(obj) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)) } catch { /* quota / disabled */ }
}

export function listProjects() {
  return Object.keys(readStore()).sort()
}
export function saveProject(name, circuit) {
  const store = readStore()
  store[name] = toPortable(circuit)
  writeStore(store)
}
export function loadProject(name) {
  const store = readStore()
  return store[name] ? fromPortable(store[name]) : null
}
export function deleteProject(name) {
  const store = readStore()
  delete store[name]
  writeStore(store)
}

// ── Working draft ────────────────────────────────────────────────────────────
//
// The composer used to hold the only copy of an unsaved circuit in React state,
// so a refresh — or a crash, or a mis-click on a link — threw the work away
// along with the entire undo stack. This keeps the live circuit and a bounded
// slice of its history in localStorage, restored on the next visit.

const DRAFT_KEY = 'qcb.sandbox.draft'

// Deep enough to cover a slip, shallow enough that the write stays cheap.
const DRAFT_HISTORY = 20

export function saveDraft(circuit, past = [], future = []) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      c: toPortable(circuit),
      p: past.slice(-DRAFT_HISTORY).map(toPortable),
      f: future.slice(0, DRAFT_HISTORY).map(toPortable),
    }))
  } catch { /* quota / disabled */ }
}

export function readDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY))
    if (!raw || typeof raw.c?.n !== 'number') return null
    return {
      circuit: fromPortable(raw.c),
      past: (raw.p || []).map(fromPortable),
      future: (raw.f || []).map(fromPortable),
    }
  } catch { return null }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}
