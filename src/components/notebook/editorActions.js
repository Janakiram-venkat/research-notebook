// Palette data for the notebook rich text editor.
//
// Symbols and formulas are inserted as KaTeX-rendered math nodes by the TipTap
// editor (TextBlock.jsx), so each entry only needs its display glyph and the
// LaTeX that backs it.

// ── symbol palette ────────────────────────────────────────────────────────────
export const SYMBOL_GROUPS = [
  {
    label: 'Quantum',
    items: [
      { display: '|0⟩', tex: '\\ket{0}' },
      { display: '|1⟩', tex: '\\ket{1}' },
      { display: '|ψ⟩', tex: '\\ket{\\psi}' },
      { display: '⟨ψ|', tex: '\\bra{\\psi}' },
      { display: '|φ⟩', tex: '\\ket{\\phi}' },
      { display: '⟨φ|ψ⟩', tex: '\\langle\\phi|\\psi\\rangle' },
      { display: '⊗', tex: '\\otimes' },
      { display: 'A†', tex: 'A^{\\dagger}' },
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
  { label: 'Superposition', tex: '|\\psi\\rangle = \\frac{1}{\\sqrt{2}}\\big(|0\\rangle + |1\\rangle\\big)' },
  { label: 'General qubit', tex: '|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle,\\quad |\\alpha|^2 + |\\beta|^2 = 1' },
  { label: 'Bell state Φ⁺', tex: '|\\Phi^+\\rangle = \\frac{1}{\\sqrt{2}}\\big(|00\\rangle + |11\\rangle\\big)' },
  { label: 'Hadamard', tex: 'H = \\frac{1}{\\sqrt{2}}\\begin{bmatrix} 1 & 1 \\\\ 1 & -1 \\end{bmatrix}' },
  { label: 'Bloch state', tex: '|\\psi\\rangle = \\cos\\tfrac{\\theta}{2}|0\\rangle + e^{i\\varphi}\\sin\\tfrac{\\theta}{2}|1\\rangle' },
  { label: 'Expectation', tex: '\\langle A \\rangle = \\langle\\psi| A |\\psi\\rangle' },
  { label: 'Born rule', tex: 'P(x) = |\\langle x|\\psi\\rangle|^2' },
]
