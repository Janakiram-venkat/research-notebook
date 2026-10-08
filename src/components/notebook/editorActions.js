// Palette data for the notebook rich text editor.
//
// Symbols and formulas are inserted as KaTeX-rendered math nodes by the TipTap
// editor (TextBlock.jsx), so each entry only needs its display glyph and the
// LaTeX that backs it.

// ── symbol palette ────────────────────────────────────────────────────────────
export const SYMBOL_GROUPS = [
  {
    label: 'Logic & sets',
    items: [
      { display: '∀', tex: '\\forall' }, { display: '∃', tex: '\\exists' },
      { display: '∈', tex: '\\in' }, { display: '⊂', tex: '\\subset' },
      { display: '∪', tex: '\\cup' }, { display: '∩', tex: '\\cap' },
      { display: '¬', tex: '\\neg' }, { display: '⇒', tex: '\\Rightarrow' },
      { display: '⇔', tex: '\\iff' }, { display: 'ℝ', tex: '\\mathbb{R}' },
    ],
  },
  {
    label: 'Greek',
    items: [
      { display: 'α', tex: '\\alpha' }, { display: 'β', tex: '\\beta' },
      { display: 'γ', tex: '\\gamma' }, { display: 'δ', tex: '\\delta' },
      { display: 'θ', tex: '\\theta' }, { display: 'λ', tex: '\\lambda' },
      { display: 'π', tex: '\\pi' }, { display: 'σ', tex: '\\sigma' },
      { display: 'φ', tex: '\\phi' }, { display: 'ψ', tex: '\\psi' },
      { display: 'ω', tex: '\\omega' }, { display: 'Ω', tex: '\\Omega' },
      { display: 'Δ', tex: '\\Delta' }, { display: 'Φ', tex: '\\Phi' },
      { display: 'Ψ', tex: '\\Psi' }, { display: 'Σ', tex: '\\Sigma' },
    ],
  },
  {
    label: 'Operators',
    items: [
      { display: '√x', tex: '\\sqrt{x}' },
      { display: 'a/b', tex: '\\frac{a}{b}' },
      { display: '∑', tex: '\\sum_{i}^{N}' },
      { display: '∏', tex: '\\prod_{i}^{N}' },
      { display: '∫', tex: '\\int_{a}^{b}' },
      { display: 'xⁿ', tex: 'x^{n}' },
      { display: 'xₙ', tex: 'x_{n}' },
      { display: '±', tex: '\\pm' }, { display: '×', tex: '\\times' },
      { display: '·', tex: '\\cdot' }, { display: '→', tex: '\\to' },
      { display: '≈', tex: '\\approx' }, { display: '≤', tex: '\\leq' },
      { display: '≥', tex: '\\geq' }, { display: '≠', tex: '\\neq' },
      { display: '∞', tex: '\\infty' },
    ],
  },
]

// ── formula templates ─────────────────────────────────────────────────────────
// Ready-made display equations dropped in as block math nodes.
export const FORMULA_TEMPLATES = [
  { label: 'Quadratic formula', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: "Bayes' rule", tex: 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}' },
  { label: 'Mean & variance', tex: '\\mu = \\frac{1}{N}\\sum_{i=1}^{N} x_i,\\quad \\sigma^2 = \\frac{1}{N}\\sum_{i=1}^{N}(x_i - \\mu)^2' },
  { label: 'Gradient descent', tex: '\\theta_{t+1} = \\theta_t - \\eta\\,\\nabla_\\theta L(\\theta_t)' },
  { label: 'Normal distribution', tex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\,e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}' },
  { label: 'Expectation', tex: '\\mathbb{E}[X] = \\sum_x x\\,P(X = x)' },
  { label: "Euler's identity", tex: 'e^{i\\pi} + 1 = 0' },
]
