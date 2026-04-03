import { useState } from 'react'
import { Check, X, FileEdit, FilePlus, Terminal, FileCode, ChevronDown, ChevronRight, Shield, ShieldCheck, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeniedTool } from '../App'

interface FileChange {
  tool: DeniedTool
  filePath: string
  action: 'write' | 'edit' | 'execute' | 'other'
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

function DiffBlock({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  return (
    <div className="text-[11px] font-mono leading-4 rounded bg-black/30 overflow-hidden border border-td-border/30">
      {oldStr.split('\n').map((line, i) => (
        <div key={`r-${i}`} className="px-2.5 py-0.5 bg-red-500/10 text-red-300 whitespace-pre-wrap break-all">
          <span className="opacity-40 mr-1.5 select-none">-</span>{line || '\u00A0'}
        </div>
      ))}
      {newStr.split('\n').map((line, i) => (
        <div key={`a-${i}`} className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-300 whitespace-pre-wrap break-all">
          <span className="opacity-40 mr-1.5 select-none">+</span>{line || '\u00A0'}
        </div>
      ))}
    </div>
  )
}

function ToolDetail({ change }: { change: FileChange }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = change.action === 'edit' && change.oldString != null && change.newString != null
    || change.command
    || change.newContent

  return (
    <div>
      {/* Summary line — always visible */}
      <div className="flex items-center gap-2 text-xs">
        {change.action === 'write' && <FilePlus className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
        {change.action === 'edit' && <FileEdit className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
        {change.action === 'execute' && <Terminal className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
        {change.action === 'other' && <FileCode className="h-3.5 w-3.5 text-td-muted shrink-0" />}

        <span className={cn(
          'font-mono text-[11px]',
          change.action === 'execute' ? 'text-blue-300' : 'text-td-text'
        )}>
          {change.action === 'execute' && change.command
            ? `$ ${change.command.length > 80 ? change.command.slice(0, 80) + '...' : change.command}`
            : change.filePath}
        </span>

        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-medium',
          change.action === 'write' ? 'bg-emerald-500/15 text-emerald-400' :
          change.action === 'edit' ? 'bg-amber-500/15 text-amber-400' :
          change.action === 'execute' ? 'bg-blue-500/15 text-blue-400' :
          'bg-td-border text-td-muted'
        )}>
          {change.action === 'write' ? 'Create' :
           change.action === 'edit' ? 'Edit' :
           change.action === 'execute' ? 'Run' :
           change.tool.tool_name}
        </span>

        {hasDetail && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-td-muted hover:text-td-text ml-auto"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-1.5 ml-5.5">
          {change.action === 'edit' && change.oldString != null && change.newString != null ? (
            <DiffBlock oldStr={change.oldString} newStr={change.newString} />
          ) : change.command ? (
            <div className="text-[11px] font-mono p-2 rounded bg-black/30 text-blue-300 border border-td-border/30">
              $ {change.command}
            </div>
          ) : change.newContent != null ? (
            <div className="text-[11px] font-mono rounded bg-black/30 overflow-hidden max-h-32 overflow-y-auto border border-td-border/30">
              {change.newContent.split('\n').slice(0, 20).map((line, i) => (
                <div key={i} className="px-2.5 py-0.5 text-emerald-300/80 whitespace-pre-wrap break-all">
                  <span className="opacity-40 mr-1.5 select-none">+</span>{line || '\u00A0'}
                </div>
              ))}
              {(change.newContent.split('\n').length > 20) && (
                <div className="px-2.5 py-1 text-td-muted text-[10px]">... {change.newContent.split('\n').length - 20} more lines</div>
              )}
            </div>
          ) : (
            <pre className="text-[10px] text-td-muted font-mono whitespace-pre-wrap max-h-32 overflow-y-auto p-2 rounded bg-black/30 border border-td-border/30">
              {JSON.stringify(change.tool.tool_input, null, 2).slice(0, 500)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

const actionLabels: Record<FileChange['action'], string> = {
  write: 'Create file',
  edit: 'Edit file',
  execute: 'Run command',
  other: 'Use tool'
}

function ApprovalWidget({ denials, onApprove, onApproveAll, onReject, onViewDiff }: ApprovalWidgetProps) {
  const [decided, setDecided] = useState(false)

  const changes: FileChange[] = denials.map((d) => {
    const input = d.tool_input
    const toolName = d.tool_name.toLowerCase()
    if (toolName.includes('write') && typeof input.file_path === 'string') {
      return {
        tool: d, filePath: input.file_path, action: 'write' as const,
        newContent: typeof input.content === 'string' ? input.content : undefined
      }
    } else if (toolName.includes('edit') && typeof input.file_path === 'string') {
      return {
        tool: d, filePath: input.file_path, action: 'edit' as const,
        oldString: typeof input.old_string === 'string' ? input.old_string : undefined,
        newString: typeof input.new_string === 'string' ? input.new_string : undefined
      }
    } else if (toolName.includes('bash') || toolName.includes('execute')) {
      return {
        tool: d, filePath: d.tool_name, action: 'execute' as const,
        command: typeof input.command === 'string' ? input.command : undefined
      }
    }
    return {
      tool: d, filePath: String(input.file_path || d.tool_name), action: 'other' as const
    }
  })

  if (decided) {
    return null
  }

  return (
    <div className="px-6 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="max-w-3xl mx-auto mb-2 rounded-xl border border-amber-500/20 bg-td-surface overflow-hidden shadow-lg shadow-black/10">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-td-border/50 bg-amber-500/5">
          <Shield className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold text-td-text">
            Permission required
          </span>
          <span className="text-[11px] text-td-muted">
            Claude wants to perform {denials.length} action{denials.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tool list */}
        <div className="px-4 py-2.5 space-y-1.5">
          {changes.map((change) => {
            const hasDiff = (change.action === 'edit' && change.oldString != null) ||
              (change.action === 'write' && change.newContent != null) ||
              (change.action === 'execute' && change.command)

            return (
              <div
                key={change.tool.tool_use_id}
                className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg bg-td-bg/50 group"
              >
                <div className={cn(
                  'h-6 w-6 rounded-md flex items-center justify-center shrink-0',
                  change.action === 'write' ? 'bg-emerald-500/15' :
                  change.action === 'edit' ? 'bg-amber-500/15' :
                  change.action === 'execute' ? 'bg-blue-500/15' :
                  'bg-td-border/50'
                )}>
                  {change.action === 'write' && <FilePlus className="h-3 w-3 text-emerald-400" />}
                  {change.action === 'edit' && <FileEdit className="h-3 w-3 text-amber-400" />}
                  {change.action === 'execute' && <Terminal className="h-3 w-3 text-blue-400" />}
                  {change.action === 'other' && <FileCode className="h-3 w-3 text-td-muted" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-td-text-secondary">
                      {actionLabels[change.action]}
                    </span>
                    <span className="text-[10px] text-td-muted">{change.tool.tool_name}</span>
                  </div>
                  <div className="text-[11px] font-mono text-td-text truncate">
                    {change.action === 'execute' && change.command
                      ? `$ ${change.command.slice(0, 60)}`
                      : change.filePath.split('/').slice(-2).join('/')}
                  </div>
                </div>

                {hasDiff && (
                  <button
                    type="button"
                    onClick={() => onViewDiff?.({
                      filePath: change.filePath,
                      action: change.action,
                      oldString: change.oldString,
                      newString: change.newString,
                      newContent: change.newContent,
                      command: change.command,
                    })}
                    className="text-[10px] text-td-muted hover:text-td-text flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Eye className="h-3 w-3" />
                    View
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-td-border/50 bg-td-bg/30">
          <button
            onClick={() => { setDecided(true); onReject() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-td-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="h-3 w-3" />
            Deny
          </button>
          <button
            onClick={() => { setDecided(true); onApproveAll() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-td-muted hover:text-amber-400 hover:bg-amber-500/10 border border-td-border transition-colors"
          >
            <ShieldCheck className="h-3 w-3" />
            Always allow
          </button>
          <button
            onClick={() => { setDecided(true); onApprove([...denials]) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
          >
            <Check className="h-3 w-3" />
            Allow
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApprovalWidget
