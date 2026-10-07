// Circuit block: import a circuit built in the Composer (Sandbox) and render it
// read-only inside the note, with a deep link back to the Composer for editing.
//
// The interop contract is the portable `qcircuit.json@1` form (see
// lib/quantum/persistence). The block stores that JSON inline so the note is
// self-contained; it never reaches into the Composer's internals.

import { useState, useRef } from 'react'
import { Cpu, Download, Upload, ExternalLink, ChevronDown, Trash2 } from 'lucide-react'
import {
  listProjects,
  loadProject,
  circuitFromJSON,
  circuitToPortable,
  portableToCircuit,
} from '../../lib/quantum/persistence.js'
import NotebookCircuitView from './NotebookCircuitView.jsx'
import { CODEGEN } from '../../lib/quantum/codegen.js'
import { maxColumn } from '../../lib/quantum/circuitModel.js'

// Stored circuit JSON can be malformed (hand-edited note, a bad import, an older
// schema). Never let that throw during render — it would blank the whole note.
function safePortableToCircuit(data) {
  try {
    return data ? portableToCircuit(data) : null
  } catch {
    return null
  }
}

export default function CircuitBlock({ block, onChange, onCreateCode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const circuit = safePortableToCircuit(block.data)
  const unreadable = Boolean(block.data) && !circuit
  const projects = listProjects()

  function importModel(model, source, name) {
    if (!model || !model.gates) {
      setError('That circuit could not be read.')
      return
    }
    setError('')
    onChange({ data: circuitToPortable(model), source, name: name || block.name })
    setMenuOpen(false)
  }

  function importProject(name) {
    const model = loadProject(name)
    if (!model) {
      setError(`Project "${name}" could not be loaded.`)
      return
    }
    importModel(model, 'composer-import', name)
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const model = circuitFromJSON(String(reader.result))
        importModel(model, 'composer-import', file.name.replace(/\.json$/i, ''))
      } catch {
        setError('Invalid circuit file. Export it from the Composer first.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const gateCount = circuit ? circuit.gates.length : 0
  const depth = circuit ? maxColumn(circuit) + 1 : 0

  function createCodeBlock() {
    if (circuit) onCreateCode?.({ framework: 'qiskit', code: CODEGEN.qiskit(circuit) })
  }

  function exportJson() {
    if (!block.data) return
    const blob = new Blob([JSON.stringify(block.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(block.name || 'circuit').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'circuit'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="nb-circuit">
      <div className="nb-circuit-toolbar">
        <span className="nb-circuit-tag">
          <Cpu size={13} /> Circuit
        </span>

        {circuit && (
          <input
            className="nb-circuit-name"
            value={block.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Name this circuit…"
          />
        )}

        <div className="nb-code-toolbar-spacer" />

        <div className="nb-fw-wrap">
          <button className="nb-code-icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
            <Download size={13} /> Import <ChevronDown size={12} />
          </button>
          {menuOpen && (
            <div className="nb-fw-menu nb-import-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
              <button className="nb-fw-item" onClick={() => fileRef.current?.click()}>
                <Upload size={12} /> Upload JSON file…
              </button>
              {projects.length > 0 && <div className="nb-import-divider">Saved Composer projects</div>}
              {projects.map((name) => (
                <button key={name} className="nb-fw-item" onClick={() => importProject(name)}>
                  {name}
                </button>
              ))}
              {projects.length === 0 && <div className="nb-import-empty">No saved projects yet. Save one in the Composer.</div>}
            </div>
          )}
        </div>


        {circuit && (
          <button className="nb-code-icon-btn nb-circuit-to-code" onClick={createCodeBlock} title="Create a runnable Qiskit block from this circuit">
            <Cpu size={13} /> Create code
          </button>
        )}

        {/* Keyed off `data`, not `circuit`, so an unreadable circuit can still be cleared. */}
        {block.data && (
          <button className="nb-code-icon-btn" onClick={() => onChange({ data: null, name: '' })} title="Clear circuit" aria-label="Clear circuit">
            <Trash2 size={13} />
          </button>
        )}

        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleFile} />
      </div>

      {error && <p className="nb-circuit-error">{error}</p>}

      {unreadable && (
        <p className="nb-circuit-error">
          This circuit&apos;s saved data couldn&apos;t be read. Import it again, or clear the block to start over.
        </p>
      )}

      {circuit ? (
        <>
          <NotebookCircuitView circuit={circuit} />
          <div className="nb-circuit-stats">
            <span className="nb-circuit-stat"><strong>{circuit.numQubits}</strong> qubit{circuit.numQubits === 1 ? '' : 's'}</span>
            <span className="nb-circuit-stat"><strong>{gateCount}</strong> gate{gateCount === 1 ? '' : 's'}</span>
            <span className="nb-circuit-stat"><strong>{depth}</strong> depth</span>
            {block.source === 'composer-import' && <span className="nb-circuit-stat nb-circuit-stat-muted">imported</span>}
            <button className="nb-circuit-stat-action" onClick={exportJson} title="Export circuit JSON">
              <Download size={12} /> Export
            </button>
          </div>
        </>
      ) : (
        <button className="nb-circuit-empty" onClick={() => setMenuOpen(true)}>
          <Cpu size={26} />
          <span>Import a circuit from the Composer</span>
          <span className="nb-circuit-empty-sub">Upload an exported JSON file, or pick a saved Composer project.</span>
        </button>
      )}
    </div>
  )
}
