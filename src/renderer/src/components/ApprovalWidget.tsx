import { useState, useEffect } from 'react'
import { Check, X, FileCode, FilePlus, FileEdit, ChevronDown, ChevronRight, Shield, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import type { DeniedTool } from '../App'

interface FileChange {
  tool: DeniedTool
  filePath: string
  action: 'write' | 'edit' | 'other'
  oldString?: string
  newString?: string
  newContent?: string
  oldContent?: string
}

interface ApprovalWidgetProps {
  denials: DeniedTool[]
  onApprove: (approved: DeniedTool[]) => void
  onApproveAll: () => void
  onReject: () => void
}

function DiffBlock({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  return (
    <div className="text-[10px] font-mono leading-4 mt-1.5 rounded bg-td-bg overflow-hidden border border-td-border/50">
      {oldStr.split('\n').map((line, i) => (
        <div key={`r-${i}`} className="px-2 bg-red-500/8 text-red-300 whitespace-pre-wrap break-all">
          <span className="opacity-40 mr-1.5 select-none">-</span>{line || '\u00A0'}
        </div>
      ))}
      {newStr.split('\n').map((line, i) => (
        <div key={`a-${i}`} className="px-2 bg-emerald-500/8 text-emerald-300 whitespace-pre-wrap break-all">
          <span className="opacity-40 mr-1.5 select-none">+</span>{line || '\u00A0'}
        </div>
      ))}
    </div>
  )
}

function ToolApprovalCard({ change, onApprove, onReject }: {
  change: FileChange
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null)
  const fileName = change.filePath.split('/').pop() || change.filePath

  const ActionIcon = change.action === 'write' ? FilePlus
    : change.action === 'edit' ? FileEdit
    : FileCode

  const actionColor = change.action === 'write' ? 'text-emerald-400'
    : change.action === 'edit' ? 'text-amber-400'
    : 'text-td-muted'

  const actionLabel = change.action === 'write' ? 'Create' : change.action === 'edit' ? 'Edit' : change.tool.tool_name

  if (decided) {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs',
        decided === 'approved' ? 'bg-emerald-500/8 text-emerald-400' : 'bg-red-500/8 text-red-400'
      )}>
        {decided === 'approved' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        <ActionIcon className="h-3 w-3" />
        <span className="font-medium">{fileName}</span>
        <span className="text-[10px] opacity-70">{decided === 'approved' ? 'Approved' : 'Rejected'}</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-td-border bg-td-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-td-muted hover:text-td-text">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <ActionIcon className={cn('h-3.5 w-3.5 shrink-0', actionColor)} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-td-text truncate">{fileName}</span>
          <span className={cn('text-[10px] ml-1.5 px-1 py-0.5 rounded', actionColor, 'bg-current/10')}>{actionLabel}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDecided('approved'); onApprove() }}
            className="h-6 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          >
            <Check className="h-3 w-3 mr-1" />
            Allow
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDecided('rejected'); onReject() }}
            className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="border-t border-td-border/50 px-3 py-2">
          {change.action === 'edit' && change.oldString != null && change.newString != null ? (
            <DiffBlock oldStr={change.oldString} newStr={change.newString} />
          ) : change.newContent != null ? (
            <div className="text-[10px] font-mono leading-4 rounded bg-td-bg overflow-hidden max-h-32 overflow-y-auto">
              {change.newContent.split('\n').slice(0, 20).map((line, i) => (
                <div key={i} className="px-2 text-emerald-300/80 whitespace-pre-wrap break-all">
                  <span className="opacity-40 mr-1.5 select-none">+</span>{line || '\u00A0'}
                </div>
              ))}
              {(change.newContent.split('\n').length > 20) && (
                <div className="px-2 text-td-muted">... {change.newContent.split('\n').length - 20} more lines</div>
              )}
            </div>
          ) : (
            <pre className="text-[10px] text-td-muted font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {JSON.stringify(change.tool.tool_input, null, 2).slice(0, 500)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalWidget({ denials, onApprove, onApproveAll, onReject }: ApprovalWidgetProps) {
  const [changes, setChanges] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(true)
  const [allDecided, setAllDecided] = useState(false)
  const approved = new Set<string>()
  const rejected = new Set<string>()

  useEffect(() => {
    if (denials.length === 0) return
    setLoading(true)

    const load = async () => {
      const results: FileChange[] = []
      for (const d of denials) {
        const input = d.tool_input
        if (d.tool_name === 'Write' && typeof input.file_path === 'string') {
          const existing = await window.api.readFileContent(input.file_path)
          results.push({
            tool: d, filePath: input.file_path, action: 'write',
            newContent: String(input.content || ''),
            oldContent: existing.exists ? existing.content : undefined,
          })
        } else if (d.tool_name === 'Edit' && typeof input.file_path === 'string') {
          results.push({
            tool: d, filePath: input.file_path, action: 'edit',
            oldString: typeof input.old_string === 'string' ? input.old_string : undefined,
            newString: typeof input.new_string === 'string' ? input.new_string : undefined,
          })
        } else {
          results.push({
            tool: d, filePath: String(input.command || input.file_path || d.tool_name),
            action: 'other',
          })
        }
      }
      setChanges(results)
      setLoading(false)
    }
    load()
  }, [denials])

  const handleApproveOne = (toolUseId: string) => {
    approved.add(toolUseId)
    checkAllDecided()
  }

  const handleRejectOne = (toolUseId: string) => {
    rejected.add(toolUseId)
    checkAllDecided()
  }

  const checkAllDecided = () => {
    if (approved.size + rejected.size >= denials.length) {
      setAllDecided(true)
      const approvedTools = denials.filter(d => approved.has(d.tool_use_id))
      if (approvedTools.length > 0) {
        onApprove(approvedTools)
      } else {
        onReject()
      }
    }
  }

  const handleAllowAll = () => {
    const all = denials.map(d => d)
    setAllDecided(true)
    onApprove(all)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-td-muted py-2">
        <Shield className="h-3.5 w-3.5 text-amber-400" />
        Loading permission requests...
      </div>
    )
  }

  return (
    <div className="space-y-2 my-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs text-td-text font-medium">
          Claude wants to use {denials.length} tool{denials.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tool cards */}
      <div className="space-y-1.5">
        {changes.map((change) => (
          <ToolApprovalCard
            key={change.tool.tool_use_id}
            change={change}
            onApprove={() => handleApproveOne(change.tool.tool_use_id)}
            onReject={() => handleRejectOne(change.tool.tool_use_id)}
          />
        ))}
      </div>

      {/* Batch actions */}
      {!allDecided && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAllowAll}
            className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          >
            <Check className="h-3 w-3 mr-1.5" />
            Allow all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onApproveAll}
            className="h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
          >
            <ShieldCheck className="h-3 w-3 mr-1.5" />
            Allow for session
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReject}
            className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <X className="h-3 w-3 mr-1.5" />
            Reject all
          </Button>
        </div>
      )}
    </div>
  )
}

export default ApprovalWidget
