import { useEffect, useRef } from 'react'
import { Code2, Loader2, Map, CheckCircle2, AlertTriangle, X, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Markdown, Reasoning } from './ai-elements'
import InlineToolCall from './InlineToolCall'
import { useThinkingVerb } from '../hooks/useThinkingVerb'
import type { Message, ContentBlock, PermissionMode } from '../App'

interface ChatAreaProps {
  messages: Message[]
  isLoading: boolean
  permissionMode: PermissionMode
  contentFontSize?: number
}

/** Build display blocks from message, with legacy fallback */
function getDisplayBlocks(msg: Message): ContentBlock[] {
  if (msg.contentBlocks && msg.contentBlocks.length > 0) return msg.contentBlocks
  // Legacy: reconstruct from flat fields
  const blocks: ContentBlock[] = []
  if (msg.reasoning) blocks.push({ type: 'thinking', thinking: msg.reasoning })
  if (msg.content) blocks.push({ type: 'text', text: msg.content })
  for (const tool of msg.tools) blocks.push({ type: 'tool_use', tool })
  return blocks
}

function ChatArea({ messages, isLoading, permissionMode, contentFontSize = 14 }: ChatAreaProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSnapshotRef = useRef('')
  const prevMsgCount = useRef(0)
  const thinkingVerb = useThinkingVerb(isLoading)

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
      (lastMsg?.reasoning || '') +
      String(lastMsg?.contentBlocks?.length || 0)

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
            const isAssistantLoading = isLoading && isLast && msg.role === 'assistant'

            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-td-bubble text-td-text max-w-[85%] rounded-lg px-4 py-3">
                    {/* User image attachments */}
                    {msg.images && msg.images.length > 0 && (
                      <div className={cn('flex flex-wrap gap-2', msg.content && 'mb-2')}>
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
                    {msg.content && (
                      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    )}
                    <div className="text-[10px] mt-1.5 text-right text-td-text-faint">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              )
            }

            // --- Assistant message: render content blocks chronologically ---
            const blocks = getDisplayBlocks(msg)
            const hasAnyContent = blocks.length > 0
            const lastBlock = blocks[blocks.length - 1]
            const isLastBlockThinking = lastBlock?.type === 'thinking'

            return (
              <div key={msg.id} className="flex justify-start">
                <div className="text-td-text-secondary w-full max-w-[85%] rounded-lg px-4 py-3">
                  {/* Render blocks in chronological order */}
                  {blocks.length > 0 && (
                    <div className="space-y-2">
                      {blocks.map((block, blockIdx) => {
                        const isLastBlock = blockIdx === blocks.length - 1

                        switch (block.type) {
                          case 'thinking':
                            return (
                              <Reasoning
                                key={blockIdx}
                                content={block.thinking}
                                isStreaming={isAssistantLoading && isLastBlock}
                                thinkingVerb={thinkingVerb}
                              />
                            )
                          case 'text':
                            return (
                              <Markdown key={blockIdx} content={block.text} fontSize={contentFontSize} />
                            )
                          case 'tool_use':
                            return (
                              <InlineToolCall
                                key={block.tool.id}
                                tool={block.tool}
                                isActive={isAssistantLoading && isLastBlock}
                              />
                            )
                          default:
                            return null
                        }
                      })}
                    </div>
                  )}

                  {/* Loading indicator — only when no blocks at all yet */}
                  {isAssistantLoading && !hasAnyContent && (
                    <div className="flex items-center gap-2 text-sm text-td-muted py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#D97757]" />
                      <span className="animate-pulse">
                        {thinkingVerb}...
                      </span>
                    </div>
                  )}

                  {/* Working indicator — has tool blocks but no text yet */}
                  {isAssistantLoading && hasAnyContent && !isLastBlockThinking && lastBlock?.type === 'tool_use' && (
                    <div className="flex items-center gap-2 text-sm text-td-muted py-1 mt-1">
                      <Loader2 className="h-3 w-3 animate-spin text-[#D97757]" />
                      <span>{thinkingVerb}...</span>
                    </div>
                  )}

                  {/* Completion indicator */}
                  {msg.duration != null && !isAssistantLoading && (
                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-td-border/50">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      <span className="text-[11px] text-td-muted">
                        Completed in {formatDuration(msg.duration)}
                      </span>
                    </div>
                  )}

                  <div className="text-[10px] mt-1.5 text-td-text-faint">
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Approval widget lives above InputBar — see App.tsx */}
        </div>
      </div>
    </div>
  )
}

export default ChatArea
