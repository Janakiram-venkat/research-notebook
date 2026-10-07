// Seed templates for new notes. Each returns a fresh content array (block list)
// so blocks get unique ids on every creation. Templates are seed content only —
// after creation, every note behaves the same in the editor.

import { textBlock, codeBlock, circuitBlock, DEFAULT_FOLDER } from './notebookStore.js'

const BELL_CIRCUIT = {
  n: 2,
  i: ['|0>', '|0>'],
  g: [
    { t: 'H', tg: [0], c: [], col: 0 },
    { t: 'CX', tg: [1], c: [0], col: 1 },
    { t: 'MEASURE', tg: [0], c: [], col: 2 },
    { t: 'MEASURE', tg: [1], c: [], col: 2 },
  ],
}

const BELL_QISKIT = `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])

sim = AerSimulator()
counts = sim.run(qc, shots=1024).result().get_counts()
print(counts)
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
    description: 'A runnable Qiskit block with room for what you tried and what happened.',
    build: () => ({
      title: 'Code scratchpad',
      folder: 'Lab Work',
      tags: ['code'],
      content: [
        textBlock(`# Scratchpad

What are you trying out?`),
        codeBlock({ framework: 'qiskit', code: BELL_QISKIT }),
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
      folder: 'Quantum Basics',
      tags: ['study'],
      content: [
        textBlock(
          `# Topic

## Key idea

Write the core intuition here. Use inline math like $\\ket{\\psi} = \\alpha\\ket{0} + \\beta\\ket{1}$.

> [!tip] Study move
> Link related topics with [[Quantum Measurement]] or [[Superposition]] so you can jump between notes later.

## Formula

$$ |\\alpha|^2 + |\\beta|^2 = 1 $$

> [!formula] Born rule, the probability of measuring outcome $x$ is $P(x)$.

$$ P(x) = |\\langle x | \\psi \\rangle|^2 $$

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
    description: 'Objective → circuit → code → results, wired together.',
    build: () => ({
      title: 'Experiment log',
      folder: 'Lab Work',
      tags: ['experiment'],
      content: [
        textBlock(`# Experiment log

## Objective

What are you testing, and what do you expect to happen?`),
        textBlock(`## Circuit

The circuit under test:`),
        circuitBlock({ data: BELL_CIRCUIT, source: 'manual', name: 'Bell state' }),
        textBlock(`> [!question] Before running
> What measurement outcomes should this circuit produce, and why?`),
        textBlock(`## Code

Run the experiment and capture the measurement counts:`),
        codeBlock({ framework: 'qiskit', code: BELL_QISKIT }),
        textBlock(`## Results & observations

- Expected: roughly 50% \`00\` and 50% \`11\`.
- Observed:
- Notes:`),
      ],
    }),
  },
  {
    id: 'algorithm',
    label: 'Algorithm analysis',
    description: 'Break down an algorithm: problem, setup, steps, circuit, and complexity.',
    build: () => ({
      title: 'Algorithm analysis',
      folder: 'Algorithms',
      tags: ['algorithm'],
      content: [
        textBlock(
          `# Algorithm

## Problem

What does this algorithm solve?

## Setup

Initial state and assumptions.

## Steps

1. Step one
2. Step two
3. Step three

## Complexity

Classical vs. quantum cost, where is the speedup?

## Formula / state

$$ \\ket{\\psi} = \\frac{\\ket{0} + \\ket{1}}{\\sqrt{2}} $$

> [!example] Related notes
> Connect this to [[Quantum Measurement]], [[Superposition]], and [[Entanglement]].`
        ),
        textBlock(`## Reference circuit`),
        circuitBlock({ data: null, source: 'manual', name: '' }),
      ],
    }),
  },
  {
    id: 'lab-report',
    label: 'Quantum lab report',
    description: 'Formal write-up: abstract, method, data, conclusion.',
    build: () => ({
      title: 'Lab report',
      folder: 'Lab Work',
      tags: ['report'],
      content: [
        textBlock(
          `# Lab report

## Abstract

A short summary of what was done and found.

## Method

Describe the circuit and procedure.`
        ),
        circuitBlock({ data: null, source: 'manual', name: '' }),
        textBlock(`## Code & data`),
        codeBlock({ framework: 'qiskit', code: BELL_QISKIT }),
        textBlock(`## Results

Report measurements and plots here.

## Conclusion

Did the results match the prediction? Why or why not?`),
      ],
    }),
  },
]

// The three starters the empty notebook offers, in the order it offers them:
// something blank, something for a lab run, something for a code experiment.
// Named here rather than in the page so the page cannot drift from the roster.
export const STARTER_TEMPLATE_IDS = ['blank', 'experiment', 'scratchpad']

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]
}

// Distinct block types a template seeds (for the picker's "Includes …" chips).
// Order: text → code → circuit so cards read consistently.
export function templateBlockTypes(template) {
  const seen = new Set()
  for (const block of template.build().content || []) seen.add(block.type)
  return ['text', 'code', 'circuit'].filter((t) => seen.has(t))
}
