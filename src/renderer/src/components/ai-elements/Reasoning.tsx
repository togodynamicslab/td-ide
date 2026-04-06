import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReasoningProps {
  content: string
  isStreaming?: boolean
  thinkingVerb?: string
  verbCycleKey?: number
  className?: string
}

export default function Reasoning({
  content,
  isStreaming = false,
  thinkingVerb,
  verbCycleKey,
  className
}: ReasoningProps): JSX.Element {
  const [open, setOpen] = useState(isStreaming)
  const wasStreamingRef = useRef(isStreaming)

  // Auto-open when streaming starts, stay open while thinking
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      setOpen(true)
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
          'hover:bg-td-hover/50'
        )}
      >
        {isStreaming ? (
          <div className="thinking-orb" />
        ) : (
          <ChevronRight className={cn(
            'h-3 w-3 shrink-0 text-td-muted transition-transform duration-200',
            open && 'rotate-90'
          )} />
        )}
        <span
          key={isStreaming ? verbCycleKey : 'done'}
          className={cn(
            'font-medium',
            isStreaming ? 'text-td-text-secondary blur-transition' : 'text-td-text-tertiary'
          )}
        >
          {isStreaming ? `${thinkingVerb || 'Thinking'}...` : 'Thought'}
        </span>
        {!isStreaming && (
          <span className="text-td-muted">{wordCount} words</span>
        )}
      </button>

      {/* Collapsible content — no border/box, just indented text */}
      {open && (
        <div className={cn(
          'mt-1 pl-6 pr-1 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto',
          isStreaming ? 'thinking-shimmer' : 'text-td-text-tertiary/80'
        )}>
          {content}
        </div>
      )}
    </div>
  )
}
