// Slash-menu item definitions. No JSX here (this is a .js module) — icons are
// stored as lucide component references and rendered by SuggestionList.
//
// Items run a TipTap command inside the single note document: prose commands,
// or inserting a runnable-code / circuit atom node at the cursor. The Image item
// opens a file picker wired in NoteDocument.

import {
  Type, Heading1, Heading2, Heading3, TextQuote, Minus, List, ListOrdered,
  ListChecks, Sigma, Info, Code2, Cpu, Image as ImageIcon,
  Table as TableIcon, PenTool, LineChart,
} from 'lucide-react'
import { FORMULA_TEMPLATES } from '../editorActions.js'

// Each entry: { key, title, subtitle, Icon, keywords, run({ editor, range }) }
export function buildSlashItems({ onPickImage, onInsertEquation }) {
  const inline = (fn) => ({ editor, range }) => fn(editor.chain().focus().deleteRange(range)).run()

  const items = [
    {
      key: 'text', title: 'Text', subtitle: 'Plain paragraph', Icon: Type,
      keywords: 'text paragraph body',
      run: inline((c) => c.setParagraph()),
    },
    {
      key: 'h1', title: 'Heading 1', subtitle: 'Large section heading', Icon: Heading1,
      keywords: 'h1 heading title big',
      run: inline((c) => c.setNode('heading', { level: 1 })),
    },
    {
      key: 'h2', title: 'Heading 2', subtitle: 'Medium heading', Icon: Heading2,
      keywords: 'h2 heading subtitle',
      run: inline((c) => c.setNode('heading', { level: 2 })),
    },
    {
      key: 'h3', title: 'Heading 3', subtitle: 'Small heading', Icon: Heading3,
      keywords: 'h3 heading',
      run: inline((c) => c.setNode('heading', { level: 3 })),
    },
    {
      key: 'quote', title: 'Quote', subtitle: 'Blockquote', Icon: TextQuote,
      keywords: 'quote blockquote cite',
      run: inline((c) => c.toggleBlockquote()),
    },
    {
      key: 'divider', title: 'Divider', subtitle: 'Horizontal rule', Icon: Minus,
      keywords: 'divider hr rule separator line',
      run: inline((c) => c.setHorizontalRule()),
    },
    {
      key: 'bullet', title: 'Bullet list', subtitle: 'Unordered list', Icon: List,
      keywords: 'bullet list unordered ul',
      run: inline((c) => c.toggleBulletList()),
    },
    {
      key: 'numbered', title: 'Numbered list', subtitle: 'Ordered list', Icon: ListOrdered,
      keywords: 'numbered ordered list ol',
      run: inline((c) => c.toggleOrderedList()),
    },
    {
      key: 'task', title: 'Task list', subtitle: 'Checkboxes', Icon: ListChecks,
      keywords: 'task todo checkbox checklist',
      run: inline((c) => c.toggleTaskList()),
    },
    {
      key: 'equation', title: 'Equation', subtitle: 'Write a formula with live preview', Icon: Sigma,
      keywords: 'equation math formula latex katex block',
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        onInsertEquation?.()
      },
    },
    {
      key: 'callout', title: 'Callout', subtitle: 'Note / tip / warning card', Icon: Info,
      keywords: 'callout note tip warning info admonition card',
      run: inline((c) => c.setCallout('note')),
    },
    {
      key: 'code', title: 'Code block', subtitle: 'Runnable quantum code', Icon: Code2,
      keywords: 'code qiskit python run execute',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'runnableCode' }).run(),
    },
    {
      key: 'circuit', title: 'Circuit', subtitle: 'Embed a saved circuit', Icon: Cpu,
      keywords: 'circuit quantum composer gates',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'circuitNode' }).run(),
    },
    {
      key: 'image', title: 'Image', subtitle: 'Insert from your device', Icon: ImageIcon,
      keywords: 'image picture photo upload',
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        onPickImage?.()
      },
    },
    {
      key: 'table', title: 'Table', subtitle: '3 x 3 with header row', Icon: TableIcon,
      keywords: 'table grid rows columns spreadsheet',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      key: 'plot', title: 'Data plot', subtitle: 'Line, bar or scatter from a small table', Icon: LineChart,
      keywords: 'plot chart graph line bar scatter data csv',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'dataPlot' }).run(),
    },
    {
      key: 'sketch', title: 'Sketch', subtitle: 'Freehand drawing canvas', Icon: PenTool,
      keywords: 'sketch draw drawing canvas paint diagram whiteboard',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'sketch' }).run(),
    },
  ]

  // Ready-made formulas as extra "Formula: …" entries.
  for (const tpl of FORMULA_TEMPLATES) {
    items.push({
      key: `formula-${tpl.label}`,
      title: `Formula · ${tpl.label}`,
      subtitle: 'Insert equation template',
      Icon: Sigma,
      keywords: `formula equation ${tpl.label.toLowerCase()}`,
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertBlockMath({ latex: tpl.tex }).run(),
    })
  }

  return items
}

export function filterSlashItems(items, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) || (item.keywords || '').includes(q),
  )
}
