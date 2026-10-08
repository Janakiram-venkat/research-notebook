import { describe, expect, it } from 'vitest'
import { buildZip, noteToFile, parseMarkdownFile, readZip, safeName, splitFrontMatter } from './exporters.js'

const helpers = { newId: (p) => `${p}1`, textBlock: (markdown) => ({ type: 'text', markdown }) }

const note = {
  id: 'a', title: 'Heat: a "study"', folder: 'Physics', tags: ['thermo', 'lab'],
  createdAt: Date.UTC(2026, 0, 2),
  content: [
    { type: 'text', markdown: '# Heat\n\nEnergy $E=mc^2$.' },
    { type: 'code', framework: 'python', code: 'print(1)', lastResult: { output: '1' } },
  ],
}

describe('exporters', () => {
  it('makes file-safe names', () => {
    expect(safeName('a/b:c*?')).toBe('a b c')
    expect(safeName('   ')).toBe('Untitled')
  })

  it('round-trips a note through a markdown file', () => {
    const back = parseMarkdownFile('Physics/Heat.md', noteToFile(note), helpers)
    expect(back.title).toBe('Heat: a "study"')
    expect(back.folder).toBe('Physics')
    expect(back.tags).toEqual(['thermo', 'lab'])
    expect(back.content[0].markdown).toContain('Energy $E=mc^2$.')
    expect(back.content[0].markdown).toContain('```python\nprint(1)\n```')
    expect(back.createdAt).toBe(note.createdAt)
  })

  it('round-trips through a zip, with folders as directories and unique names', () => {
    const zip = buildZip([note, { ...note, id: 'b' }, { id: 'c', title: 'Loose', folder: 'General', content: [] }])
    const files = readZip(zip)
    expect(files.map((f) => f.path).sort()).toEqual(['Loose.md', 'Physics/Heat a study (2).md', 'Physics/Heat a study.md'])
  })

  it('reads Obsidian-style front-matter and falls back to the first heading', () => {
    const text = '---\ntags:\n  - "#idea"\n  - draft\naliases: x\n---\n# My idea\n\nBody'
    const n = parseMarkdownFile('Inbox/idea.md', text, helpers)
    expect(n.title).toBe('My idea')
    expect(n.tags).toEqual(['idea', 'draft'])
    expect(n.folder).toBe('Inbox')
    expect(n.content[0].markdown).toBe('Body')
  })

  it('handles files with no front-matter and uses the filename', () => {
    const n = parseMarkdownFile('plain.md', 'just text', helpers)
    expect(n.title).toBe('plain')
    expect(n.folder).toBe('General')
    expect(splitFrontMatter('no meta').meta).toEqual({})
  })

  it('ignores hidden and macOS metadata files in a zip', () => {
    const zip = buildZip([note])
    expect(readZip(zip)).toHaveLength(1)
  })
})
