import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot, Compass, Map, Sparkles, Zap,
  ChevronDown, ChevronUp, X, Circle, CheckCircle2, XCircle,
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──

export interface AgentTask {
  id: string
  description: string
  subagentType: string // 'Explore' | 'Plan' | 'general-purpose' | custom
  model?: string
  status: 'running' | 'completed' | 'error'
  output: string
  startedAt: number
  completedAt?: number
  conversationId: string
}

interface AgentOrchestrationPanelProps {
  tasks: AgentTask[]
  onDismiss: (id: string) => void
  onClearCompleted: () => void
}

// ── Subagent type metadata ──

interface SubagentMeta {
  icon: typeof Bot
  color: string
  bgColor: string
  label: string
}

const SUBAGENT_META: Record<string, SubagentMeta> = {
  Explore: {
    icon: Compass,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/10',
    label: 'Explore'
  },
  Plan: {
    icon: Map,
    color: 'text-violet-400',
    bgColor: 'bg-violet-400/10',
    label: 'Plan'
  },
  'general-purpose': {
    icon: Bot,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    label: 'Agent'
  }
}

function getSubagentMeta(type: string): SubagentMeta {
  return SUBAGENT_META[type] || {
    icon: Sparkles,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    label: type || 'Agent'
  }
}

// ── Elapsed time helper ──

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem > 0 ? `${min}m ${rem}s` : `${min}m`
  const hr = Math.floor(min / 60)
  return `${hr}h ${min % 60}m`
}

// ── Elapsed time ticker ──

function ElapsedTime({ startedAt, completedAt }: { startedAt: number; completedAt?: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (completedAt) return // no ticking needed
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [completedAt])

  const elapsed = (completedAt || now) - startedAt
  return (
    <span className="text-[10px] text-td-muted tabular-nums flex items-center gap-1">
      <Clock className="h-2.5 w-2.5" />
      {formatElapsed(elapsed)}
    </span>
  )
}

// ── Single agent row ──

function AgentRow({ task, onDismiss }: { task: AgentTask; onDismiss: (id: string) => void }) {
  const [showOutput, setShowOutput] = useState(false)
  const outputRef = useRef<HTMLPreElement>(null)
  const meta = getSubagentMeta(task.subagentType)
  const Icon = meta.icon

  const isRunning = task.status === 'running'
  const isError = task.status === 'error'
  const isDone = task.status === 'completed'

  // Auto-scroll output
  useEffect(() => {
    if (showOutput && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [task.output, showOutput])

  return (
    <div className={cn(
      'group/row rounded-lg border transition-all duration-200',
      isRunning
        ? 'border-td-border/60 bg-td-surface/50'
        : 'border-td-border/30 bg-td-bg'
    )}>
      {/* Row header */}
      <button
        type="button"
        onClick={() => setShowOutput(!showOutput)}
        className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg hover:bg-td-hover/30 transition-colors"
      >
        {/* Type icon */}
        <div className={cn('h-6 w-6 rounded-md flex items-center justify-center shrink-0', meta.bgColor)}>
          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-td-text truncate">{task.description}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Subagent type badge */}
            <span className={cn('text-[10px] font-medium', meta.color)}>
              {meta.label}
            </span>
            {/* Model badge */}
            {task.model && (
              <span className="text-[10px] text-td-muted px-1 py-0.5 rounded bg-td-surface">
                {task.model}
              </span>
            )}
          </div>
        </div>

        {/* Status + elapsed */}
        <div className="flex items-center gap-2 shrink-0">
          <ElapsedTime startedAt={task.startedAt} completedAt={task.completedAt} />
          {isRunning && (
            <div className="flex items-center gap-1">
              <Circle className="h-2 w-2 text-yellow-400 fill-yellow-400 animate-pulse" />
              <span className="text-[10px] text-yellow-400 font-medium">running</span>
            </div>
          )}
          {isDone && (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-medium">done</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-400" />
              <span className="text-[10px] text-red-400 font-medium">error</span>
            </div>
          )}
        </div>

        {/* Expand/collapse chevron */}
        <div className="shrink-0 text-td-muted">
          {showOutput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>

        {/* Dismiss button (only for completed/error) */}
        {!isRunning && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(task.id) }}
            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover/row:opacity-100 hover:bg-td-hover text-td-muted hover:text-td-text transition-all shrink-0"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {/* Expandable output */}
      <div className={cn(
        'overflow-hidden transition-all duration-200',
        showOutput ? 'max-h-[180px]' : 'max-h-0'
      )}>
        <div className="px-3 pb-2">
          <pre
            ref={outputRef}
            className="w-full overflow-y-auto text-[11px] font-mono leading-relaxed text-td-text-secondary px-2.5 py-2 rounded-md bg-td-bg border border-td-border/30 whitespace-pre-wrap break-words"
            style={{ maxHeight: '160px' }}
          >
            {task.output || (isRunning ? 'Waiting for output...' : 'No output')}
          </pre>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ──

export default function AgentOrchestrationPanel({ tasks, onDismiss, onClearCompleted }: AgentOrchestrationPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Auto-expand when new running tasks appear
  const prevRunningCount = useRef(0)
  const runningCount = tasks.filter(t => t.status === 'running').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const errorCount = tasks.filter(t => t.status === 'error').length

  useEffect(() => {
    if (runningCount > prevRunningCount.current) {
      setCollapsed(false)
    }
    prevRunningCount.current = runningCount
  }, [runningCount])

  const hasCompleted = completedCount + errorCount > 0

  // Build status summary
  const buildSummary = useCallback(() => {
    const parts: string[] = []
    if (runningCount > 0) parts.push(`${runningCount} running`)
    if (completedCount > 0) parts.push(`${completedCount} done`)
    if (errorCount > 0) parts.push(`${errorCount} failed`)
    return parts.join(' \u00b7 ')
  }, [runningCount, completedCount, errorCount])

  if (tasks.length === 0) return null

  return (
    <div className="rounded-xl border border-td-border/50 bg-td-surface/30 overflow-hidden agent-panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
        >
          <div className={cn(
            'h-5 w-5 rounded-md flex items-center justify-center',
            runningCount > 0 ? 'bg-orange-400/15' : 'bg-emerald-400/15'
          )}>
            <Zap className={cn(
              'h-3 w-3',
              runningCount > 0 ? 'text-orange-400' : 'text-emerald-400'
            )} />
          </div>
          <span className="text-xs font-medium text-td-text">
            {tasks.length} {tasks.length === 1 ? 'agent' : 'agents'}
          </span>
          <span className="text-[10px] text-td-muted">
            {buildSummary()}
          </span>
          {collapsed
            ? <ChevronDown className="h-3 w-3 text-td-muted" />
            : <ChevronUp className="h-3 w-3 text-td-muted" />
          }
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {/* Clear completed button */}
          {hasCompleted && !collapsed && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="text-[10px] text-td-muted hover:text-td-text px-1.5 py-0.5 rounded hover:bg-td-hover transition-colors"
            >
              Clear done
            </button>
          )}
        </div>
      </div>

      {/* Agent list */}
      <div className={cn(
        'overflow-hidden transition-all duration-300',
        collapsed ? 'max-h-0' : 'max-h-[600px]'
      )}>
        <div className="px-2 pb-2 space-y-1.5">
          {tasks.map(task => (
            <AgentRow key={task.id} task={task} onDismiss={onDismiss} />
          ))}
        </div>
      </div>

      {/* Running indicator bar */}
      {runningCount > 0 && (
        <div className="h-0.5 w-full overflow-hidden">
          <div className="h-full agent-progress-bar" />
        </div>
      )}
    </div>
  )
}
