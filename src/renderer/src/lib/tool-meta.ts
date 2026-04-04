import {
  Terminal, Globe, Search, Edit3, Brain, Wrench, Eye, FolderOpen
} from 'lucide-react'
import type { ToolBlock } from '../App'

export interface ToolMeta {
  icon: typeof Eye
  color: string
  label: (t: ToolBlock) => string
}

const toolMeta: Record<string, ToolMeta> = {
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
    icon: FolderOpen,
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

/** ACP sends display titles like "Read File", "Edit File" — normalize to canonical names */
const nameAliases: Record<string, string> = {
  'Read File': 'Read',
  'Edit File': 'Edit',
  'Write File': 'Write',
  'Run Command': 'Bash',
  'Execute Command': 'Bash',
  'Search Files': 'Grep',
  'Find Files': 'Glob',
  'List Files': 'Glob',
  'Web Fetch': 'WebFetch',
  'Web Search': 'WebSearch',
  'Launch Agent': 'Agent',
}

/** Resolve ACP display title to canonical tool name */
export function normalizeToolName(name: string): string {
  return nameAliases[name] || name
}

const defaultMeta: ToolMeta = {
  icon: Wrench,
  color: 'text-td-text-tertiary',
  label: (t) => t.name
}

export function getToolMeta(name: string): ToolMeta {
  return toolMeta[normalizeToolName(name)] || defaultMeta
}

/** Short detail string for tool summaries */
export function getToolDetail(tool: ToolBlock): string {
  const input = tool.input
  const name = normalizeToolName(tool.name)
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return String(input.file_path || '').split(/[/\\]/).pop() || 'file'
    case 'Bash':
      return String(input.command || '').slice(0, 80) || 'command'
    case 'WebFetch':
      return String(input.url || '').replace(/^https?:\/\//, '').slice(0, 60) || 'url'
    case 'WebSearch':
      return String(input.query || '').slice(0, 60) || 'search'
    case 'Glob':
    case 'Grep':
      return String(input.pattern || '') || 'pattern'
    case 'Agent':
      return ((input.description as string) || '').slice(0, 60) || 'subtask'
    default:
      return tool.name
  }
}

/** Safely serialize a tool output value (may be string, object, or undefined) */
export function serializeToolOutput(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
