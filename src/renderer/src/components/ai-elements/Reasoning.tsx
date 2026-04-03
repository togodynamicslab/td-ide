import { useState, useEffect, useRef } from 'react'
import { Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReasoningProps {
  content: string
  isStreaming?: boolean
  thinkingVerb?: string
  className?: string
}

export default function Reasoning({
  content,
  isStreaming = false,
  thinkingVerb,
  className
}: ReasoningProps): JSX.Element {
  const [open, setOpen] = useState(isStreaming)
  const wasStreamingRef = useRef(isStreaming)

  // Auto-open when streaming starts, auto-close when it ends
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      setOpen(true)
    } else if (!isStreaming && wasStreamingRef.current) {
      setOpen(false)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  const wordCount = content.split(/\s+/).filter(Boolean).length

  return (
    <div className={cn('relative', className)}>
      {/* Clickable title bar */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 text-xs py-1.5 px-0.5 w-full text-left transition-colors rounded',
          'hover:bg-td-hover/50',
          isStreaming && 'shimmer-thinking'
        )}
      >
        <Brain className={cn(
          'h-3.5 w-3.5 shrink-0',
          isStreaming ? 'text-purple-400' : 'text-purple-400/50'
        )} />
        <span className={cn(
          'font-medium',
          isStreaming ? 'text-td-text-secondary' : 'text-td-text-tertiary'
        )}>
          {isStreaming ? `${thinkingVerb || 'Thinking'}...` : 'Thought'}
        </span>
        {!isStreaming && (
          <span className="text-td-muted">{wordCount} words</span>
        )}
      </button>

      {/* Collapsible content — no border/box, just indented text */}
      {open && (
        <div className="mt-1 pl-6 pr-1 text-xs text-td-text-tertiary/80 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}
