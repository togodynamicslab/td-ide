import { useEffect, useRef } from 'react'
import { Code2, Loader2, Map, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Markdown, Reasoning } from './ai-elements'
import ToolSummary from './ToolSummary'
import type { Message, PermissionMode } from '../App'

interface ChatAreaProps {
  messages: Message[]
  isLoading: boolean
  permissionMode: PermissionMode
}

function ChatArea({ messages, isLoading, permissionMode }: ChatAreaProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSnapshotRef = useRef('')
  const prevMsgCount = useRef(0)

  // Scroll to bottom on initial load (messages populated from DB)
  useEffect(() => {
    if (messages.length > 0 && prevMsgCount.current === 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    prevMsgCount.current = messages.length
  }, [messages.length])

  // Scroll to bottom during streaming (content changes)
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    const snapshot =
      (lastMsg?.content || '') +
      String(lastMsg?.tools?.length || 0) +
      (lastMsg?.reasoning || '')

    if (snapshot !== lastSnapshotRef.current) {
      lastSnapshotRef.current = snapshot
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
  })

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    const seconds = ms / 1000
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-td-muted">
        <div className="text-center">
          {permissionMode === 'plan' ? (
            <Map className="h-12 w-12 mx-auto mb-4 text-blue-400/20" />
          ) : (
            <Code2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
          )}
          <p className="text-lg">
            {permissionMode === 'plan' ? 'Plan mode' : 'Start a conversation'}
          </p>
          <p className="text-sm mt-1 text-td-muted">
            {permissionMode === 'plan'
              ? 'Claude will analyze and plan without making changes'
              : 'Ask anything or describe what you want to build'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1
            const hasTools = msg.tools && msg.tools.length > 0
            const hasContent = msg.content && msg.content.length > 0
            const hasReasoning = msg.reasoning && msg.reasoning.length > 0
            const isAssistantLoading = isLoading && isLast && msg.role === 'assistant'
            const isReasoningStreaming = isAssistantLoading && hasReasoning && !hasContent

            return (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-3',
                    msg.role === 'user'
                      ? 'bg-td-bubble text-td-text max-w-[85%]'
                      : 'text-td-text-secondary w-full max-w-[85%]'
                  )}
                >
                  {/* Reasoning/thinking block */}
                  {hasReasoning && msg.role === 'assistant' && (
                    <div className={cn(hasContent && 'mb-3')}>
                      <Reasoning
                        content={msg.reasoning}
                        isStreaming={isReasoningStreaming}
                      />
                    </div>
                  )}

                  {/* User image attachments */}
                  {msg.images && msg.images.length > 0 && (
                    <div className={cn('flex flex-wrap gap-2', hasContent && 'mb-2')}>
                      {msg.images.map((img) => (
                        <img
                          key={img.id}
                          src={img.dataUrl}
                          alt={img.name}
                          className="max-h-48 rounded-lg border border-td-border object-contain"
                        />
                      ))}
                    </div>
                  )}

                  {/* Text content — markdown for assistant, plain for user */}
                  {hasContent && (
                    msg.role === 'assistant' ? (
                      <Markdown content={msg.content} />
                    ) : (
                      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    )
                  )}

                  {/* Tool summary */}
                  {hasTools && (
                    <div className={cn((hasContent || hasReasoning) && 'mt-3')}>
                      <ToolSummary tools={msg.tools} isActive={isAssistantLoading} />
                    </div>
                  )}

                  {/* Loading indicator */}
                  {isAssistantLoading && !hasContent && !isReasoningStreaming && !hasTools && (
                    <div className="flex items-center gap-2 text-sm text-td-muted py-2">
                      <Loader2 className={cn(
                        'h-4 w-4 animate-spin',
                        permissionMode === 'plan' ? 'text-blue-400'
                          : permissionMode === 'full' ? 'text-emerald-400'
                          : 'text-td-accent'
                      )} />
                      <span className="animate-pulse">
                        {permissionMode === 'plan' ? 'Claude is planning...' : 'Claude is thinking...'}
                      </span>
                    </div>
                  )}
                  {isAssistantLoading && !hasContent && hasTools && (
                    <div className="flex items-center gap-2 text-sm text-td-muted py-1 mt-2">
                      <Loader2 className={cn(
                        'h-3 w-3 animate-spin',
                        permissionMode === 'plan' ? 'text-blue-400'
                          : permissionMode === 'full' ? 'text-emerald-400'
                          : 'text-td-accent'
                      )} />
                      <span>{permissionMode === 'plan' ? 'Analyzing...' : 'Working...'}</span>
                    </div>
                  )}

                  {/* Completion indicator */}
                  {msg.role === 'assistant' && msg.duration != null && !isAssistantLoading && (
                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-td-border/50">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      <span className="text-[11px] text-td-muted">
                        Completed in {formatDuration(msg.duration)}
                      </span>
                    </div>
                  )}

                  <div className={cn(
                    'text-[10px] mt-1.5',
                    msg.role === 'user' ? 'text-right text-td-text-faint' : 'text-td-text-faint'
                  )}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ChatArea
