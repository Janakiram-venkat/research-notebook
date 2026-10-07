// ProseMirror node-view for a runnable code block inside the single-document
// note editor. It reuses the standalone CodeBlock UI, mapping the node's attrs
// to the block shape CodeBlock expects and writing edits back via updateAttributes.

import { NodeViewWrapper } from '@tiptap/react'
import { GripVertical, Trash2 } from 'lucide-react'
import CodeBlock from '../CodeBlock.jsx'
import { useConfirm } from '../ui/useConfirm.jsx'

export default function RunnableCodeView({ node, updateAttributes, deleteNode }) {
  const [confirm, confirmEl] = useConfirm()
  const block = {
    framework: node.attrs.framework,
    code: node.attrs.code,
    lastResult: node.attrs.lastResult,
  }

  return (
    <NodeViewWrapper className="nb-nodeview nb-nodeview-code" data-selected={undefined}>
      <div className="nb-nodeview-gutter" contentEditable={false}>
        <button className="nb-nodeview-handle" data-drag-handle title="Drag to move" type="button">
          <GripVertical size={15} />
        </button>
        <button
          className="nb-nodeview-del"
          onClick={async () => {
            if (await confirm({ title: 'Delete code block?', message: 'This code and its last run result will be removed from the note.', danger: true })) {
              deleteNode()
            }
          }}
          title="Delete code block"
          type="button"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="nb-nodeview-body" contentEditable={false}>
        {/* CodeBlock takes no onCreateCode — that prop only belongs to the
            circuit node view, which uses it for "Create code". */}
        <CodeBlock block={block} onChange={(patch) => updateAttributes(patch)} />
      </div>
      {confirmEl}
    </NodeViewWrapper>
  )
}
