// Lab Report Mode — projecting a free-form note onto a fixed report frame.
//
// The `lab-report` template already seeded this structure, but seeding is only
// a suggestion: the headings drift, sections get renamed, and the order follows
// whatever order the work happened in. This projects any note onto the same
// frame at read time, so a report reads like a report regardless of how the
// note was written.
//
// The rule that matters most: NOTHING IS DROPPED. Anything that doesn't match a
// canonical section lands in the Appendix with its own heading intact. A view
// that silently discarded a paragraph would be far worse than one that puts it
// in the wrong place — the author would have no way to know.

// Canonical frame, in the order a report reads.
export const REPORT_SECTIONS = [
  { key: 'objective', label: 'Objective' },
  { key: 'method', label: 'Method' },
  { key: 'code', label: 'Code' },
  { key: 'result', label: 'Result' },
  { key: 'interpretation', label: 'Interpretation' },
  { key: 'conclusion', label: 'Conclusion' },
]

// Heading synonyms. People write "Abstract" or "Aim" for what a report calls an
// Objective, and "Discussion" or "Analysis" for Interpretation — matching only
// the canonical word would send most real notes straight to the Appendix.
const SYNONYMS = {
  objective: ['objective', 'objectives', 'abstract', 'aim', 'aims', 'goal', 'goals', 'purpose', 'question', 'hypothesis', 'background', 'introduction'],
  method: ['method', 'methods', 'methodology', 'procedure', 'approach', 'setup', 'set-up', 'experiment', 'what i did', 'steps'],
  code: ['code', 'code & data', 'code and data', 'implementation', 'program', 'script'],
  result: ['result', 'results', 'data', 'measurements', 'output', 'outputs', 'observations', 'findings'],
  interpretation: ['interpretation', 'analysis', 'discussion', 'what it means', 'why', 'explanation'],
  conclusion: ['conclusion', 'conclusions', 'summary', 'takeaway', 'takeaways', 'next steps', 'further work'],
}

const HEADING_TO_KEY = new Map()
for (const [key, words] of Object.entries(SYNONYMS)) {
  for (const w of words) HEADING_TO_KEY.set(w, key)
}

function normalizeHeading(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[*_`]/g, '') // strip inline markdown emphasis
    .replace(/[:,\s-]+$/, '') // trailing punctuation: "Method:" is still Method
    .trim()
}

/** Which canonical section a heading belongs to, or null for "no idea". */
export function classifyHeading(text) {
  const clean = normalizeHeading(text)
  if (!clean) return null
  return HEADING_TO_KEY.get(clean) || null
}

// Split one text block into `{ heading, key, body }` chunks at `##` boundaries.
// `###` and deeper stay inside their parent's body — they're sub-structure the
// author chose, and promoting them would fragment the section.
function splitByHeadings(markdown, { dropFirstH1 = false } = {}) {
  const lines = (markdown || '').split('\n')
  const chunks = []
  let current = { heading: null, key: null, lines: [] }
  let h1Dropped = !dropFirstH1

  for (const line of lines) {
    // The note's own `# Title` is rendered as the report's title, so showing it
    // again inside the body would duplicate it. Only the first one goes —
    // later `#` headings are content the author deliberately wrote.
    if (!h1Dropped && /^#\s+\S/.test(line)) {
      h1Dropped = true
      continue
    }
    const match = /^##(?!#)\s+(.+)$/.exec(line)
    if (match) {
      if (current.lines.join('').trim() || current.heading) chunks.push(current)
      const heading = match[1].trim()
      current = { heading, key: classifyHeading(heading), lines: [] }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.join('').trim() || current.heading) chunks.push(current)

  return chunks.map((c) => ({ heading: c.heading, key: c.key, body: c.lines.join('\n').trim() }))
}

/**
 * Project a note onto the report frame.
 *
 * Returns `{ title, sections, appendix, missing }` where each section is
 * `{ key, label, blocks }` and `blocks` reuses the note's own block shapes so
 * the same renderers work on both.
 *
 * Code blocks are always collected into the Code section, wherever they sat
 * in the note. That is the "fixed frame" doing its job: a reader wants the
 * program in one place. It does
 * cost the interleaving of a note that alternates prose and code, which is the
 * deliberate trade — report mode is a second view, never the editing surface.
 */
export function buildReport(note) {
  const bySection = new Map(REPORT_SECTIONS.map((s) => [s.key, []]))
  const appendix = []

  let firstTextSeen = false

  for (const block of note?.content || []) {
    if (block.type === 'code') {
      bySection.get('code').push(block)
      continue
    }
    if (block.type !== 'text') continue

    const chunks = splitByHeadings(block.markdown, { dropFirstH1: !firstTextSeen })
    firstTextSeen = true

    for (const chunk of chunks) {
      if (!chunk.body && !chunk.heading) continue

      // Prose before any `##` — the paragraph most notes open with. It reads as
      // the objective, so that's where it goes rather than into the Appendix,
      // where an explanatory opening would look like a leftover.
      if (!chunk.heading) {
        if (chunk.body) bySection.get('objective').push({ type: 'text', markdown: chunk.body })
        continue
      }

      if (chunk.key) {
        if (chunk.body) bySection.get(chunk.key).push({ type: 'text', markdown: chunk.body })
        continue
      }

      // Unrecognised heading. Keep it, heading and all — see the note at the
      // top of this file about never dropping anything.
      appendix.push({ type: 'text', markdown: `### ${chunk.heading}\n\n${chunk.body}`.trim() })
    }
  }

  const sections = REPORT_SECTIONS.map((s) => ({ ...s, blocks: bySection.get(s.key) }))

  return {
    title: note?.title || 'Untitled note',
    sections: sections.filter((s) => s.blocks.length > 0),
    appendix,
    missing: sections.filter((s) => s.blocks.length === 0).map((s) => s.key),
  }
}

// Sections whose absence is worth mentioning. Code is legitimately
// missing from plenty of good write-ups — a theory note has none — so
// nagging about them would train people to ignore the hint entirely.
const NUDGE_ORDER = ['objective', 'method', 'result', 'interpretation', 'conclusion']

const NUDGES = {
  objective: 'No objective yet, what question was this run meant to answer?',
  method: 'No method yet, what procedure produced this?',
  result: 'No result yet, what did it actually produce?',
  interpretation:
    'No interpretation yet, this is the section that turns a result into an explanation, and the one most often skipped.',
  conclusion: 'No conclusion yet, did the result match what you expected?',
}

/**
 * Hints for the sections a report is missing, most important first.
 *
 * Advisory only. Nothing here blocks export or sharing: a lab notebook is a
 * working document, and a tool that refused to export an unfinished one would
 * just get worked around.
 */
export function reportHints(report) {
  return NUDGE_ORDER.filter((key) => report.missing.includes(key)).map((key) => ({
    key,
    label: REPORT_SECTIONS.find((s) => s.key === key).label,
    message: NUDGES[key],
  }))
}

/** The report as Markdown, for the existing `.md` export and clipboard copy. */
export function reportToMarkdown(report) {
  const lines = [`# ${report.title}`]

  const renderBlocks = (blocks) => {
    for (const block of blocks) {
      lines.push('')
      if (block.type === 'text') lines.push(block.markdown || '')
      else if (block.type === 'code') {
        lines.push(`\`\`\`${block.framework || 'python'}`)
        lines.push(block.code || '')
        lines.push('```')
        if (block.lastResult?.output) {
          lines.push('', 'Output:', '```', block.lastResult.output, '```')
        }
      }
    }
  }

  for (const section of report.sections) {
    lines.push('', `## ${section.label}`)
    renderBlocks(section.blocks)
  }

  if (report.appendix.length > 0) {
    lines.push('', '## Appendix')
    renderBlocks(report.appendix)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
