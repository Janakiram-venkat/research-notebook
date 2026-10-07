const TEXT_REPLACEMENTS = [
  ['ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢', "'"],
  ['ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ', '"'],
  ['ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â', '"'],
  ['ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â', '—'],
  ['ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢', '→'],
  ['ÃƒÂ¢Ã‹â€ Ã…Â¡', '√'],
  ['ÃƒÂ¢Ã…Â Ã¢â‚¬â€', '×'],
  ['ÃƒÂ¢Ã…Â¸Ã‚Â¨', '⟨'],
  ['ÃƒÂ¢Ã…Â¸Ã‚Â©', '⟩'],
  ['Ãƒâ€šÃ‚Â²', '²'],
  ['ÃƒÅ½Ã‚Â±', 'α'],
  ['ÃƒÅ½Ã‚Â²', 'β'],
  ['ÃƒÅ½Ã‚Â³', 'γ'],
  ['ÃƒÅ½Ã‚Â´', 'δ'],
  ['ÃƒÂÃ‹â€ ', 'ψ'],
  ['ÃƒÅ½Ã‚Â¦', 'Φ'],
  ['ÃƒÅ½Ã‚Â¨', 'Ψ'],
  ['â€™', '’'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â†’', '→'],
  ['âˆš', '√'],
  ['âŠ—', '⊗'],
  ['âŸ¨', '⟨'],
  ['âŸ©', '⟩'],
  ['â‚€', '₀'],
  ['â‚', '₁'],
  ['Â²', '²'],
  ['Î±', 'α'],
  ['Î²', 'β'],
  ['Î³', 'γ'],
  ['Î´', 'δ'],
  ['Ïˆ', 'ψ'],
  ['Î¦', 'Φ'],
  ['Î¨', 'Ψ'],
  ['âˆ’', '−'],
  ['Ã—', '×'],
  ['Â·', '·'],
  ['Â', ''],
]

const QUANTUM_SYMBOL_PATTERN = /(?:\|\s*[^|>⟩]+\s*[>⟩]|[=αβγδψΦΨθφ√⟨⟩₀₁⊗→]|\[\[|O\()/u
const FORMULA_START_PATTERN = /(?:\(\s*\|)|(?:\|\s*[^|>⟩]+\s*[>⟩])|[αβγδψΦΨθφ√⟨]|\[\[|O\(/u
const PROSE_WORD_PATTERN = /\b[A-Za-z]{2,}(?:-[A-Za-z0-9]+)?\b/g
const INLINE_FORMULA_PREFIX_PATTERN =
  /\b(?:is|are|in|as|equals|becomes|gives|yields|written as|represented by|described by|starts in|start with)\s*$/i

export function normalizeQuantumText(value) {
  let text = String(value ?? '')

  TEXT_REPLACEMENTS.forEach(([from, to]) => {
    text = text.split(from).join(to)
  })

  text = text
    .replace(/\|([^|\n<>]{1,24})>/g, '|$1⟩')
    .replace(/<([^|\n<>]{1,24})\|/g, '⟨$1|')

  return text.trim()
}

export function containsQuantumNotation(value) {
  const text = normalizeQuantumText(value)
  return QUANTUM_SYMBOL_PATTERN.test(text)
}

export function countProseWords(value) {
  const text = normalizeQuantumText(value)
  return text.match(PROSE_WORD_PATTERN)?.length ?? 0
}

export function isQuantumFormulaLike(value) {
  const text = normalizeQuantumText(value)
  if (!text || !containsQuantumNotation(text)) return false
  if (/[.!?]$/.test(text)) return false

  const formulaStartIndex = text.search(FORMULA_START_PATTERN)
  if (formulaStartIndex > 0) {
    const leadingText = text.slice(0, formulaStartIndex).trim()
    if (countProseWords(leadingText) >= 2) return false
  }

  return countProseWords(text) <= 4
}

export function splitLeadingTextFromFormula(value) {
  const text = normalizeQuantumText(value)
  if (!text || !containsQuantumNotation(text)) return null

  const formulaStartIndex = text.search(FORMULA_START_PATTERN)
  if (formulaStartIndex <= 0) return null

  const prefix = text.slice(0, formulaStartIndex).trimEnd()
  const formula = text.slice(formulaStartIndex).trim()

  if (!INLINE_FORMULA_PREFIX_PATTERN.test(prefix)) return null
  if (!isQuantumFormulaLike(formula)) return null

  return { prefix, formula }
}

// ── Inline math segmentation ────────────────────────────────────────────────
// Prose strings routinely embed quantum notation mid-sentence ("the state |0⟩",
// "parameters θ", "|α|² + |β|² = 1", "e^{-iHt}"). Those fragments must be typeset
// with KaTeX, not shown as raw Unicode/escaped braces. segmentInlineMath splits a
// normalized prose string into alternating text / math segments so the renderer can
// wrap each math run in <MathText/> while escaping the surrounding prose.

// A token is unambiguously math if it carries one of these signals: a Greek letter,
// a quantum operator, a unicode sub/superscript, a caret/underscore script
// (e^{...}, U_f, a^(r/2)), a backslash LaTeX command, or a ket/bra.
const STRONG_MATH_SIGNAL =
  /[αβγδεζηθϑικλμνξοπρςστυφϕχψωΓΔΘΛΞΠΣΦΨΩ]|[⟨⟩⊗⊕⊖†√≤≥≠±∓∂∇·×∑∏≈≅≡∈∉∝∞]|[²³⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]|[\^_][A-Za-z0-9({]|\\[a-zA-Z]+|\|[^|\s]*⟩|⟨[^|\s]*\|/u

// "Glue" tokens (numbers, operators, grouping) may sit inside a math run but cannot
// start one on their own — they bind adjacent strong-math tokens together.
const GLUE_TOKEN = /^[-+=/*()0-9.]+$/
// Operator-only glue is trimmed from run edges so we never emit a dangling "=" or "+".
const OPERATOR_ONLY = /^[-+=/*()·×]+$/u
// Sentence punctuation stripped from a token's outer edges before classification.
const EDGE_PUNCT = /[.,;:!?"'“”)]+$|^[("'“”]+/g

function hasStrongMath(token) {
  return STRONG_MATH_SIGNAL.test(token)
}

export function segmentInlineMath(value) {
  const text = normalizeQuantumText(value)
  if (!text || !STRONG_MATH_SIGNAL.test(text)) {
    return text ? [{ type: 'text', value: text }] : []
  }

  // Split into words + the whitespace between them so spacing can be rebuilt.
  // Each word becomes {lead, core, trail}: sentence punctuation/quotes peeled off
  // the edges stay prose, while `core` is what gets classified and typeset.
  const parts = text.split(/(\s+)/)
  const tokens = parts.map(part => {
    if (part === '' || /^\s+$/.test(part)) return { kind: 'space', value: part }

    let core = part
    let lead = ''
    let trail = ''
    const leadMatch = core.match(/^["'“”]+/)
    if (leadMatch) {
      lead = leadMatch[0]
      core = core.slice(lead.length)
    }
    const trailMatch = core.match(/[.,;:!?"'“”]+$/)
    const trailStart = trailMatch ? core.length - trailMatch[0].length : -1
    if (trailMatch && (trailStart === 0 || core[trailStart - 1] !== '\\')) {
      trail = trailMatch[0]
      core = core.slice(0, core.length - trail.length)
    }

    let kind = 'text'
    if (hasStrongMath(core)) kind = 'strong'
    else if (core && GLUE_TOKEN.test(core)) kind = 'glue'
    // A token carrying trailing punctuation (e.g. "U_f:") ends a math run.
    return { kind, lead, core, trail, terminates: Boolean(trail) }
  })

  const segments = []
  let buffer = ''
  const pushText = str => { buffer += str }
  const flushText = () => {
    if (buffer) segments.push({ type: 'text', value: buffer })
    buffer = ''
  }

  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok.kind === 'space') { pushText(tok.value); i += 1; continue }
    if (tok.kind === 'text') {
      pushText(tok.lead + tok.core + tok.trail)
      i += 1
      continue
    }

    // Walk a run of strong/glue word-tokens (and the spaces between them).
    const runIdx = []
    let sawStrong = false
    let braceDepth = 0
    let j = i
    while (j < tokens.length) {
      const t = tokens[j]
      if (t.kind === 'space') { runIdx.push(j); j += 1; continue }
      if (t.kind === 'strong' || t.kind === 'glue' || braceDepth > 0) {
        runIdx.push(j)
        if (t.kind === 'strong') sawStrong = true
        for (const char of t.core) {
          if (char === '{') braceDepth += 1
          else if (char === '}') braceDepth = Math.max(0, braceDepth - 1)
        }
        j += 1
        if (t.terminates && braceDepth === 0) break // punctuation closed the run
        continue
      }
      break
    }

    if (!sawStrong) { pushText(tok.lead + tok.core + tok.trail); i += 1; continue }

    // Trim leading non-strong and trailing space / operator-only glue.
    let start = 0
    let end = runIdx.length - 1
    while (start <= end && tokens[runIdx[start]].kind !== 'strong') start += 1
    while (end >= start) {
      const t = tokens[runIdx[end]]
      if (t.kind === 'space' || (t.kind === 'glue' && OPERATOR_ONLY.test(t.core))) { end -= 1; continue }
      break
    }

    // Leading trimmed tokens → prose (with their lead/trail preserved).
    for (let k = 0; k < start; k++) {
      const t = tokens[runIdx[k]]
      pushText(t.kind === 'space' ? t.value : t.lead + t.core + t.trail)
    }
    flushText()

    let mathStr = ''
    let mathTrail = ''
    for (let k = start; k <= end; k++) {
      const t = tokens[runIdx[k]]
      mathStr += t.kind === 'space' ? t.value : t.lead + t.core
      if (t.kind !== 'space' && t.trail) mathTrail += t.trail // only the last token carries trail
    }
    if (mathStr.trim()) segments.push({ type: 'math', value: mathStr.trim() })
    if (mathTrail) pushText(mathTrail) // trailing punctuation → prose after the math

    // Trailing trimmed tokens → prose.
    for (let k = end + 1; k < runIdx.length; k++) {
      const t = tokens[runIdx[k]]
      pushText(t.kind === 'space' ? t.value : t.lead + t.core + t.trail)
    }

    i = j
  }
  flushText()

  return segments.filter(seg => seg.value !== '')
}

export function escapeMdxText(value) {
  return normalizeQuantumText(value)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
}

export function quoteMdxProp(value) {
  return JSON.stringify(normalizeQuantumText(value))
}
