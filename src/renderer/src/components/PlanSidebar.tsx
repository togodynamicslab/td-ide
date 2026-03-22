import { useState, useRef, useEffect } from 'react'
import { Map as MapIcon, Pencil, Eye, Play, X, Copy, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Markdown } from './ai-elements'
import { cn } from '@/lib/utils'

interface PlanSidebarProps {
  planContent: string
  onPlanChange: (content: string) => void
  onExecutePlan: (plan: string) => void
  onClose: () => void
  isStreaming: boolean
}

function PlanSidebar({ planContent, onPlanChange, onExecutePlan, onClose, isStreaming }: PlanSidebarProps): JSX.Element {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    navigator.clipboard.writeText(planContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecute = () => {
    if (planContent.trim()) {
      onExecutePlan(planContent)
    }
  }

  return (
    <div className="w-[420px] min-w-[320px] max-w-[600px] border-l border-td-border bg-td-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-td-border">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-td-text">Plan</span>
          {isStreaming && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 animate-pulse">
              streaming...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Toggle edit/preview */}
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', mode === 'preview' ? 'text-td-muted' : 'text-blue-400')}
            onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}
            disabled={isStreaming}
          >
            {mode === 'preview' ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
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
      <div className="flex-1 overflow-y-auto">
        {!planContent && !isStreaming ? (
          <div className="flex items-center justify-center h-full text-td-muted">
            <div className="text-center px-6">
              <MapIcon className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No plan yet</p>
              <p className="text-xs mt-1">Switch to plan mode and ask Claude to create a plan</p>
            </div>
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

      {/* Footer — execute action */}
      {planContent.trim() && !isStreaming && (
        <div className="border-t border-td-border px-4 py-2.5">
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
        </div>
      )}
    </div>
  )
}

export default PlanSidebar
