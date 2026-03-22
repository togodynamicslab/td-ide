import { useState } from 'react'
import { ChevronRight, FileText, Terminal, Globe, Search, Edit3, FolderOpen } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolBlock } from '../App'

const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: Edit3,
  Write: Edit3,
  Bash: Terminal,
  WebFetch: Globe,
  WebSearch: Search,
  Glob: FolderOpen,
  Grep: Search
}

function getToolSummary(tool: ToolBlock): string {
  const input = tool.input
  switch (tool.name) {
    case 'Read':
      return String(input.file_path || '').split(/[/\\]/).pop() || 'file'
    case 'Edit':
      return String(input.file_path || '').split(/[/\\]/).pop() || 'file'
    case 'Write':
      return String(input.file_path || '').split(/[/\\]/).pop() || 'file'
    case 'Bash':
      return String(input.command || '').slice(0, 60) || 'command'
    case 'WebFetch':
      return String(input.url || '').slice(0, 60) || 'url'
    case 'WebSearch':
      return String(input.query || '').slice(0, 60) || 'search'
    case 'Glob':
      return String(input.pattern || '') || 'pattern'
    case 'Grep':
      return String(input.pattern || '') || 'pattern'
    default:
      return JSON.stringify(input).slice(0, 60)
  }
}

function ToolAccordion({ tool }: { tool: ToolBlock }): JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = TOOL_ICONS[tool.name] || Terminal
  const summary = getToolSummary(tool)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-3 rounded-md border border-td-border bg-td-bg hover:bg-td-hover transition-colors group text-xs">
        <ChevronRight
          className={cn(
            'h-3 w-3 text-td-muted transition-transform duration-200',
            open && 'rotate-90'
          )}
        />
        <Icon className="h-3.5 w-3.5 text-td-accent shrink-0" />
        <span className="text-td-text-tertiary font-medium">{tool.name}</span>
        <span className="text-td-muted truncate">{summary}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-5 px-3 py-2 rounded-md bg-td-bg border border-td-border text-xs font-mono text-td-text-tertiary overflow-x-auto">
          {Object.entries(tool.input).map(([key, value]) => (
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
