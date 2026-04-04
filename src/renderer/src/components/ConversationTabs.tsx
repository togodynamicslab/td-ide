import { useRef, useEffect, useState } from 'react'
import {
  X, MessageSquare, Loader2, GitFork, AlertTriangle,
  CheckCircle2, Pencil, Archive, Trash2
} from 'lucide-react'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator
} from './ui/context-menu'
import type { Conversation } from '../App'

function AnimatedTabAccent({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-td-accent overflow-hidden">
      {isLoading && <div className="absolute inset-0 tab-shimmer-active" />}
    </div>
  )
}

interface ConversationTabsProps {
  conversations: Conversation[]
  activeConversationId: string | null
  loadingConversations: Set<string>
  interruptedConversations?: Set<string>
  recentlyRetitled?: Set<string>
  queuedCounts: Map<string, number>
  onSelectConversation: (id: string) => void
  onArchiveConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
}

function ConversationTabs({
  conversations,
  activeConversationId,
  loadingConversations,
  interruptedConversations,
  recentlyRetitled,
  queuedCounts,
  onSelectConversation,
  onArchiveConversation,
  onRenameConversation,
  onDeleteConversation
}: ConversationTabsProps): JSX.Element | null {
  const activeRef = useRef<HTMLDivElement>(null)
  const [recentlyFinished, setRecentlyFinished] = useState<Set<string>>(new Set())
  const prevLoadingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const prev = prevLoadingRef.current
    const justFinished: string[] = []
    for (const id of Array.from(prev)) {
      if (!loadingConversations.has(id)) justFinished.push(id)
    }
    prevLoadingRef.current = new Set(loadingConversations)
    if (justFinished.length === 0) return
    setRecentlyFinished((s) => {
      const next = new Set(s)
      for (const id of justFinished) next.add(id)
      return next
    })
  }, [loadingConversations])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeConversationId])

  if (conversations.length === 0) return null

  return (
    <div className="flex items-stretch bg-td-surface/50 overflow-x-auto shrink-0 border-b border-td-border" role="tablist">
      {conversations.map((conv) => {
        const isActive = conv.id === activeConversationId
        const isLoading = loadingConversations.has(conv.id)
        const isInterrupted = interruptedConversations?.has(conv.id)
        const isDone = recentlyFinished.has(conv.id)
        const queued = queuedCounts.get(conv.id) ?? 0
        const isRetitled = recentlyRetitled?.has(conv.id)
        const needsAttention = (isLoading && queued > 0) || (isDone && !isActive) || (isInterrupted && !isActive) || isRetitled

        return (
          <ContextMenu key={conv.id}>
            <ContextMenuTrigger asChild>
              <div
                ref={isActive ? activeRef : undefined}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => {
                  onSelectConversation(conv.id)
                  if (isDone) setRecentlyFinished((s) => { const n = new Set(s); n.delete(conv.id); return n })
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectConversation(conv.id) }}
                className={`group relative flex items-center gap-2 h-[35px] w-[200px] px-3 text-xs shrink-0 cursor-pointer select-none border-r border-td-border/40 ${
                  isActive
                    ? 'bg-td-bg text-td-text'
                    : 'text-td-text-tertiary hover:bg-td-hover/50 hover:text-td-text-secondary'
                }`}
              >
                {isActive && <AnimatedTabAccent isLoading={isLoading} />}
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 text-td-accent animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : isInterrupted ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : conv.worktreePath ? (
                  <GitFork className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-td-muted" />
                )}
                <span className="truncate flex-1 min-w-0">{conv.title}</span>
                {/* Attention badge: queued messages, done, interrupted, or retitled */}
                {needsAttention && (
                  <span className={`shrink-0 h-4 min-w-[16px] px-1 rounded-full text-[9px] font-semibold inline-flex items-center justify-center ${
                    isLoading && queued > 0
                      ? 'bg-td-accent/20 text-td-accent'
                      : isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isInterrupted
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-[#D97757]/20 text-[#D97757]'
                  }`}>
                    {isLoading && queued > 0 ? `+${queued}` : isDone ? '!' : isInterrupted ? '!' : '*'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onArchiveConversation(conv.id) }}
                  className="shrink-0 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-td-hover transition-opacity"
                  aria-label={`Close ${conv.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => {
                const newTitle = window.prompt('Rename conversation', conv.title)
                if (newTitle?.trim()) onRenameConversation(conv.id, newTitle.trim())
              }}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onArchiveConversation(conv.id)}>
                <Archive className="h-3.5 w-3.5 mr-2" />
                Archive
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onDeleteConversation(conv.id)}
                className="text-red-400 focus:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </div>
  )
}

export default ConversationTabs
