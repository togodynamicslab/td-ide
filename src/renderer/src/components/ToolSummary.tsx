import { useState } from 'react'
import {
  ChevronRight, Terminal, Globe, Search,
  Edit3, Brain, Wrench, Eye, Loader2
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { cn } from '@/lib/utils'
import { getToolDetail, normalizeToolName } from '@/lib/tool-meta'
import type { ToolBlock } from '../App'

interface ToolGroup {
  label: string
  icon: typeof Eye
  color: string
  tools: ToolBlock[]
}

function categorize(tools: ToolBlock[]): ToolGroup[] {
  const groups: Record<string, ToolBlock[]> = {}

  for (const tool of tools) {
    let category: string
    switch (normalizeToolName(tool.name)) {
      case 'Read':
        category = 'read'
        break
      case 'Edit':
      case 'Write':
      case 'NotebookEdit':
        category = 'write'
        break
      case 'Bash':
        category = 'bash'
        break
      case 'WebFetch':
      case 'WebSearch':
        category = 'web'
        break
      case 'Glob':
      case 'Grep':
        category = 'search'
        break
      case 'Agent':
        category = 'agent'
        break
      default:
        category = 'other'
    }
    if (!groups[category]) groups[category] = []
    groups[category].push(tool)
  }

  const order = ['read', 'search', 'web', 'bash', 'write', 'agent', 'other']
  const config: Record<string, { label: (n: number) => string; icon: typeof Eye; color: string }> = {
    read: { label: (n) => n === 1 ? 'Read 1 file' : `Read ${n} files`, icon: Eye, color: 'text-blue-400' },
    write: { label: (n) => n === 1 ? 'Modified 1 file' : `Modified ${n} files`, icon: Edit3, color: 'text-green-400' },
    bash: { label: (n) => n === 1 ? 'Ran 1 command' : `Ran ${n} commands`, icon: Terminal, color: 'text-yellow-400' },
    web: { label: (n) => n === 1 ? 'Fetched 1 page' : `Fetched ${n} pages`, icon: Globe, color: 'text-purple-400' },
    search: { label: (n) => n === 1 ? 'Searched files' : `Searched files (${n})`, icon: Search, color: 'text-cyan-400' },
    agent: { label: (n) => n === 1 ? 'Used 1 agent' : `Used ${n} agents`, icon: Brain, color: 'text-orange-400' },
    other: { label: (n) => n === 1 ? 'Used 1 tool' : `Used ${n} tools`, icon: Wrench, color: 'text-td-text-tertiary' }
  }

  return order
    .filter((key) => groups[key]?.length)
    .map((key) => ({
      label: config[key].label(groups[key].length),
      icon: config[key].icon,
      color: config[key].color,
      tools: groups[key]
    }))
}

function ToolGroupItem({ group }: { group: ToolGroup }): JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = group.icon

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 px-2 rounded hover:bg-td-hover/50 transition-colors text-xs group">
        <ChevronRight className={cn('h-2.5 w-2.5 text-td-muted transition-transform duration-200', open && 'rotate-90')} />
        <Icon className={cn('h-3 w-3 shrink-0', group.color)} />
        <span className="text-td-text-tertiary">{group.label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 pl-2 border-l border-td-border/50 space-y-0.5 py-1">
          {group.tools.map((tool) => (
            <div key={tool.id} className="text-[11px] text-td-muted py-0.5 px-1 truncate flex items-center gap-1.5">
              <span className="text-td-text-faint font-mono shrink-0">{tool.name}</span>
              <span className="truncate text-td-text-faint">{getToolDetail(tool)}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function ToolSummary({ tools, isActive = false }: { tools: ToolBlock[]; isActive?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const groups = categorize(tools)

  const summary = groups.map((g) => g.label).join(' · ')

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(
        'flex items-center gap-2 w-full text-left py-1.5 px-3 rounded-lg border bg-td-bg/50 hover:bg-td-hover/30 transition-colors text-xs group',
        isActive ? 'border-td-accent/30' : 'border-td-border/60'
      )}>
        {isActive ? (
          <Loader2 className="h-3 w-3 text-td-accent animate-spin shrink-0" />
        ) : (
          <ChevronRight className={cn('h-3 w-3 text-td-muted transition-transform duration-200', open && 'rotate-90')} />
        )}
        <Wrench className={cn('h-3 w-3 shrink-0', isActive ? 'text-td-accent' : 'text-td-muted')} />
        <span className={cn('truncate', isActive ? 'text-td-text-secondary' : 'text-td-text-tertiary')}>
          {isActive ? summary + '...' : summary}
        </span>
        <span className="text-td-muted ml-auto shrink-0">{tools.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 pl-2">
          {groups.map((group, i) => (
            <ToolGroupItem key={i} group={group} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
