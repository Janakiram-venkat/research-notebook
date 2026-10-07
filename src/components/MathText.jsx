import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import { normalizeQuantumText } from '../lib/quantumText.js'
import { KATEX_MACROS, normalizeToLatex } from '../lib/mathNormalize.js'

function repairLatex(value) {
  const text = normalizeToLatex(value)
  return text ? text.trim() : ''
}

function readableFallback(value) {
  let text = normalizeQuantumText(value)

  text = text
    .replaceAll('\\alpha', 'α')
    .replaceAll('\\beta', 'β')
    .replaceAll('\\gamma', 'γ')
    .replaceAll('\\delta', 'δ')
    .replaceAll('\\theta', 'θ')
    .replaceAll('\\phi', 'φ')
    .replaceAll('\\psi', 'ψ')
    .replaceAll('\\Psi', 'Ψ')
    .replaceAll('\\Phi', 'Φ')
    .replaceAll('\\rangle', '⟩')
    .replaceAll('\\langle', '⟨')
    .replaceAll('\\cos', 'cos')
    .replaceAll('\\sin', 'sin')
    .replaceAll('\\tan', 'tan')
    .replaceAll('\\quad', '   ')
    .replaceAll('\\,', '')
    .replaceAll('^2', '²')
    .replaceAll('^3', '³')

  text = text.replace(/e\^\{i\\phi\}/g, 'eⁱφ')
  text = text.replace(/e\^\{iφ\}/g, 'eⁱφ')
  text = text.replace(/e\^i\\phi/g, 'eⁱφ')
  text = text.replace(/e\^iφ/g, 'eⁱφ')

  text = text.replaceAll('{', '').replaceAll('}', '')
  text = text.replace(/eⁱφ(?=sin|cos|tan)/g, 'eⁱφ ')
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

export default function MathText({
  value,
  block = false,
  className = '',
  style,
  fallbackClassName = '',
  raw = false,
}) {
  // `repairLatex` exists to rescue hand-written lesson strings (unicode kets,
  // `sqrt2`, ASCII arrows). LaTeX generated in code is already correct, and
  // running it through the repair pass rewrites its fractions and matrices —
  // so generated math opts out with `raw`.
  const latex = useMemo(
    () => (raw ? String(value ?? '').trim() : repairLatex(value)),
    [value, raw],
  )

  const html = useMemo(() => {
    if (!latex) return ''

        try {
          return katex.renderToString(latex, {
            displayMode: block,
        throwOnError: false,
        strict: false,
        trust: true,
        macros: KATEX_MACROS,
      })
    } catch {
      return ''
    }
      }, [latex, block])

  if (!latex) return null

  if (!html) {
    return (
      <span className={fallbackClassName} style={style}>
        {readableFallback(value)}
      </span>
    )
  }

  const mathClassName = [
    'math-text',
    block ? 'math-text-block' : 'math-text-inline',
    className,
  ].filter(Boolean).join(' ')

  if (block) {
    return (
      <div
        className={mathClassName}
        style={style}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <span
      className={mathClassName}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
