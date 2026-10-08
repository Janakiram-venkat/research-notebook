// Mermaid, loaded on first use and rendered with strict security (no scripts,
// no click handlers, HTML labels sanitised). Shared by the editor and print.

import DOMPurify from 'dompurify'

let mermaidPromise = null
let counter = 0

const PALETTES = {
  light: {
    primaryColor: '#EEF0FF', primaryBorderColor: '#2A3CF0', primaryTextColor: '#0B0F2A',
    lineColor: '#565D7E', secondaryColor: '#E7F7F0', tertiaryColor: '#FFF6E5',
    background: '#FFFFFF', mainBkg: '#EEF0FF', textColor: '#0B0F2A',
  },
  dark: {
    primaryColor: '#232A4D', primaryBorderColor: '#7C8CFF', primaryTextColor: '#E8EAF4',
    lineColor: '#8E95B0', secondaryColor: '#173A35', tertiaryColor: '#3A2E17',
    background: '#171A26', mainBkg: '#232A4D', textColor: '#E8EAF4',
    noteBkgColor: '#2A2F45', noteTextColor: '#E8EAF4', actorBkg: '#232A4D', actorTextColor: '#E8EAF4',
    labelBoxBkgColor: '#232A4D', signalColor: '#B9BED3', signalTextColor: '#E8EAF4',
  },
}

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then(({ default: mermaid }) => mermaid)
      .catch((err) => { mermaidPromise = null; throw err })
  }
  return mermaidPromise
}

let configuredFor = null
function configure(mermaid, theme) {
  if (configuredFor === theme) return
  configuredFor = theme
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // Plain SVG text labels, not HTML in <foreignObject>: they survive the
    // sanitiser below, print cleanly and scale with the drawing.
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: true },
    theme: 'base',
    darkMode: theme === 'dark',
    fontFamily: 'Sofia Sans, Segoe UI, system-ui, sans-serif',
    themeVariables: { ...PALETTES[theme], fontSize: '14px' },
  })
}

// Resolves to { svg } or { error } — never throws.
export async function renderDiagram(code, theme = 'light') {
  const source = (code || '').trim()
  if (!source) return { error: 'The diagram is empty.' }
  let mermaid
  try {
    mermaid = await loadMermaid()
  } catch {
    return { error: 'Could not load the diagram renderer. Check your connection and try again.' }
  }
  try {
    configure(mermaid, theme === 'dark' ? 'dark' : 'light')
    await mermaid.parse(source)
    counter += 1
    const { svg } = await mermaid.render(`nb-diagram-${counter}`, source)
    // Mermaid's strict mode already sanitises; this second pass keeps a diagram from
    // an imported note from ever carrying script, whatever Mermaid version is loaded.
    return { svg: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'] }) }
  } catch (err) {
    // Mermaid leaves a stray error element in <body> when render fails.
    document.querySelectorAll('[id^="dnb-diagram-"]').forEach((el) => el.remove())
    const message = String(err?.message || err).split('\n').slice(0, 3).join(' ').trim()
    return { error: message || 'This diagram has a syntax error.' }
  }
}

export const DIAGRAM_EXAMPLES = [
  { label: 'Flowchart', code: 'flowchart TD\n  Start --> Idea[Have an idea]\n  Idea --> Test{Does it work?}\n  Test -- yes --> Ship[Write it up]\n  Test -- no --> Idea' },
  { label: 'Sequence', code: 'sequenceDiagram\n  participant You\n  participant Notebook\n  You->>Notebook: Write a note\n  Notebook-->>You: Links and backlinks' },
  { label: 'Timeline', code: 'timeline\n  title Project timeline\n  Week 1 : Read papers\n  Week 2 : Run experiments\n  Week 3 : Write report' },
  { label: 'Gantt', code: 'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Research\n  Reading :a1, 2026-01-05, 7d\n  Experiments :after a1, 10d' },
  { label: 'Pie', code: 'pie title Time spent\n  "Reading" : 40\n  "Coding" : 35\n  "Writing" : 25' },
  { label: 'Quadrant', code: 'quadrantChart\n  title Effort vs impact\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  Idea A: [0.2, 0.8]\n  Idea B: [0.7, 0.6]' },
]
