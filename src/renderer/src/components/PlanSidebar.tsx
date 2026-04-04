import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Map as MapIcon, Pencil, Eye, Play, X, Copy, Check, Circle, Loader2, CheckCircle2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from './ui/button'
import { Markdown } from './ai-elements'
import { cn } from '@/lib/utils'
import type { PlanEntry, PlanEntryStatus } from '../App'

interface PlanSidebarProps {
  planContent: string
  planEntries: PlanEntry[]
  onPlanChange: (content: string) => void
  onExecutePlan: (plan: string) => void
  onClose: () => void
  isStreaming: boolean
  pendingApproval?: { requestId: string; conversationId: string } | null
  onApprovePlan?: () => void
  onRejectPlan?: () => void
}

const STATUS_CONFIG: Record<PlanEntryStatus, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-td-muted', label: 'Pending' },
  in_progress: { icon: Loader2, color: 'text-blue-400', label: 'In progress' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Completed' }
}

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-500/15 text-red-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  low: 'bg-td-muted/15 text-td-muted'
}

function PlanEntryRow({ entry }: { entry: PlanEntry }): JSX.Element {
  const config = STATUS_CONFIG[entry.status]
  const Icon = config.icon

  return (
    <div className={cn(
      'flex items-start gap-2.5 px-4 py-2 border-b border-td-border/50 last:border-b-0',
      entry.status === 'completed' && 'opacity-60'
    )}>
      <Icon className={cn(
        'h-4 w-4 mt-0.5 shrink-0',
        config.color,
        entry.status === 'in_progress' && 'animate-spin'
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm text-td-text leading-snug',
          entry.status === 'completed' && 'line-through'
        )}>
          {entry.content}
        </p>
      </div>
      {entry.priority !== 'medium' && (
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded shrink-0',
          PRIORITY_BADGE[entry.priority]
        )}>
          {entry.priority}
        </span>
      )}
    </div>
  )
}

function PlanSidebar({ planContent, planEntries, onPlanChange, onExecutePlan, onClose, isStreaming, pendingApproval, onApprovePlan, onRejectPlan }: PlanSidebarProps): JSX.Element {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [copied, setCopied] = useState(false)
  const [width, setWidth] = useState(420)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    startX.current = e.clientX
    startWidth.current = width

    const onMove = (ev: PointerEvent) => {
      const delta = startX.current - ev.clientX
      setWidth(Math.min(Math.max(startWidth.current + delta, 320), 800))
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [width])

  const hasEntries = planEntries.length > 0
  const { completedCount, totalCount } = useMemo(() => ({
    completedCount: planEntries.filter(e => e.status === 'completed').length,
    totalCount: planEntries.length
  }), [planEntries])

  // Auto-resize textarea
  useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [planContent, mode])

  // Switch to preview when streaming starts
  useEffect(() => {
    if (isStreaming) setMode('preview')
  }, [isStreaming])

  const handleCopy = () => {
    const text = hasEntries
      ? planEntries.map(e => `- [${e.status}] ${e.content}`).join('\n')
      : planContent
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecute = () => {
    const text = hasEntries
      ? planEntries.map(e => `- ${e.content}`).join('\n')
      : planContent
    if (text.trim()) {
      onExecutePlan(text)
    }
  }

  return (
    <div className="relative h-full border-l border-td-border bg-td-bg flex flex-col shrink-0" style={{ width }}>
      {/* Resize handle */}
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize z-20 hover:bg-td-accent/50 transition-colors"
      />
      <div className="flex items-center justify-between px-4 py-2 border-b border-td-border">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-td-text">Plan</span>
          {isStreaming && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 animate-pulse">
              streaming...
            </span>
          )}
          {pendingApproval && !isStreaming && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              awaiting approval
            </span>
          )}
          {hasEntries && !isStreaming && !pendingApproval && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-td-muted/15 text-td-muted">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Toggle edit/preview — only show for text mode */}
          {!hasEntries && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7', mode === 'preview' ? 'text-td-muted' : 'text-blue-400')}
              onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}
              disabled={isStreaming}
            >
              {mode === 'preview' ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          )}
          {/* Copy */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-td-muted" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {/* Close */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-td-muted" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={cn('overflow-y-auto', mode === 'edit' ? 'flex-1' : 'min-h-0')}>
        {!planContent && !hasEntries && !isStreaming ? (
          <div className="flex items-center justify-center h-full text-td-muted">
            <div className="text-center px-6">
              <MapIcon className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No plan yet</p>
              <p className="text-xs mt-1">Switch to plan mode and ask Claude to create a plan</p>
            </div>
          </div>
        ) : hasEntries ? (
          <div className="py-1">
            {planEntries.map((entry, i) => (
              <PlanEntryRow key={`${entry.status}-${entry.content}`} entry={entry} />
            ))}
          </div>
        ) : mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={planContent}
            onChange={(e) => onPlanChange(e.target.value)}
            className="w-full h-full bg-transparent px-4 py-3 text-sm text-td-text font-mono resize-none outline-none leading-relaxed"
            placeholder="Edit the plan..."
          />
        ) : (
          <div className="px-4 py-3">
            <Markdown content={planContent} />
          </div>
        )}
      </div>

      {/* Footer — approve/reject shown immediately when pending, execute only after streaming */}
      {(planContent.trim() || hasEntries) && (pendingApproval || !isStreaming) && (
        <div className="border-t border-td-border px-4 py-2.5">
          {pendingApproval ? (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={onRejectPlan}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 gap-2 text-td-muted hover:text-td-text"
                  onClick={() => setMode('edit')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={onApprovePlan}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="w-full gap-2 bg-blue-600 hover:bg-blue-500 text-white"
                onClick={handleExecute}
              >
                <Play className="h-3.5 w-3.5" />
                Execute Plan
              </Button>
              <p className="text-[10px] text-td-muted text-center mt-1.5">
                Sends this plan to Claude in full access mode
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default PlanSidebar
