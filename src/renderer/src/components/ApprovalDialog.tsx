import { useState, useEffect, useCallback } from 'react'
import { Check, X, FileCode, FilePlus, FileEdit, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import type { DeniedTool } from '../App'

interface FileChange {
  tool: DeniedTool
  filePath: string
  action: 'write' | 'edit'
  newContent?: string
  oldContent?: string
  oldString?: string
  newString?: string
  approved: boolean
}

interface ApprovalDialogProps {
  open: boolean
  denials: DeniedTool[]
  onApprove: (approved: DeniedTool[], rejected: DeniedTool[]) => void
  onRejectAll: () => void
}

function computeDiffLines(oldText: string, newText: string): { type: 'same' | 'add' | 'remove'; text: string }[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: { type: 'same' | 'add' | 'remove'; text: string }[] = []

  // Simple line-by-line diff (not optimal but clear)
  let oi = 0, ni = 0
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', text: oldLines[oi] })
      oi++; ni++
    } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.slice(oi).includes(newLines[ni]))) {
      result.push({ type: 'add', text: newLines[ni] })
      ni++
    } else if (oi < oldLines.length) {
      result.push({ type: 'remove', text: oldLines[oi] })
      oi++
    }
  }
  return result
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const lines = computeDiffLines(oldContent, newContent)
  const changedLines = lines.filter(l => l.type !== 'same')

  if (changedLines.length === 0) {
    return <div className="text-xs text-td-muted px-3 py-2">No changes detected</div>
  }

  return (
    <div className="max-h-64 overflow-y-auto text-[11px] font-mono leading-5">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'px-3 whitespace-pre-wrap break-all',
            line.type === 'add' && 'bg-emerald-500/10 text-emerald-300',
            line.type === 'remove' && 'bg-red-500/10 text-red-300',
            line.type === 'same' && 'text-td-muted/60'
          )}
        >
          <span className="inline-block w-4 text-right mr-2 opacity-40 select-none">
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          {line.text || '\u00A0'}
        </div>
      ))}
    </div>
  )
}

function EditDiffView({ oldString, newString }: { oldString: string; newString: string }) {
  return (
    <div className="max-h-64 overflow-y-auto text-[11px] font-mono leading-5">
      {oldString.split('\n').map((line, i) => (
        <div key={`r-${i}`} className="px-3 whitespace-pre-wrap break-all bg-red-500/10 text-red-300">
          <span className="inline-block w-4 text-right mr-2 opacity-40 select-none">-</span>
          {line || '\u00A0'}
        </div>
      ))}
      {newString.split('\n').map((line, i) => (
        <div key={`a-${i}`} className="px-3 whitespace-pre-wrap break-all bg-emerald-500/10 text-emerald-300">
          <span className="inline-block w-4 text-right mr-2 opacity-40 select-none">+</span>
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  )
}

function FileChangeCard({ change, onToggle }: { change: FileChange; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const fileName = change.filePath.split('/').pop() || change.filePath
  const dirPath = change.filePath.split('/').slice(0, -1).join('/')

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      change.approved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-td-border bg-td-bg'
    )}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-td-muted hover:text-td-text">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {change.action === 'write'
          ? <FilePlus className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          : <FileEdit className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-td-text">{fileName}</span>
          {dirPath && <span className="text-[10px] text-td-muted ml-1.5 truncate">{dirPath}</span>}
        </div>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-medium',
          change.action === 'write' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
        )}>
          {change.action === 'write' ? 'Create' : 'Edit'}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'h-6 w-6 rounded-md flex items-center justify-center transition-all',
            change.approved
              ? 'bg-emerald-500 text-white'
              : 'bg-td-surface border border-td-border text-td-muted hover:border-td-muted'
          )}
        >
          {change.approved && <Check className="h-3 w-3" />}
        </button>
      </div>

      {/* Diff */}
      {expanded && (
        <div className="border-t border-td-border/50">
          {change.action === 'edit' && change.oldString != null && change.newString != null ? (
            <EditDiffView oldString={change.oldString} newString={change.newString} />
          ) : change.oldContent != null && change.newContent != null ? (
            <DiffView oldContent={change.oldContent} newContent={change.newContent} />
          ) : change.newContent != null ? (
            <div className="max-h-64 overflow-y-auto text-[11px] font-mono leading-5">
              {change.newContent.split('\n').map((line, i) => (
                <div key={i} className="px-3 whitespace-pre-wrap break-all bg-emerald-500/10 text-emerald-300">
                  <span className="inline-block w-4 text-right mr-2 opacity-40 select-none">+</span>
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-td-muted">
              <FileCode className="h-3.5 w-3.5 inline mr-1.5" />
              {JSON.stringify(change.tool.tool_input, null, 2).slice(0, 500)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalDialog({ open, denials, onApprove, onRejectAll }: ApprovalDialogProps) {
  const [changes, setChanges] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || denials.length === 0) return
    setLoading(true)

    const loadChanges = async () => {
      const results = await Promise.all(denials.map(async (d): Promise<FileChange> => {
        const input = d.tool_input
        if (d.tool_name === 'Write' && typeof input.file_path === 'string') {
          const existing = await window.api.readFileContent(input.file_path)
          return {
            tool: d,
            filePath: input.file_path,
            action: 'write',
            newContent: String(input.content || ''),
            oldContent: existing.exists ? existing.content : undefined,
            approved: true
          }
        } else if (d.tool_name === 'Edit' && typeof input.file_path === 'string') {
          return {
            tool: d,
            filePath: input.file_path,
            action: 'edit',
            oldString: typeof input.old_string === 'string' ? input.old_string : undefined,
            newString: typeof input.new_string === 'string' ? input.new_string : undefined,
            approved: true
          }
        }
        return {
          tool: d,
          filePath: d.tool_name,
          action: 'write',
          approved: true
        }
      }))
      setChanges(results)
      setLoading(false)
    }
    loadChanges()
  }, [open, denials])

  const toggleChange = useCallback((idx: number) => {
    setChanges(prev => prev.map((c, i) => i === idx ? { ...c, approved: !c.approved } : c))
  }, [])

  const approvedCount = changes.filter(c => c.approved).length

  const handleApprove = () => {
    const approved = changes.filter(c => c.approved).map(c => c.tool)
    const rejected = changes.filter(c => !c.approved).map(c => c.tool)
    onApprove(approved, rejected)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onRejectAll() }}>
      <DialogContent className="sm:max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />
          </div>
          <div>
            <DialogTitle className="text-base">Review proposed changes</DialogTitle>
            <DialogDescription className="text-xs text-td-muted mt-0.5">
              Claude wants to modify {denials.length} file{denials.length !== 1 ? 's' : ''}. Review and approve each change.
            </DialogDescription>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-td-muted">Loading diffs...</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {changes.map((change, i) => (
              <FileChangeCard key={i} change={change} onToggle={() => toggleChange(i)} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-td-border">
          <div className="text-xs text-td-muted">
            {approvedCount} of {changes.length} approved
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onRejectAll} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <X className="h-3.5 w-3.5 mr-1.5" />
              Reject All
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={approvedCount === 0}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Apply {approvedCount > 0 ? `(${approvedCount})` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ApprovalDialog
