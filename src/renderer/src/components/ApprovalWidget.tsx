import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { getToolActionType } from '../App'
import type { DeniedTool, ToolActionType } from '../App'

interface FileChange {
  tool: DeniedTool
  filePath: string
  action: ToolActionType
  oldString?: string
  newString?: string
  newContent?: string
  command?: string
}

export interface DiffViewData {
  filePath: string
  action: 'write' | 'edit' | 'execute' | 'other'
  oldString?: string
  newString?: string
  newContent?: string
  command?: string
}

interface ApprovalWidgetProps {
  denials: DeniedTool[]
  onApprove: (approved: DeniedTool[]) => void
  onApproveAll: () => void
  onReject: () => void
  onViewDiff?: (data: DiffViewData) => void
}

function DiffPreview({ change }: { change: FileChange }) {
  if (change.action === 'edit' && change.oldString != null && change.newString != null) {
    const oldLines = change.oldString.split('\n')
    const newLines = change.newString.split('\n')
    return (
      <div className="text-[11px] font-mono leading-[18px] rounded-md bg-black/50 overflow-hidden border border-td-border/20 max-h-48 overflow-y-auto">
        {oldLines.map((line, i) => (
          <div key={`r-${i}`} className="flex bg-red-500/15">
            <span className="w-7 text-right pr-1.5 text-td-muted/30 select-none shrink-0 py-px">{i + 1}</span>
            <span className="text-red-400 w-4 text-center select-none shrink-0 py-px">-</span>
            <span className="flex-1 pr-2 py-px text-red-300 whitespace-pre-wrap break-all">{line || '\u00A0'}</span>
          </div>
        ))}
        {newLines.map((line, i) => (
          <div key={`a-${i}`} className="flex bg-emerald-500/15">
            <span className="w-7 text-right pr-1.5 text-td-muted/30 select-none shrink-0 py-px">{oldLines.length + i + 1}</span>
            <span className="text-emerald-400 w-4 text-center select-none shrink-0 py-px">+</span>
            <span className="flex-1 pr-2 py-px text-emerald-300 whitespace-pre-wrap break-all">{line || '\u00A0'}</span>
          </div>
        ))}
      </div>
    )
  }

  if (change.action === 'execute' && change.command) {
    return (
      <div className="text-[11px] font-mono p-2.5 rounded-md bg-black/40 text-blue-300 border border-td-border/30">
        $ {change.command}
      </div>
    )
  }

  if (change.action === 'write' && change.newContent != null) {
    const lines = change.newContent.split('\n').slice(0, 15)
    const total = change.newContent.split('\n').length
    return (
      <div className="text-[11px] font-mono leading-[18px] rounded-md bg-black/50 overflow-hidden border border-td-border/20 max-h-48 overflow-y-auto">
        {lines.map((line, i) => (
          <div key={i} className="flex bg-emerald-500/15">
            <span className="w-7 text-right pr-1.5 text-td-muted/30 select-none shrink-0 py-px">{i + 1}</span>
            <span className="text-emerald-400 w-4 text-center select-none shrink-0 py-px">+</span>
            <span className="flex-1 pr-2 py-px text-emerald-300 whitespace-pre-wrap break-all">{line || '\u00A0'}</span>
          </div>
        ))}
        {total > 15 && (
          <div className="px-2.5 py-1 text-td-muted text-[10px]">... {total - 15} more lines</div>
        )}
      </div>
    )
  }

  return null
}

function Kbd({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded bg-td-surface border border-td-border text-[10px] font-mono text-td-text-tertiary">
      {children}
    </span>
  )
}

const actionVerbs: Record<ToolActionType, string> = {
  read: 'Read',
  edit: 'Edit',
  write: 'Create',
  execute: 'Run',
  web: 'Fetch',
  agent: 'Launch',
  other: 'Use'
}

const actionNounPlurals: Record<ToolActionType, string> = {
  read: 'reads',
  edit: 'edits',
  write: 'file writes',
  execute: 'commands',
  web: 'web access',
  agent: 'agents',
  other: 'tool actions'
}

function ApprovalWidget({ denials, onApprove, onApproveAll, onReject }: ApprovalWidgetProps) {
  const [decided, setDecided] = useState(false)

  const changes: FileChange[] = denials.map((d) => {
    const input = d.tool_input
    const action = getToolActionType(d.tool_name)
    if (action === 'write' && typeof input.file_path === 'string') {
      return {
        tool: d, filePath: input.file_path, action,
        newContent: typeof input.content === 'string' ? input.content : undefined
      }
    } else if (action === 'edit' && typeof input.file_path === 'string') {
      return {
        tool: d, filePath: input.file_path, action,
        oldString: typeof input.old_string === 'string' ? input.old_string : undefined,
        newString: typeof input.new_string === 'string' ? input.new_string : undefined
      }
    } else if (action === 'execute') {
      return {
        tool: d, filePath: d.tool_name, action,
        command: typeof input.command === 'string' ? input.command : undefined
      }
    }
    return {
      tool: d, filePath: String(input.file_path || d.tool_name), action
    }
  })

  // Keyboard shortcuts: Enter = allow once, Cmd+Enter = always allow, Esc = deny
  useEffect(() => {
    if (decided) return
    const handler = (e: KeyboardEvent) => {
      // Don't intercept keyboard events from terminal areas
      if ((e.target as HTMLElement)?.closest?.('[data-terminal]')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setDecided(true)
        onReject()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setDecided(true)
        onApproveAll()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        setDecided(true)
        onApprove([...denials])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [decided, denials, onApprove, onApproveAll, onReject])

  if (decided) return null

  const firstChange = changes[0]
  const fileName = firstChange
    ? firstChange.action === 'execute'
      ? firstChange.command?.split(' ')[0] || 'command'
      : firstChange.filePath.split('/').pop() || firstChange.filePath
    : 'tool'
  const verb = firstChange ? actionVerbs[firstChange.action] : 'Use'
  const isMac = navigator.platform.includes('Mac')

  return (
    <div className="px-6 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="max-w-3xl mx-auto mb-2 rounded-lg border border-td-border bg-td-surface overflow-hidden">
        {/* Title + content */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          <div>
            <h3 className="text-sm text-td-text">
              Allow Claude to <strong>{verb}</strong> {fileName}?
            </h3>
            {firstChange && firstChange.action !== 'execute' && (
              <p className="text-[11px] font-mono text-td-muted mt-1 truncate">
                {firstChange.filePath}
              </p>
            )}
          </div>

          {/* Inline diff/preview */}
          {changes.map((change) => (
            <DiffPreview key={change.tool.tool_use_id} change={change} />
          ))}

          {changes.length > 1 && (
            <p className="text-[11px] text-td-muted">
              + {changes.length - 1} more action{changes.length > 2 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-td-border/50">
          <button
            onClick={() => { setDecided(true); onReject() }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-td-muted hover:text-td-text hover:bg-td-hover transition-colors"
          >
            Deny
            <Kbd>Esc</Kbd>
          </button>
          <button
            onClick={() => { setDecided(true); onApproveAll() }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-td-text-secondary hover:text-td-text border border-td-border hover:bg-td-hover transition-colors"
          >
            Always allow {firstChange ? actionNounPlurals[firstChange.action] : 'actions'}
            <span className="flex items-center gap-0.5">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>↵</Kbd>
            </span>
          </button>
          <button
            onClick={() => { setDecided(true); onApprove([...denials]) }}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-md text-xs font-medium text-td-text bg-td-hover/80 border border-td-border hover:bg-td-muted/30 transition-colors"
          >
            Allow once
            <Kbd>↵</Kbd>
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApprovalWidget
