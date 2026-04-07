import { useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { cn } from '@/lib/utils'

// ProseMirror plugin that detects ``` typed at the start of a paragraph
// and converts it to a code block immediately (no space/enter needed)
const backtickCodeBlockPluginKey = new PluginKey('backtickCodeBlock')

const BacktickCodeBlock = Extension.create({
  name: 'backtickCodeBlock',

  addProseMirrorPlugins() {
    const editorRef = this.editor
    return [
      new Plugin({
        key: backtickCodeBlockPluginKey,
        props: {
          handleTextInput(view, from, _to, text) {
            if (text !== '`') return false

            const { state } = view
            const $from = state.doc.resolve(from)
            const parent = $from.parent

            // Only in paragraphs
            if (parent.type.name !== 'paragraph') return false

            // Get text before cursor in this block
            const textBefore = parent.textBetween(0, $from.parentOffset) + text
            const match = textBefore.match(/^```([a-zA-Z]*)$/)
            if (!match) return false

            // Convert to code block
            const language = match[1] || null
            setTimeout(() => {
              editorRef
                .chain()
                .focus()
                .clearContent()
                .setCodeBlock(language ? { language } : {})
                .run()
            }, 0)

            return false
          },
        },
      }),
    ]
  },
})

export interface RichInputHandle {
  focus: () => void
  getMarkdown: () => string
  setContent: (md: string) => void
  getCursorPos: () => { start: number; end: number }
  isCursorAtStart: () => boolean
  isCursorAtEnd: () => boolean
}

interface RichInputProps {
  value: string
  onChange: (md: string) => void
  onKeyDown?: (e: KeyboardEvent) => void
  onPaste?: (e: ClipboardEvent) => void
  placeholder?: string
  className?: string
}

const RichInput = forwardRef<RichInputHandle, RichInputProps>(
  ({ value, onChange, onKeyDown, onPaste, placeholder, className }, ref) => {
    const suppressUpdate = useRef(false)

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          codeBlock: {
            HTMLAttributes: { class: 'rich-input-code-block' },
          },
          code: {
            HTMLAttributes: { class: 'rich-input-inline-code' },
          },
          heading: { levels: [1, 2, 3] },
        }),
        BacktickCodeBlock,
        Placeholder.configure({ placeholder: placeholder || '' }),
        Markdown.configure({
          html: false,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: value || '',
      editorProps: {
        attributes: {
          class: 'outline-none min-h-[48px] max-h-[192px] overflow-y-auto',
        },
        handleKeyDown: (_view, event) => {
          if (onKeyDown) {
            onKeyDown(event)
            if (event.defaultPrevented) return true
          }
          return false
        },
        handlePaste: (_view, event) => {
          if (onPaste) {
            onPaste(event as unknown as ClipboardEvent)
            if (event.defaultPrevented) return true
          }
          return false
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (suppressUpdate.current) return
        const md = ed.storage.markdown.getMarkdown() as string
        onChange(md)
      },
    })

    // Sync external value changes (e.g. history navigation, draft restore)
    useEffect(() => {
      if (!editor) return
      const currentMd = editor.storage.markdown.getMarkdown() as string
      if (currentMd !== value) {
        suppressUpdate.current = true
        editor.commands.setContent(value || '')
        suppressUpdate.current = false
      }
    }, [value, editor])

    // Update placeholder when it changes
    useEffect(() => {
      if (!editor) return
      editor.extensionManager.extensions.find(
        (ext) => ext.name === 'placeholder'
      )?.options && editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
        },
      })
    }, [placeholder, editor])

    const focus = useCallback(() => {
      editor?.commands.focus('end')
    }, [editor])

    const getMarkdown = useCallback(() => {
      if (!editor) return ''
      return editor.storage.markdown.getMarkdown() as string
    }, [editor])

    const setContent = useCallback((md: string) => {
      if (!editor) return
      suppressUpdate.current = true
      editor.commands.setContent(md || '')
      suppressUpdate.current = false
    }, [editor])

    const getCursorPos = useCallback(() => {
      if (!editor) return { start: 0, end: 0 }
      const { from, to } = editor.state.selection
      return { start: from, end: to }
    }, [editor])

    const isCursorAtStart = useCallback(() => {
      if (!editor) return true
      return editor.state.selection.from <= 1
    }, [editor])

    const isCursorAtEnd = useCallback(() => {
      if (!editor) return true
      return editor.state.selection.to >= editor.state.doc.content.size - 1
    }, [editor])

    useImperativeHandle(ref, () => ({
      focus,
      getMarkdown,
      setContent,
      getCursorPos,
      isCursorAtStart,
      isCursorAtEnd,
    }))

    // Focus on mount
    useEffect(() => {
      if (editor) {
        setTimeout(() => editor.commands.focus('end'), 0)
      }
    }, [editor])

    return (
      <div className={cn('rich-input-wrapper', className)}>
        <EditorContent editor={editor} />
      </div>
    )
  }
)

RichInput.displayName = 'RichInput'

export default RichInput
