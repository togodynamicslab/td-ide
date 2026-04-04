import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { cn } from '@/lib/utils'
import { getToolMeta, getToolDetail } from '@/lib/tool-meta'
import type { ToolBlock } from '../App'

function ToolAccordion({ tool }: { tool: ToolBlock }): JSX.Element {
  const [open, setOpen] = useState(false)
  const meta = getToolMeta(tool.name)
  const Icon = meta.icon
  const summary = getToolDetail(tool)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-3 rounded-md border border-td-border bg-td-bg hover:bg-td-hover transition-colors group text-xs">
        <ChevronRight
          className={cn(
            'h-3 w-3 text-td-muted transition-transform duration-200',
            open && 'rotate-90'
          )}
        />
        <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
        <span className="text-td-text-tertiary font-medium">{tool.name}</span>
        <span className="text-td-muted truncate">{summary}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-5 px-3 py-2 rounded-md bg-td-bg border border-td-border text-xs font-mono text-td-text-tertiary overflow-x-auto">
          {Object.entries(tool.input)
            .filter(([key]) => !key.startsWith('_'))
            .map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <span className="text-td-accent shrink-0">{key}:</span>
                <span className="text-td-text-secondary whitespace-pre-wrap break-all">
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </span>
              </div>
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default ToolAccordion
