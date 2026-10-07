/**
 * Lab Report Mode — projecting a note onto the report frame.
 *
 * One rule outranks everything else here: NOTHING IS DROPPED. A view that
 * silently discarded a paragraph would be far worse than one that files it
 * under the wrong heading, because the author has no way to notice. Several
 * tests below exist only to check that the total survives the projection.
 *
 * The second concern is that the heading matching is generous enough to be
 * useful. People write "Abstract" for an objective and "Discussion" for an
 * interpretation; matching only the canonical word would send most real notes
 * straight to the Appendix and make the whole feature look broken.
 *
 * Node environment: pure string and array work.
 */

import { describe, expect, it } from 'vitest'
import {
  REPORT_SECTIONS,
  classifyHeading,
  buildReport,
  reportHints,
  reportToMarkdown,
} from './report.js'

const textNote = (markdown, extra = []) => ({
  title: 'A run',
  content: [{ id: 'b1', type: 'text', markdown }, ...extra],
})

const section = (report, key) => report.sections.find((s) => s.key === key)
const bodyOf = (report, key) => (section(report, key)?.blocks || []).map((b) => b.markdown).join('\n')

describe('classifyHeading', () => {
  it('matches the canonical names', () => {
    expect(classifyHeading('Objective')).toBe('objective')
    expect(classifyHeading('Method')).toBe('method')
    expect(classifyHeading('Interpretation')).toBe('interpretation')
  })

  it('matches the words people actually write', () => {
    // Without these the feature looks broken on any real note: the lab-report
    // template itself seeds "Abstract" and "Results".
    expect(classifyHeading('Abstract')).toBe('objective')
    expect(classifyHeading('Aim')).toBe('objective')
    expect(classifyHeading('Procedure')).toBe('method')
    expect(classifyHeading('Results')).toBe('result')
    expect(classifyHeading('Discussion')).toBe('interpretation')
    expect(classifyHeading('Analysis')).toBe('interpretation')
    expect(classifyHeading('Takeaways')).toBe('conclusion')
  })

  it('shrugs off case, emphasis and trailing punctuation', () => {
    expect(classifyHeading('  RESULTS  ')).toBe('result')
    expect(classifyHeading('**Method**')).toBe('method')
    expect(classifyHeading('Conclusion:')).toBe('conclusion')
  })

  it('returns null for something it does not recognise', () => {
    expect(classifyHeading('Shopping list')).toBeNull()
    expect(classifyHeading('')).toBeNull()
  })
})

describe('buildReport', () => {
  it('files each heading under its canonical section', () => {
    const report = buildReport(
      textNote('# A run\n\n## Abstract\n\nTesting Bell states.\n\n## Results\n\n512/512 correlated.'),
    )

    expect(bodyOf(report, 'objective')).toContain('Testing Bell states.')
    expect(bodyOf(report, 'result')).toContain('512/512 correlated.')
  })

  it('drops only the first H1, because it is rendered as the title', () => {
    const report = buildReport(textNote('# A run\n\nOpening line.\n\n## Method\n\n# Later heading\n\nkept'))

    const all = JSON.stringify(report)
    expect(all).not.toContain('# A run')
    // A later `#` is content the author deliberately wrote.
    expect(bodyOf(report, 'method')).toContain('# Later heading')
    expect(bodyOf(report, 'method')).toContain('kept')
  })

  it('treats the opening paragraph as the objective', () => {
    // The paragraph most notes start with reads as what you were trying to do.
    // Sending it to the Appendix would make an explanatory opening look like a
    // leftover scrap.
    const report = buildReport(textNote('# A run\n\nI wanted to check the CHSH bound.'))
    expect(bodyOf(report, 'objective')).toContain('I wanted to check the CHSH bound.')
  })

  it('merges an opening paragraph with an explicit objective section', () => {
    const report = buildReport(
      textNote('# A run\n\nOpening context.\n\n## Objective\n\nStated aim.'),
    )
    const body = bodyOf(report, 'objective')
    expect(body).toContain('Opening context.')
    expect(body).toContain('Stated aim.')
  })

  it('keeps an unrecognised heading in the appendix, heading intact', () => {
    // The load-bearing test for "nothing is dropped".
    const report = buildReport(
      textNote('# A run\n\n## Method\n\nDid a thing.\n\n## Shopping list\n\nmilk, qubits'),
    )

    expect(report.appendix).toHaveLength(1)
    expect(report.appendix[0].markdown).toContain('Shopping list')
    expect(report.appendix[0].markdown).toContain('milk, qubits')
  })

  it('loses no prose anywhere in the projection', () => {
    const markdown = [
      '# Title',
      '',
      'alpha',
      '',
      '## Method',
      '',
      'beta',
      '',
      '## Nonsense heading',
      '',
      'gamma',
      '',
      '## Conclusion',
      '',
      'delta',
    ].join('\n')

    const report = buildReport(textNote(markdown))
    const rendered = JSON.stringify(report)

    for (const word of ['alpha', 'beta', 'gamma', 'delta']) {
      expect(rendered).toContain(word)
    }
  })

  it('keeps `###` sub-headings inside their parent section', () => {
    // Promoting them would fragment a section the author deliberately grouped.
    const report = buildReport(
      textNote('# T\n\n## Method\n\n### Step one\n\nfirst\n\n### Step two\n\nsecond'),
    )

    expect(report.appendix).toHaveLength(0)
    const body = bodyOf(report, 'method')
    expect(body).toContain('### Step one')
    expect(body).toContain('second')
  })

  it('collects code and circuit blocks into their own sections', () => {
    // The fixed frame doing its job: a reader wants the circuit in one place
    // and the program in another, however they were interleaved while writing.
    const report = buildReport(
      textNote('# T\n\n## Method\n\nprose', [
        { id: 'c1', type: 'code', framework: 'qiskit', code: 'print(1)' },
        { id: 'q1', type: 'circuit', data: null, name: 'Bell' },
        { id: 'c2', type: 'code', framework: 'qiskit', code: 'print(2)' },
      ]),
    )

    expect(section(report, 'code').blocks).toHaveLength(2)
    expect(section(report, 'circuit').blocks).toHaveLength(1)
    expect(bodyOf(report, 'method')).toBe('prose')
  })

  it('omits sections with nothing in them and reports them as missing', () => {
    const report = buildReport(textNote('# T\n\n## Method\n\nonly this'))

    // Nothing precedes the heading except the H1, which becomes the title — so
    // objective is genuinely empty here, not merely unmatched.
    expect(report.sections.map((s) => s.key)).toEqual(['method'])
    expect(report.missing).toContain('interpretation')
    expect(report.missing).toContain('conclusion')
    expect(report.missing).not.toContain('method')
  })

  it('survives an empty or malformed note', () => {
    for (const input of [null, {}, { content: [] }, { content: [{ type: 'mystery' }] }]) {
      const report = buildReport(input)
      expect(report.sections).toEqual([])
      expect(report.appendix).toEqual([])
      expect(report.missing).toHaveLength(REPORT_SECTIONS.length)
    }
  })
})

describe('reportHints', () => {
  it('nudges about the sections that carry the argument', () => {
    const hints = reportHints(buildReport(textNote('# T\n\n## Method\n\nx')))
    const keys = hints.map((h) => h.key)

    expect(keys).toContain('interpretation')
    expect(keys).toContain('conclusion')
    expect(keys).not.toContain('method')
  })

  it('says nothing about a missing circuit or code block', () => {
    // A theory write-up legitimately has neither. Nagging about them would
    // train people to ignore the hints entirely, including the useful ones.
    const hints = reportHints(buildReport(textNote('# T\n\n## Objective\n\na\n\n## Method\n\nb\n\n## Result\n\nc\n\n## Interpretation\n\nd\n\n## Conclusion\n\ne')))
    expect(hints).toEqual([])
  })

  it('leads with the interpretation, the one most often skipped', () => {
    const hints = reportHints(buildReport(textNote('# T\n\n## Objective\n\na\n\n## Method\n\nb\n\n## Result\n\nc')))
    expect(hints[0].key).toBe('interpretation')
  })
})

describe('reportToMarkdown', () => {
  it('writes the frame in order, with run output', () => {
    const report = buildReport(
      textNote('# A run\n\n## Abstract\n\nthe aim\n\n## Results\n\nthe data', [
        {
          id: 'c1',
          type: 'code',
          framework: 'qiskit',
          code: 'print(1)',
          lastResult: { output: '1\n', status: 'ok' },
        },
      ]),
    )

    const md = reportToMarkdown(report)

    expect(md.startsWith('# A run')).toBe(true)
    expect(md.indexOf('## Objective')).toBeLessThan(md.indexOf('## Code'))
    expect(md.indexOf('## Code')).toBeLessThan(md.indexOf('## Result'))
    expect(md).toContain('```qiskit')
    expect(md).toContain('print(1)')
    // The output is part of the result, not a detail of the editor.
    expect(md).toContain('Output:')
  })

  it('carries the appendix through, so an export loses nothing either', () => {
    const report = buildReport(textNote('# T\n\n## Odd heading\n\nstray thought'))
    const md = reportToMarkdown(report)

    expect(md).toContain('## Appendix')
    expect(md).toContain('stray thought')
  })
})
