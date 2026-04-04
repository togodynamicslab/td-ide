import { useState, useEffect } from 'react'
import { Cpu } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface MemoryInfo {
  main: { rss: number; heapUsed: number; heapTotal: number }
  agent: { pid: number | null; rss: number; sessions: number }
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

function MemoryIndicator(): JSX.Element | null {
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
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-td-muted cursor-default group-data-[collapsible=icon]:justify-center">
          <Cpu className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {formatMB(total)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="text-xs space-y-1">
          <div>App: {formatMB(memory.main.rss)}</div>
          <div className="text-td-muted">Heap: {formatMB(memory.main.heapUsed)} / {formatMB(memory.main.heapTotal)}</div>
          {memory.agent.pid && (
            <>
              <div className="border-t border-td-border pt-1 mt-1">
                Agent process (PID {memory.agent.pid})
              </div>
              <div className="text-td-muted">
                Memory: {formatMB(memory.agent.rss)}
              </div>
              <div className="text-td-muted">
                Active sessions: {memory.agent.sessions}
              </div>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default MemoryIndicator
