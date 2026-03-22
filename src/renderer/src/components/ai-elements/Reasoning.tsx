import { useState, useEffect, useRef } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
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

  const lineCount = content.split('\n').length
  const wordCount = content.split(/\s+/).filter(Boolean).length

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-3 rounded-md border border-td-border bg-td-bg hover:bg-td-hover transition-colors group text-xs">
        <ChevronRight
          className={cn(
            'h-3 w-3 text-td-muted transition-transform duration-200',
            open && 'rotate-90'
          )}
        />
        <Brain className={cn(
          'h-3.5 w-3.5 shrink-0',
          isStreaming ? 'text-purple-400 animate-pulse' : 'text-purple-400/60'
        )} />
        <span className="text-td-text-tertiary font-medium">
          {isStreaming ? `${thinkingVerb || 'Thinking'}...` : 'Thought'}
        </span>
        {!isStreaming && (
          <span className="text-td-muted">
            {wordCount} words
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-5 px-3 py-2 rounded-md bg-td-bg border border-td-border text-xs text-td-text-tertiary leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
