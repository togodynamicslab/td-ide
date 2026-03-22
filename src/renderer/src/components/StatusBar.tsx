import { useState, useEffect } from 'react'
import { Cpu } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface MemoryInfo {
  main: { rss: number; heapUsed: number; heapTotal: number }
  claude: { conversationId: string; rss: number }[]
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

  const claudeTotal = memory.claude.reduce((sum, c) => sum + c.rss, 0)
  const total = memory.main.rss + claudeTotal
  const agents = memory.claude.length

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-td-muted cursor-default group-data-[collapsible=icon]:justify-center">
          <Cpu className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {formatMB(total)}{agents > 0 && ` (${agents} agent${agents > 1 ? 's' : ''})`}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="text-xs space-y-1">
          <div>App: {formatMB(memory.main.rss)}</div>
          <div className="text-td-muted">Heap: {formatMB(memory.main.heapUsed)} / {formatMB(memory.main.heapTotal)}</div>
          {agents > 0 && (
            <>
              <div className="border-t border-td-border pt-1 mt-1">Claude processes:</div>
              {memory.claude.map((c) => (
                <div key={c.conversationId} className="text-td-muted">
                  {c.conversationId.slice(0, 8)}… — {formatMB(c.rss)}
                </div>
              ))}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default MemoryIndicator
