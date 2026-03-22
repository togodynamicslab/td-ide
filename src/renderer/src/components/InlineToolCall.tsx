import { useState } from 'react'
import {
  ChevronRight, Terminal, Globe, Search,
  Edit3, Brain, Wrench, Eye, Loader2
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { cn } from '@/lib/utils'
import type { ToolBlock } from '../App'

const toolConfig: Record<string, { icon: typeof Eye; color: string; label: (t: ToolBlock) => string }> = {
  Read: {
    icon: Eye,
    color: 'text-blue-400',
    label: (t) => {
      const file = String(t.input.file_path || '').split(/[/\\]/).pop() || 'file'
      return `Read ${file}`
    }
  },
  Edit: {
    icon: Edit3,
    color: 'text-green-400',
    label: (t) => {
      const file = String(t.input.file_path || '').split(/[/\\]/).pop() || 'file'
      return `Edited ${file}`
    }
  },
  Write: {
    icon: Edit3,
    color: 'text-green-400',
    label: (t) => {
      const file = String(t.input.file_path || '').split(/[/\\]/).pop() || 'file'
      return `Wrote ${file}`
    }
  },
  Bash: {
    icon: Terminal,
    color: 'text-yellow-400',
    label: (t) => {
      const cmd = String(t.input.command || '').slice(0, 60)
      return cmd || 'Ran command'
    }
  },
  Glob: {
    icon: Search,
    color: 'text-cyan-400',
    label: (t) => `Glob ${String(t.input.pattern || '')}`
  },
  Grep: {
    icon: Search,
    color: 'text-cyan-400',
    label: (t) => `Grep ${String(t.input.pattern || '')}`
  },
  WebFetch: {
    icon: Globe,
    color: 'text-purple-400',
    label: (t) => `Fetched ${String(t.input.url || '').replace(/^https?:\/\//, '').slice(0, 50)}`
  },
  WebSearch: {
    icon: Globe,
    color: 'text-purple-400',
    label: (t) => `Searched "${String(t.input.query || '').slice(0, 50)}"`
  },
  Agent: {
    icon: Brain,
    color: 'text-orange-400',
    label: (t) => String((t.input.description as string) || 'Subtask').slice(0, 60)
  }
}

function getConfig(name: string) {
  return toolConfig[name] || { icon: Wrench, color: 'text-td-text-tertiary', label: (t: ToolBlock) => t.name }
}

interface InlineToolCallProps {
  tool: ToolBlock
  isActive?: boolean
}

export default function InlineToolCall({ tool, isActive = false }: InlineToolCallProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const config = getConfig(tool.name)
  const Icon = config.icon

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(
        'flex items-center gap-2 w-full text-left py-1 px-2.5 rounded-md border transition-colors text-xs',
        isActive
          ? 'border-td-accent/30 bg-td-bg/50'
          : 'border-td-border/40 bg-td-bg/30 hover:bg-td-hover/30'
      )}>
        {isActive ? (
          <Loader2 className="h-3 w-3 text-td-accent animate-spin shrink-0" />
        ) : (
          <ChevronRight className={cn(
            'h-2.5 w-2.5 text-td-muted transition-transform duration-200',
            open && 'rotate-90'
          )} />
        )}
        <Icon className={cn('h-3 w-3 shrink-0', config.color)} />
        <span className="truncate text-td-text-tertiary">
          {config.label(tool)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 mt-1 px-2 py-1.5 rounded bg-td-bg/50 border border-td-border/30 text-[11px] font-mono text-td-muted overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
          {formatInput(tool)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function formatInput(tool: ToolBlock): string {
  const { input } = tool
  switch (tool.name) {
    case 'Read':
      return String(input.file_path || '')
    case 'Edit':
      return `${input.file_path || ''}\n---\n- ${String(input.old_string || '').slice(0, 200)}\n+ ${String(input.new_string || '').slice(0, 200)}`
    case 'Write':
      return `${input.file_path || ''}\n${String(input.content || '').slice(0, 300)}`
    case 'Bash':
      return String(input.command || '')
    case 'Glob':
    case 'Grep':
      return `${input.pattern || ''}${input.path ? ` in ${input.path}` : ''}`
    case 'Agent':
      return String((input.description as string) || (input.prompt as string) || '').slice(0, 300)
    default:
      return JSON.stringify(input, null, 2).slice(0, 400)
  }
}
