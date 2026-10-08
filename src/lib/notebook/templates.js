// Seed templates for new notes. Each returns a fresh content array (block list)
// so blocks get unique ids on every creation. Templates are seed content only —
// after creation, every note behaves the same in the editor.

import { textBlock, codeBlock, newId, DEFAULT_FOLDER } from './notebookStore.js'
import { mmNode } from './mindmap.js'

// Visual blocks for templates: fresh ids every build, like textBlock/codeBlock.
const mindMapBlock = (root) => ({ id: newId('b'), type: 'mindmap', root })
const diagramBlock = (code) => ({ id: newId('b'), type: 'diagram', code })

const PY_SCRATCH = `# Try something. Ctrl+Enter runs the block.
data = [3, 1, 4, 1, 5, 9, 2, 6]

print("n      =", len(data))
print("mean   =", sum(data) / len(data))
print("sorted =", sorted(data))
`

const JS_SCRATCH = `// JavaScript runs in a sandboxed worker. Top-level await works.
const data = [3, 1, 4, 1, 5, 9, 2, 6]
const mean = data.reduce((a, b) => a + b, 0) / data.length

console.log({ n: data.length, mean })
`

export const TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank note',
    description: 'Start from an empty page with one clean writing block.',
    build: () => ({
      title: 'Untitled note',
      folder: DEFAULT_FOLDER,
      tags: [],
      content: [textBlock('')],
    }),
  },
  {
    id: 'scratchpad',
    label: 'Code scratchpad',
    description: 'A runnable code block with room for what you tried and what happened.',
    build: () => ({
      title: 'Code scratchpad',
      folder: 'Experiments',
      tags: ['code'],
      content: [
        textBlock(`# Scratchpad

What are you trying out?`),
        codeBlock({ framework: 'python', code: PY_SCRATCH }),
        textBlock(`## What happened

- Output:
- Next thing to try:`),
      ],
    }),
  },
  {
    id: 'study',
    label: 'Study notes',
    description: 'Concept summary, formulas, examples, mistakes, and review questions.',
    build: () => ({
      title: 'Study notes',
      folder: 'Learning',
      tags: ['study'],
      content: [
        textBlock(
          `# Topic

## Key idea

Write the core intuition in your own words. Use inline math like $a^2 + b^2 = c^2$.

> [!tip] Study move
> Link related topics with [[Another topic]] so you can jump between notes later.

## Formula

$$ \\bar{x} = \\frac{1}{N}\\sum_{i=1}^{N} x_i $$

## Example

- Given:
- Result:
- Why it matters:

## Common mistake

> What confuses people about this?

## Questions

- [ ] What am I still unsure about?
- [ ] What should I revise later?`
        ),
      ],
    }),
  },
  {
    id: 'experiment',
    label: 'Experiment log',
    description: 'Objective → method → code → results, wired together.',
    build: () => ({
      title: 'Experiment log',
      folder: 'Experiments',
      tags: ['experiment'],
      content: [
        textBlock(`# Experiment log

## Objective

What are you testing, and what do you expect to happen?`),
        textBlock(`> [!question] Before running
> What result would prove you wrong?`),
        textBlock(`## Method

Run the experiment and capture what it produces:`),
        codeBlock({ framework: 'python', code: PY_SCRATCH }),
        textBlock(`## Results & observations

- Expected:
- Observed:
- Notes:

## Conclusion

Did the result match the prediction? Why or why not?`),
      ],
    }),
  },
  {
    id: 'reading',
    label: 'Reading notes',
    description: 'Summarise a paper, article or book: claims, evidence, and what you think.',
    build: () => ({
      title: 'Reading notes',
      folder: 'Reading',
      tags: ['reading'],
      content: [
        textBlock(
          `# Title of the paper / article

- **Source:**
- **Author(s):**
- **Read on:**

## Summary

In two or three sentences: what is this about?

## Key claims

1. Claim, and the evidence offered for it
2.

## Quotes worth keeping

>

## My take

> [!question] Do I believe it?
> What is strong here, and what is missing?

## Follow-ups

- [ ] Look up:
- [ ] Related notes: [[Another note]]`
        ),
      ],
    }),
  },
  {
    id: 'decision',
    label: 'Decision log',
    description: 'Options, trade-offs and the call you made, so you can revisit why later.',
    build: () => ({
      title: 'Decision log',
      folder: 'Decisions',
      tags: ['decision'],
      content: [
        textBlock(
          `# Decision

## Context

What forced this decision, and what constraints apply?

## Options

| Option | Upside | Downside |
| --- | --- | --- |
| A | | |
| B | | |

## Decision

> [!tip] Chosen
> Which option, and the single strongest reason for it.

## What would change my mind

-

## Review on

- [ ] Revisit this on a set date and note how it turned out.`
        ),
      ],
    }),
  },
  {
    id: 'project',
    label: 'Project plan',
    description: 'Goal, milestones, open questions and a running log.',
    build: () => ({
      title: 'Project plan',
      folder: 'Projects',
      tags: ['project'],
      content: [
        textBlock(
          `# Project

## Goal

What does done look like?

## Milestones

- [ ] First milestone
- [ ] Second milestone
- [ ] Third milestone

## Open questions

-

## Log

- Today:`
        ),
        codeBlock({ framework: 'javascript', code: JS_SCRATCH }),
      ],
    }),
  },
  {
    id: 'lab-report',
    label: 'Research report',
    description: 'Formal write-up: abstract, method, data, conclusion.',
    build: () => ({
      title: 'Research report',
      folder: 'Reports',
      tags: ['report'],
      content: [
        textBlock(
          `# Research report

## Abstract

A short summary of what was done and found.

## Method

Describe the procedure and why you chose it.`
        ),
        textBlock(`## Code & data`),
        codeBlock({ framework: 'python', code: PY_SCRATCH }),
        textBlock(`## Results

Report measurements and plots here.

## Conclusion

Did the results match the prediction? Why or why not?`),
      ],
    }),
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    description: 'A mind map to spread ideas out, then pick the best and decide what to do next.',
    build: () => ({
      title: 'Brainstorm',
      folder: 'Ideas',
      tags: ['brainstorm'],
      content: [
        textBlock(`# Brainstorm

What problem are we exploring? Click the map, press **Tab** to add a branch and **Enter** for a sibling.`),
        mindMapBlock(mmNode('The question', [
          mmNode('Causes', [mmNode('…')]),
          mmNode('Options', [mmNode('…')]),
          mmNode('Constraints', [mmNode('…')]),
          mmNode('Wild ideas', [mmNode('…')]),
        ])),
        textBlock(`## Best three ideas

1. 
2. 
3. 

## Next steps

- [ ] `),
      ],
    }),
  },
  {
    id: 'concept-map',
    label: 'Concept map + flashcards',
    description: 'Map a topic visually, then write question :: answer cards to review it later.',
    build: () => ({
      title: 'Concept map',
      folder: 'Learning',
      tags: ['study'],
      content: [
        textBlock(`# Topic

One-paragraph summary in your own words.`),
        mindMapBlock(mmNode('Topic', [
          mmNode('Key idea 1', [mmNode('Example')]),
          mmNode('Key idea 2', [mmNode('Formula')]),
          mmNode('Related topics'),
          mmNode('Common mistakes'),
        ])),
        textBlock(`## Flashcards

Each line with \`::\` becomes a card in **Review**.

- What is the main idea of this topic? :: Your answer here
- Why does it matter? :: Your answer here`),
      ],
    }),
  },
  {
    id: 'process',
    label: 'Process / flowchart',
    description: 'Draw the steps of a process or algorithm as a flowchart, with notes on each step.',
    build: () => ({
      title: 'Process',
      folder: DEFAULT_FOLDER,
      tags: ['process'],
      content: [
        textBlock(`# Process

What does this process do, and when is it used?`),
        diagramBlock(`flowchart TD
  start([Start]) --> step1[First step]
  step1 --> check{Condition met?}
  check -- yes --> step2[Next step]
  check -- no --> fix[Adjust]
  fix --> step1
  step2 --> finish([Done])`),
        textBlock(`## Notes on each step

- **First step**: 
- **Condition**: `),
      ],
    }),
  },
  {
    id: 'flashcards',
    label: 'Flashcard deck',
    description: 'A list of question :: answer cards, reviewed with spaced repetition.',
    build: () => ({
      title: 'Flashcards',
      folder: 'Learning',
      tags: ['flashcards'],
      content: [
        textBlock(`# Flashcards

Write one card per line as \`question :: answer\`. Open **Review** on the notes page to study the ones that are due.

- Capital of France :: Paris
- $e^{i\\pi} + 1$ :: $0$ (Euler's identity)
- Mitochondria :: The organelle that produces most of the cell's ATP`),
      ],
    }),
  },
]
// The three starters the empty notebook offers, in the order it offers them:
// something blank, something for a structured experiment, something for a code
// experiment. Named here rather than in the page so the page cannot drift from
// the roster.
export const STARTER_TEMPLATE_IDS = ['blank', 'experiment', 'scratchpad']

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]
}

// Distinct block types a template seeds (for the picker's "Includes …" chips).
// Order: text → code so cards read consistently.
export function templateBlockTypes(template) {
  const seen = new Set()
  for (const block of template.build().content || []) seen.add(block.type)
  return ['text', 'code', 'mindmap', 'diagram'].filter((t) => seen.has(t))
}

// The first note a new reader sees. Not in TEMPLATES: it is a one-off, seeded once
// by the notebook page (see seedWelcomeNote in pages/Notebook.jsx).
export const WELCOME_TEMPLATE = {
  id: 'welcome',
  build: () => ({
    title: 'Welcome to your notebook',
    folder: DEFAULT_FOLDER,
    tags: ['start-here'],
    content: [
      textBlock(`# Welcome

This is a note. It can hold writing, math, code and sketches in one place, and it saves itself as you type.

## Try these

- Type **/** on an empty line to add a heading, list, code block, plot or sketch.
- Write math between dollar signs: $E = mc^2$.
- Link to another note with double brackets, like [[Another note]]. Both notes show the link.
- Select text to format it.`),
      codeBlock({ framework: 'python', code: 'print("Hello from your notebook")\nprint(2 + 2)\n' }),
      textBlock(`Click the block above and press **Ctrl+Enter** to run it. The output stays with the note.

## Your notes are yours

- They are saved in this browser. Use the menu on the notes page to download a backup, or sign in (top right) if your server has accounts.
- The **Agents** button opens an assistant that can search your notes, answer questions about them and quiz you.

Delete this note whenever you like.`),
    ],
  }),
}

// One journal note per day. `dailyKey` is the local date, e.g. "2026-10-08".
export function todayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function dailyTitle(key) {
  const [y, m, d] = key.split('-').map(Number)
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `Journal · ${label}`
}

export const DAILY_TEMPLATE = {
  id: 'daily',
  build: (key = todayKey()) => ({
    title: dailyTitle(key),
    folder: 'Journal',
    tags: ['journal'],
    content: [
      textBlock(`## Focus for today

What matters most today?

## Notes

## Learned

## Questions to follow up

> [!question]
> `),
    ],
  }),
}
