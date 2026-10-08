// Slash-menu item definitions. No JSX here (this is a .js module) — icons are
// stored as lucide component references and rendered by SuggestionList.
//
// Items run a TipTap command inside the single note document: prose commands,
// or inserting a runnable-code atom node at the cursor. The Image item
// opens a file picker wired in NoteDocument.

import {
  Type, Heading1, Heading2, Heading3, TextQuote, Minus, List, ListOrdered,
  ListChecks, Sigma, Info, Code2, Image as ImageIcon,
  Table as TableIcon, PenTool, LineChart, Network, Workflow, Layers,
} from 'lucide-react'
import { DEFAULT_DIAGRAM } from './DiagramNode.js'
import { defaultMindMap, mindMapFromOutline } from '../../../lib/notebook/mindmap.js'
import { FORMULA_TEMPLATES } from '../editorActions.js'

// A ProseMirror list node -> an indented "- item" outline for mindMapFromOutline.
function listToOutline(list, depth = 0) {
  const lines = []
  list.forEach((item) => {
    let text = ''
    const nested = []
    item.forEach((child) => {
      if (/List$/.test(child.type.name)) nested.push(listToOutline(child, depth + 1))
      else if (!text) text = child.textContent.trim()
    })
    lines.push(`${'  '.repeat(depth)}- ${text || '…'}`, ...nested)
  })
  return lines.join('\n')
}

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
      key: 'code', title: 'Code block', subtitle: 'Runnable Python or JavaScript', Icon: Code2,
      keywords: 'code python javascript js run execute',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'runnableCode' }).run(),
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
    {
      key: 'mindmap', title: 'Mind map', subtitle: 'Branching map of ideas, keyboard-driven', Icon: Network,
      keywords: 'mind map mindmap brainstorm tree ideas branches graph visual',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'mindMap', attrs: { data: defaultMindMap() } }).run(),
    },
    {
      key: 'mindmap-outline', title: 'Mind map from list', subtitle: 'Turn the bullet list above into a map', Icon: Network,
      keywords: 'mind map outline list convert bullets',
      run: ({ editor, range }) => {
        // The nearest list before the cursor becomes the map; with none, a starter map.
        const { state } = editor
        let list = null
        let heading = ''
        state.doc.nodesBetween(0, range.from, (node) => {
          if (node.type.name === 'heading') heading = node.textContent
          if (node.type.name === 'bulletList' || node.type.name === 'orderedList' || node.type.name === 'taskList') {
            list = node
            return false
          }
          return true
        })
        const data = list ? mindMapFromOutline(listToOutline(list), heading || 'Central idea') : defaultMindMap()
        editor.chain().focus().deleteRange(range).insertContent({ type: 'mindMap', attrs: { data } }).run()
      },
    },
    {
      key: 'flashcard', title: 'Flashcard', subtitle: 'question :: answer, reviewed with spaced repetition', Icon: Layers,
      keywords: 'flashcard flash card quiz study review memorise memorize anki spaced repetition',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range)
          .insertContent('Question :: Answer')
          // Select "Question" so typing replaces it straight away.
          .setTextSelection({ from: range.from, to: range.from + 'Question'.length })
          .run(),
    },
    {
      key: 'diagram', title: 'Diagram', subtitle: 'Flowchart, sequence, timeline, Gantt, pie…', Icon: Workflow,
      keywords: 'diagram flowchart flow chart mermaid sequence gantt timeline pie graph uml visual',
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'diagram', attrs: { code: DEFAULT_DIAGRAM } }).run(),
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
  // Title matches first (prefix before substring), keyword-only matches after, so
  // "/diagram" offers Diagram before Sketch (whose keywords mention diagrams).
  const rank = (item) => {
    const title = item.title.toLowerCase()
    if (title.startsWith(q)) return 0
    if (title.includes(q)) return 1
    if ((item.keywords || '').includes(q)) return 2
    return -1
  }
  return items
    .map((item, i) => ({ item, i, r: rank(item) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item)
}
