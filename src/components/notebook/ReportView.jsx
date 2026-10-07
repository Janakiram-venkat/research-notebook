// Read-only rendering of a note projected onto the report frame.
//
// Used in two places, which is why it takes a report rather than a note: the
// note page renders one built live, and the public /notebook/shared/:slug page
// renders one stored at publish time. The stored copy is deliberately
// pre-projected, so a later change to the projection rules can never rearrange
// something someone already shared.

import { FlaskConical, TriangleAlert } from 'lucide-react'
import MarkdownView from './MarkdownView.jsx'
import NotebookCircuitView from './NotebookCircuitView.jsx'
import { portableToCircuit } from '../../lib/quantum/persistence.js'
import { reportHints } from '../../lib/notebook/report.js'

function safeCircuit(data) {
  try {
    return data ? portableToCircuit(data) : null
  } catch {
    // A circuit saved by an older format version shouldn't take the report down
    // with it — the rest of the write-up is still worth reading.
    return null
  }
}

function ReportBlock({ block }) {
  if (block.type === 'text') return <MarkdownView markdown={block.markdown || ''} />

  if (block.type === 'code') {
    return (
      <div className="nb-report-code-wrap">
        <pre className="nb-report-code">{block.code || '# Empty code block'}</pre>
        {block.lastResult?.output && (
          <>
            <p className="nb-report-sublabel">Output</p>
            <pre className="nb-report-output">{block.lastResult.output}</pre>
          </>
        )}
        {/* The plots ARE the result in most lab reports, so they travel with it. */}
        {block.lastResult?.images?.length > 0 && (
          <div className="nb-report-figures">
            {block.lastResult.images.map((b64, i) => (
              <img
                key={i}
                src={`data:image/png;base64,${b64}`}
                alt={`Figure ${i + 1}`}
                className="nb-report-figure"
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'circuit') {
    const circuit = safeCircuit(block.data)
    return (
      <div className="nb-report-circuit">
        {circuit ? <NotebookCircuitView circuit={circuit} /> : <p className="nb-report-sublabel">No circuit imported.</p>}
        {block.name && <p className="nb-report-sublabel">{block.name}</p>}
      </div>
    )
  }

  return null
}

/**
 * @param report   from buildReport(), or a stored share payload
 * @param showHints whether to nudge about missing sections (never on a shared
 *                  page — the reader can't act on it, and it would read as a
 *                  criticism of the author to their own audience)
 */
export default function ReportView({ report, showHints = false }) {
  const hints = showHints ? reportHints(report) : []
  const isEmpty = report.sections.length === 0 && report.appendix.length === 0

  return (
    <article className="nb-report">
      <header className="nb-report-header">
        <p className="nb-report-eyebrow">
          <FlaskConical size={13} aria-hidden="true" /> Lab report
        </p>
        <h1 className="nb-report-title">{report.title}</h1>
      </header>

      {hints.length > 0 && (
        <aside className="nb-report-hints" role="note">
          <p className="nb-report-hints-title">
            <TriangleAlert size={14} aria-hidden="true" /> Still to fill in
          </p>
          <ul>
            {hints.map((h) => (
              <li key={h.key}>{h.message}</li>
            ))}
          </ul>
        </aside>
      )}

      {isEmpty && (
        <p className="nb-report-empty">
          This note is empty. Write something under headings like “Objective”, “Method” or
          “Result” and they’ll be laid out here.
        </p>
      )}

      {report.sections.map((section) => (
        <section key={section.key} className="nb-report-section">
          <h2 className="nb-report-section-title">{section.label}</h2>
          {section.blocks.map((block, i) => (
            <div key={i} className="nb-report-block">
              <ReportBlock block={block} />
            </div>
          ))}
        </section>
      ))}

      {/* Anything whose heading didn't match the frame. It keeps its own
          heading and is never dropped — see the note atop lib/notebook/report.js. */}
      {report.appendix.length > 0 && (
        <section className="nb-report-section nb-report-appendix">
          <h2 className="nb-report-section-title">Appendix</h2>
          {report.appendix.map((block, i) => (
            <div key={i} className="nb-report-block">
              <ReportBlock block={block} />
            </div>
          ))}
        </section>
      )}
    </article>
  )
}
