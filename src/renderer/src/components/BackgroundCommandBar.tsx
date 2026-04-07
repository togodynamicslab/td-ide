import { useEffect, useRef, useState } from 'react'
import { Terminal, ChevronDown, ChevronUp, X, Circle, Bot } from 'lucide-react'

export interface BackgroundSession {
  id: string            // tool call ID
  command: string       // the bash command or agent description
  description?: string  // optional description from the tool call
  output: string        // streamed output text
  status: 'running' | 'completed' | 'error'
  conversationId: string
  kind: 'bash' | 'agent'
}

interface BackgroundCommandBarProps {
  session: BackgroundSession
  onClose: (id: string) => void
}

export default function BackgroundCommandBar({ session, onClose }: BackgroundCommandBarProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const outputRef = useRef<HTMLPreElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll to bottom when output updates
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [session.output, autoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!outputRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 20)
  }

  const statusColor = session.status === 'running'
    ? 'text-yellow-400'
    : session.status === 'completed'
      ? 'text-emerald-400'
      : 'text-red-400'

  const statusLabel = session.status === 'running'
    ? 'running'
    : session.status === 'completed'
      ? 'done'
      : 'error'

  const Icon = session.kind === 'agent' ? Bot : Terminal

  return (
    <div
      className="border-b border-td-border/30 bg-td-bg"
      data-terminal="background-command"
    >
      {/* Header — matches ShellSessionBar layout */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
          <span className="text-xs font-mono text-td-text truncate">
            {session.description || session.command}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
            session.status === 'running'
              ? 'bg-yellow-500/15 text-yellow-400'
              : session.status === 'completed'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
          }`}>
            {session.status === 'running' && <Circle className="h-2 w-2 fill-current animate-pulse" />}
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-td-hover text-td-muted hover:text-td-text transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => onClose(session.id)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-td-hover text-td-muted hover:text-td-text transition-colors"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Output body */}
      <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[200px]' : 'max-h-0'}`}>
        <pre
          ref={outputRef}
          onScroll={handleScroll}
          className="w-full overflow-y-auto text-[11px] font-mono leading-relaxed text-td-text-secondary px-3 py-1.5 whitespace-pre-wrap break-words"
          style={{ maxHeight: '200px' }}
        >
          {session.output || (session.status === 'running' ? 'Waiting for output...' : '')}
        </pre>
      </div>
    </div>
  )
}
