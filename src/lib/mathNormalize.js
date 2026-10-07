import { normalizeQuantumText } from './quantumText.js'

export const KATEX_MACROS = {
  '\\ket': '\\left|#1\\right\\rangle',
  '\\bra': '\\left\\langle#1\\right|',
}

const LATEX_REPLACEMENTS = [
  ['→', '\\to'],
  ['â†’', '\\to'],
  ['√', '\\sqrt'],
  ['âˆš', '\\sqrt'],
  ['⊗', '\\otimes'],
  ['âŠ, ', '\\otimes'],
  ['⊕', '\\oplus'],
  ['⊖', '\\ominus'],
  ['≈', '\\approx'],
  ['≅', '\\cong'],
  ['≡', '\\equiv'],
  ['∈', '\\in'],
  ['∉', '\\notin'],
  ['∝', '\\propto'],
  ['∞', '\\infty'],
  ['∓', '\\mp'],
  ['³', '^3'],
  ['â‚‚', '_2'],
  ['â‚ƒ', '_3'],
  ['₂', '_2'],
  ['₃', '_3'],
  ['∏', '\\prod'],
  ['∑', '\\sum'],
  ['⟨', '\\langle'],
  ['âŸ¨', '\\langle'],
  ['⟩', '\\rangle'],
  ['âŸ©', '\\rangle'],
  ['â‚€', '_0'],
  ['â‚', '_1'],
  ['₀', '_0'],
  ['₁', '_1'],
  ['²', '^2'],
  ['Â²', '^2'],
  ['α', '\\alpha'],
  ['Î±', '\\alpha'],
  ['β', '\\beta'],
  ['Î²', '\\beta'],
  ['γ', '\\gamma'],
  ['Î³', '\\gamma'],
  ['δ', '\\delta'],
  ['Î´', '\\delta'],
  ['ψ', '\\psi'],
  ['Ïˆ', '\\psi'],
  ['Φ', '\\Phi'],
  ['Î¦', '\\Phi'],
  ['Ψ', '\\Psi'],
  ['Î¨', '\\Psi'],
  ['π', '\\pi'],
  ['Σ', '\\sum'],
  ['±', '\\pm'],
  ['≠', '\\neq'],
  ['†', '\\dagger'],
  ['−', '-'],
  ['âˆ’', '-'],
  ['×', '\\times'],
  ['Ã, ', '\\times'],
  ['·', '\\cdot'],
  ['Â·', '\\cdot'],
  ['θ', '\\theta'],
  ['φ', '\\phi'],
  ['∂', '\\partial'],
  ['∇', '\\nabla'],
  ['≤', '\\le'],
  ['≥', '\\ge'],
  ['⌊', '\\lfloor '],
  ['⌋', '\\rfloor '],
  ['⌈', '\\lceil '],
  ['⌉', '\\rceil '],
]

function convertMatrices(text) {
  return text.replace(/\[\s*\[(.*?)\]\s*\]/g, (_, inner) => {
    const rows = inner.split(/\s*\]\s*,\s*\[\s*/)
    const latexRows = rows.map(row => row.split(/\s*,\s*/).join(' & '))
    return `\\begin{bmatrix} ${latexRows.join(' \\\\ ')} \\end{bmatrix}`
  })
}

// The denominator may carry an exponent — `π/2^{k-1}`, `N/2^n`, `1/2^{n/2}` are
// all ordinary in this material. Without the exponent in the pattern the
// converter stopped at the base and left the power stranded outside the
// fraction, so `π/2^{k-1}` rendered as `(π/2)^{k-1}`: a different number.
const EXPONENT = String.raw`(?:\^\{[^{}]+\}|\^[A-Za-z0-9])?`

function convertSimpleFractions(text) {
  return text.replace(
    new RegExp(String.raw`(\\[a-zA-Z]+|[A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+${EXPONENT})`, 'g'),
    (_, top, bottom) => `\\frac{${top}}{${bottom}}`,
  )
}

function convertRadicalFractions(text) {
  return text
    .replace(
      /\(([^()]*)\)\s*\/\s*\\sqrt\{([^{}]+)\}/g,
      (_, numerator, radicand) => `\\frac{${numerator.trim()}}{\\sqrt{${radicand}}}`,
    )
    .replace(
      /(\\ket\{[^{}]+\}|\\[a-zA-Z]+|[A-Za-z0-9]+)\s*\/\s*\\sqrt\{([^{}]+)\}/g,
      (_, numerator, radicand) => `\\frac{${numerator}}{\\sqrt{${radicand}}}`,
    )
}

export function normalizeToLatex(value) {
  let text = normalizeQuantumText(value)
  if (!text) return ''

  text = text
    .replaceAll('&#123;', '{')
    .replaceAll('&#125;', '}')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')

  LATEX_REPLACEMENTS.forEach(([from, to]) => {
    const replacement = /^\\[a-zA-Z]+$/.test(to) && to !== '\\sqrt'
      ? `${to} `
      : to

    text = text.split(from).join(replacement)
  })

  text = convertMatrices(text)

  text = text.replace(/\|([^|]+?)\s*\\rangle/g, '\\ket{$1}')
  text = text.replace(/\\langle\s*([^|]+?)\|/g, '\\bra{$1}')

  text = text.replace(/(^|[^\\A-Za-z])cos\s*\(/g, '$1\\cos(')
  text = text.replace(/(^|[^\\A-Za-z])sin\s*\(/g, '$1\\sin(')
  text = text.replace(/(^|[^\\A-Za-z])tan\s*\(/g, '$1\\tan(')

  text = text.replace(/\\sqrt\s*([A-Za-z0-9.]+)/g, '\\sqrt{$1}')
  text = convertRadicalFractions(text)
  text = convertSimpleFractions(text)

  text = text.replace(/\\Phi\s*([+-])/g, '\\Phi^{$1}')
  text = text.replace(/\\Psi\s*([+-])/g, '\\Psi^{$1}')
  text = text.replace(/\\to\s+([A-Za-z][A-Za-z\s-]*)$/g, (_, label) => `\\to \\text{${label.trim()}}`)

  return text.trim()
}
