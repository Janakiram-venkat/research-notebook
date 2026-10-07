import { Children, Fragment } from 'react'

import { segmentInlineMath } from '../lib/quantumText.js'
import MathText from './MathText.jsx'

function renderString(value, keyPrefix) {
  const leadingSpace = value.match(/^\s+/)?.[0] || ''
  const trailingSpace = value.match(/\s+$/)?.[0] || ''
  const normalizedValue = value.trim()

  if (!normalizedValue) return value

  const rendered = segmentInlineMath(normalizedValue).map((segment, index) => (
    segment.type === 'math'
      ? <MathText key={`${keyPrefix}-math-${index}`} value={segment.value} />
      : <Fragment key={`${keyPrefix}-text-${index}`}>{segment.value}</Fragment>
  ))

  return [
    leadingSpace && <Fragment key={`${keyPrefix}-leading`}>{leadingSpace}</Fragment>,
    ...rendered,
    trailingSpace && <Fragment key={`${keyPrefix}-trailing`}>{trailingSpace}</Fragment>,
  ].filter(Boolean)
}

export function MathContent({ children, value }) {
  const content = value ?? children

  return Children.map(content, (child, index) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return renderString(String(child), `segment-${index}`)
    }

    return child
  })
}

export default function RichMathText({
  as: Component = 'span',
  children,
  value,
  ...props
}) {
  return (
    <Component {...props}>
      <MathContent value={value}>{children}</MathContent>
    </Component>
  )
}
