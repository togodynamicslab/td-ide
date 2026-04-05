import { useState, useEffect } from 'react'
import { Cpu, ArrowRight, X, MessageSquare } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'

interface ActiveSession {
  conversationId: string
  sessionId: string
}

interface MemoryInfo {
  main: { rss: number; heapUsed: number; heapTotal: number }
  agent: { pid: number | null; rss: number; sessions: number }
  activeSessions: ActiveSession[]
}

interface MemoryIndicatorProps {
  conversationTitles?: Map<string, string>
  onNavigateToConversation?: (conversationId: string) => void
  onKillSession?: (conversationId: string) => void
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

function MemoryIndicator({ conversationTitles, onNavigateToConversation, onKillSession }: MemoryIndicatorProps): JSX.Element | null {
  const [memory, setMemory] = useState<MemoryInfo | null>(null)

  useEffect(() => {
    const poll = (): void => {
      window.api.getMemoryUsage().then(setMemory).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!memory) return null

  const total = memory.main.rss + memory.agent.rss

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-2 py-1 text-[11px] text-td-muted cursor-default hover:text-td-text transition-colors w-full rounded-md hover:bg-td-hover group-data-[collapsible=icon]:justify-center">
          <Cpu className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {formatMB(total)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-td-border">
          <div className="text-xs font-medium text-td-text">System Resources</div>
        </div>

        <div className="px-3 py-2 space-y-1 text-xs border-b border-td-border">
          <div className="flex justify-between">
            <span className="text-td-muted">App</span>
            <span className="text-td-text">{formatMB(memory.main.rss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-td-muted">Heap</span>
            <span className="text-td-text">{formatMB(memory.main.heapUsed)} / {formatMB(memory.main.heapTotal)}</span>
          </div>
          {memory.agent.pid && (
            <div className="flex justify-between">
              <span className="text-td-muted">Agent (PID {memory.agent.pid})</span>
              <span className="text-td-text">{formatMB(memory.agent.rss)}</span>
            </div>
          )}
        </div>

        <div className="px-3 py-2">
          <div className="text-xs font-medium text-td-text mb-2">
            Active Sessions ({memory.activeSessions.length})
          </div>
          {memory.activeSessions.length === 0 ? (
            <div className="text-xs text-td-muted py-1">No active sessions</div>
          ) : (
            <div className="space-y-2">
              {memory.activeSessions.map((session) => {
                const title = conversationTitles?.get(session.conversationId) || 'Untitled'
                const perSessionMem = memory.activeSessions.length > 0
                  ? memory.agent.rss / memory.activeSessions.length
                  : 0
                return (
                  <div key={session.conversationId} className="flex items-center gap-1.5 group/session">
                    <MessageSquare className="h-3 w-3 text-td-muted shrink-0" />
                    <span className="text-xs text-td-text truncate flex-1">{title}</span>
                    <span className="text-[10px] text-td-muted shrink-0">~{formatMB(perSessionMem)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover/session:opacity-100 transition-opacity text-td-muted hover:text-td-text"
                      onClick={() => onNavigateToConversation?.(session.conversationId)}
                      title="Go to conversation"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover/session:opacity-100 transition-opacity text-td-muted hover:text-red-400"
                      onClick={() => onKillSession?.(session.conversationId)}
                      title="Kill session"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default MemoryIndicator
