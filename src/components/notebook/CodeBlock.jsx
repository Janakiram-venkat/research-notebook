// Code block: edit Python and run it in the browser (Pyodide, see
// lib/executeCode.js). Output (stdout/stderr) renders inline and is persisted
// with the note so results survive a reload.

import { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import {
  Play, Loader2, Copy, Check, ChevronDown, ChevronRight,
  CircleCheck, CircleX,
} from 'lucide-react'
import { toastSuccess, toastError } from './ui/toast.js'
import { useMonacoTheme } from '../../lib/editorTheme.js'
import { executeCode } from '../../lib/executeCode.js'

// Rough editor height: grow with the code, clamped so a long script scrolls
// internally instead of pushing the whole note down.
function editorHeight(code) {
  const lines = (code || '').split('\n').length
  return Math.min(520, Math.max(140, lines * 20 + 24))
}

const FRAMEWORKS = [
  { id: 'qiskit', label: 'Qiskit' },
  { id: 'cirq', label: 'Cirq' },
  { id: 'pennylane', label: 'PennyLane' },
  { id: 'python', label: 'Python' },
]

export default function CodeBlock({ block, onChange }) {
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [fwOpen, setFwOpen] = useState(false)
  const [outputCollapsed, setOutputCollapsed] = useState(false)
  const runRef = useRef(null)
  const result = block.lastResult

  const run = useCallback(async () => {
    if (running) return
    setRunning(true)
    const result = await executeCode(block.code) // never throws
    onChange({
      lastResult: {
        status: result.ok ? 'ok' : 'error',
        output: result.stdout,
        error: result.stderr,
        images: result.images,
        durationMs: result.durationMs,
        runAt: Date.now(),
      },
    })
    setRunning(false)
  }, [block.code, running, onChange])

  // Keep a stable ref so the Monaco Ctrl+Enter command always runs the latest.
  useEffect(() => {
    runRef.current = run
  }, [run])

  const { beforeMount: monacoBeforeMount, theme: monacoTheme } = useMonacoTheme()

  function handleEditorMount(editor, monaco) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.())
  }

  function copy() {
    navigator.clipboard.writeText(block.code).then(
      () => {
        setCopied(true)
        toastSuccess('Code copied to clipboard')
        setTimeout(() => setCopied(false), 1600)
      },
      () => toastError("Couldn't copy, clipboard blocked"),
    )
  }

  const fwLabel = FRAMEWORKS.find((f) => f.id === block.framework)?.label || 'Qiskit'

  return (
    <div className="nb-code">
      <div className="nb-code-toolbar">
        <div className="nb-fw-wrap">
          <button className="nb-fw-btn" onClick={() => setFwOpen((o) => !o)} aria-haspopup="menu" aria-expanded={fwOpen}>
            {fwLabel} <ChevronDown size={13} />
          </button>
          {fwOpen && (
            <div className="nb-fw-menu" role="menu" onMouseLeave={() => setFwOpen(false)}>
              {FRAMEWORKS.map((f) => (
                <button
                  key={f.id}
                  className={`nb-fw-item${f.id === block.framework ? ' is-active' : ''}`}
                  onClick={() => {
                    onChange({ framework: f.id })
                    setFwOpen(false)
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="nb-run-btn" onClick={run} disabled={running} aria-busy={running}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Running…' : 'Run'}
        </button>

        <div className="nb-code-toolbar-spacer" />

        <button className="nb-code-icon-btn" onClick={copy} title="Copy code" aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      <div className="nb-code-editor-monaco" style={{ height: editorHeight(block.code) }}>
        <Editor
          height="100%"
          defaultLanguage="python"
          language="python"
          value={block.code}
          onChange={(val) => onChange({ code: val || '' })}
          onMount={handleEditorMount}
          beforeMount={monacoBeforeMount}
          theme={monacoTheme}
          loading={<div className="nb-block-loading">Loading editor…</div>}
          options={{
            fontSize: 13.5,
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            lineNumbersMinChars: 3,
            renderLineHighlight: 'line',
            tabSize: 4,
            wordWrap: 'on',
            automaticLayout: true,
            scrollbar: { alwaysConsumeMouseWheel: false },
          }}
        />
      </div>

      {result && (
        <div className={`nb-code-output${result.status === 'error' ? ' is-error' : ''}`}>
          <button className="nb-code-output-head" onClick={() => setOutputCollapsed((c) => !c)} aria-expanded={!outputCollapsed}>
            {outputCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            <span className={`nb-code-status nb-code-status-${result.status === 'error' ? 'error' : 'ok'}`}>
              {result.status === 'error' ? <CircleX size={12} /> : <CircleCheck size={12} />}
              {result.status === 'error' ? 'Error' : 'Success'}
            </span>
            <span className="nb-code-output-label">Output</span>
            <span className="nb-code-output-spacer" />
            {result.durationMs != null && <span className="nb-code-runtime">{(result.durationMs / 1000).toFixed(2)}s</span>}
          </button>
          {!outputCollapsed && (
            <>
              {result.output && <pre className="nb-code-stdout">{result.output}</pre>}
              {result.images?.length > 0 && (
                <div className="nb-code-images">
                  {result.images.map((b64, i) => (
                    <img key={i} src={`data:image/png;base64,${b64}`} alt={`Plot ${i + 1}`} className="nb-code-plot" />
                  ))}
                </div>
              )}
              {result.error && <pre className="nb-code-stderr">{result.error}</pre>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
