// ProseMirror node-view for an embedded circuit inside the single-document note
// editor. Reuses the standalone CircuitBlock UI; edits write back via
// updateAttributes, and "Create code" inserts a runnable code node right after.

import { NodeViewWrapper } from '@tiptap/react'
import { GripVertical, Trash2 } from 'lucide-react'
import CircuitBlock from '../CircuitBlock.jsx'
import { useConfirm } from '../ui/useConfirm.jsx'

export default function CircuitNodeView({ node, updateAttributes, deleteNode, editor, getPos }) {
  const [confirm, confirmEl] = useConfirm()
  const block = {
    format: node.attrs.format,
    data: node.attrs.data,
    source: node.attrs.source,
    name: node.attrs.name,
  }

  const insertCodeAfter = (payload) => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (pos == null) return
    editor
      .chain()
      .insertContentAt(pos + node.nodeSize, {
        type: 'runnableCode',
        attrs: { framework: payload.framework || 'qiskit', code: payload.code || '' },
      })
      .focus()
      .run()
  }

  return (
    <NodeViewWrapper className="nb-nodeview nb-nodeview-circuit">
      <div className="nb-nodeview-gutter" contentEditable={false}>
        <button className="nb-nodeview-handle" data-drag-handle title="Drag to move" type="button">
          <GripVertical size={15} />
        </button>
        <button
          className="nb-nodeview-del"
          onClick={async () => {
            if (await confirm({ title: 'Delete circuit block?', message: 'This circuit will be removed from the note.', danger: true })) {
              deleteNode()
            }
          }}
          title="Delete circuit block"
          type="button"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="nb-nodeview-body" contentEditable={false}>
        <CircuitBlock block={block} onChange={(patch) => updateAttributes(patch)} onCreateCode={insertCodeAfter} />
      </div>
      {confirmEl}
    </NodeViewWrapper>
  )
}
