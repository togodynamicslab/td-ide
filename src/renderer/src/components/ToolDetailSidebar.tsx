import { useState } from 'react'
import {
  X, Terminal, Globe, Search, Edit3, Brain, Wrench, Eye,
  Copy, Check, BookOpen, ChevronRight, FolderOpen
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { useHorizontalResize } from '../hooks/useHorizontalResize'
import { getToolMeta, normalizeToolName, serializeToolOutput } from '@/lib/tool-meta'
import type { ToolBlock } from '../App'

interface ToolDetailSidebarProps {
  tool: ToolBlock
  onClose: () => void
}

/* ── Tool documentation for the "Learn" section ── */

interface ParamDoc {
  name: string
  type: string
  description: string
  required?: boolean
}

interface ToolDoc {
  description: string
  params: ParamDoc[]
  tips?: string[]
}

const toolDocs: Record<string, ToolDoc> = {
  Read: {
    description:
      'Reads a file from the filesystem. Supports text files, images, PDFs, and Jupyter notebooks. Results are returned with line numbers.',
    params: [
      { name: 'file_path', type: 'string', description: 'Absolute path to the file to read', required: true },
      { name: 'offset', type: 'number', description: 'Line number to start reading from (1-based)' },
      { name: 'limit', type: 'number', description: 'Maximum number of lines to read (default: 2000)' },
      { name: 'pages', type: 'string', description: 'Page range for PDFs, e.g. "1-5"' }
    ],
    tips: [
      'Use offset + limit for large files instead of reading the whole thing',
      'Can read images (PNG, JPG) — Claude sees them visually',
      'PDF files over 10 pages require the pages parameter'
    ]
  },
  Edit: {
    description:
      'Performs exact string replacements in files. The old_string must be unique in the file, or use replace_all for global replacements.',
    params: [
      { name: 'file_path', type: 'string', description: 'Absolute path to the file to modify', required: true },
      { name: 'old_string', type: 'string', description: 'The exact text to find and replace', required: true },
      { name: 'new_string', type: 'string', description: 'The replacement text', required: true },
      { name: 'replace_all', type: 'boolean', description: 'Replace all occurrences (default: false)' }
    ],
    tips: [
      'The file must be Read first before editing',
      'old_string must be unique — add surrounding context if needed',
      'Use replace_all to rename variables across the file'
    ]
  },
  Write: {
    description:
      'Writes content to a file, creating it if needed or overwriting if it exists. Prefer Edit for modifying existing files.',
    params: [
      { name: 'file_path', type: 'string', description: 'Absolute path to the file to write', required: true },
      { name: 'content', type: 'string', description: 'The full content to write to the file', required: true }
    ],
    tips: [
      'Existing files must be Read first before overwriting',
      'Prefer Edit tool for partial modifications — Write sends the entire file'
    ]
  },
  Bash: {
    description:
      'Executes a bash command and returns its output. The working directory persists between calls, but shell state (env vars, aliases) does not.',
    params: [
      { name: 'command', type: 'string', description: 'The shell command to execute', required: true },
      { name: 'description', type: 'string', description: 'Human-readable description of what the command does' },
      { name: 'timeout', type: 'number', description: 'Timeout in milliseconds (max 600000, default 120000)' },
      { name: 'run_in_background', type: 'boolean', description: 'Run in background and get notified on completion' }
    ],
    tips: [
      'Prefer dedicated tools (Read, Grep, Glob) over cat, grep, find',
      'Use && to chain dependent commands, ; for independent ones',
      'Use run_in_background for long-running processes'
    ]
  },
  Glob: {
    description:
      'Fast file pattern matching that works with any codebase size. Returns matching file paths sorted by modification time.',
    params: [
      { name: 'pattern', type: 'string', description: 'Glob pattern to match, e.g. "**/*.tsx"', required: true },
      { name: 'path', type: 'string', description: 'Directory to search in (defaults to cwd)' }
    ],
    tips: [
      'Use instead of find or ls for file discovery',
      'Supports patterns like "src/**/*.ts", "*.json"',
      'Results are sorted by modification time (newest first)'
    ]
  },
  Grep: {
    description:
      'Powerful content search built on ripgrep. Supports regex, file type filtering, context lines, and multiple output modes.',
    params: [
      { name: 'pattern', type: 'string', description: 'Regex pattern to search for', required: true },
      { name: 'path', type: 'string', description: 'File or directory to search in' },
      { name: 'glob', type: 'string', description: 'Filter files by glob, e.g. "*.ts"' },
      { name: 'type', type: 'string', description: 'File type filter, e.g. "js", "py", "rust"' },
      { name: 'output_mode', type: 'string', description: '"content", "files_with_matches" (default), or "count"' },
      { name: '-i', type: 'boolean', description: 'Case-insensitive search' },
      { name: '-C', type: 'number', description: 'Context lines before and after each match' },
      { name: 'multiline', type: 'boolean', description: 'Enable multiline matching across lines' }
    ],
    tips: [
      'Use instead of grep/rg bash commands',
      'output_mode: "files_with_matches" is fastest for finding which files match',
      'Literal braces need escaping: interface\\{\\}'
    ]
  },
  WebFetch: {
    description: 'Fetches content from a URL and returns it. Useful for reading documentation, APIs, or web resources.',
    params: [
      { name: 'url', type: 'string', description: 'The URL to fetch', required: true }
    ]
  },
  WebSearch: {
    description: 'Performs a web search and returns results. Useful for finding documentation, packages, or current information.',
    params: [
      { name: 'query', type: 'string', description: 'The search query', required: true }
    ]
  },
  Agent: {
    description:
      'Launches an autonomous sub-agent to handle complex tasks. Available types: general-purpose, Explore (codebase search), Plan (architecture), and more.',
    params: [
      { name: 'prompt', type: 'string', description: 'The task for the agent to perform', required: true },
      { name: 'description', type: 'string', description: 'Short 3-5 word summary of the task', required: true },
      { name: 'subagent_type', type: 'string', description: '"general-purpose", "Explore", "Plan", etc.' },
      { name: 'run_in_background', type: 'boolean', description: 'Run agent in background' },
      { name: 'isolation', type: 'string', description: '"worktree" for isolated git worktree' }
    ],
    tips: [
      'Use Explore for codebase research, Plan for architecture design',
      'Launch multiple agents in parallel for independent tasks',
      'Background agents notify on completion — no need to poll'
    ]
  }
}

const defaultDoc: ToolDoc = {
  description: 'A tool provided via MCP (Model Context Protocol) or other extension.',
  params: []
}

function getDoc(name: string): ToolDoc {
  return toolDocs[normalizeToolName(name)] || defaultDoc
}

/* ── Format the "command" representation ── */

function formatCommand(tool: ToolBlock): string {
  const { input } = tool
  const name = normalizeToolName(tool.name)
  switch (name) {
    case 'Read':
      return `Read ${input.file_path || ''}${input.offset ? ` (lines ${input.offset}–${Number(input.offset) + Number(input.limit || 2000)})` : ''}`
    case 'Edit':
      return `Edit ${input.file_path || ''}${input.replace_all ? ' (replace all)' : ''}`
    case 'Write':
      return `Write ${input.file_path || ''}`
    case 'Bash':
      return `$ ${input.command || ''}`
    case 'Glob':
      return `Glob "${input.pattern || ''}"${input.path ? ` in ${input.path}` : ''}`
    case 'Grep':
      return `Grep /${input.pattern || '/'} ${input.path ? `in ${input.path}` : ''}${input.glob ? ` --glob ${input.glob}` : ''}${input.type ? ` --type ${input.type}` : ''}`
    case 'Agent':
      return `Agent: ${(input.description as string) || 'subtask'}${input.subagent_type ? ` (${input.subagent_type})` : ''}`
    case 'WebFetch':
      return `Fetch ${input.url || ''}`
    case 'WebSearch':
      return `Search "${input.query || ''}"`
    default: {
      const cleanInput = Object.fromEntries(
        Object.entries(input).filter(([k]) => !k.startsWith('_'))
      )
      return `${name}(${JSON.stringify(cleanInput).slice(0, 120)})`
    }
  }
}

/* ── Param value display ── */

function ParamValue({ value }: { value: unknown }) {
  const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

  if (str.length <= 120) {
    return <span className="text-td-text-secondary whitespace-pre-wrap break-all font-mono text-[11px]">{str}</span>
  }

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-td-accent hover:underline text-[11px]">
        <ChevronRight className="h-2.5 w-2.5" />
        {str.length} chars
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 p-2 rounded bg-td-bg border border-td-border/40 text-[11px] text-td-text-secondary font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
          {str}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* ── Main component ── */

export default function ToolDetailSidebar({ tool, onClose }: ToolDetailSidebarProps) {
  const meta = getToolMeta(tool.name)
  const doc = getDoc(tool.name)
  const Icon = meta.icon
  const [copied, setCopied] = useState(false)
  const { width, handleDragStart } = useHorizontalResize({ initial: 480, min: 360 })

  const userParams = Object.entries(tool.input).filter(([k]) => !k.startsWith('_'))
  const outputStr = serializeToolOutput(tool.input._output)
  const status = tool.input._status as string | undefined

  const handleCopy = () => {
    const text = formatCommand(tool) + (outputStr ? `\n\n--- Output ---\n${outputStr}` : '')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="shrink-0 border-l border-td-border bg-td-bg flex flex-row animate-in slide-in-from-right-4 fade-in duration-200"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleDragStart}
        className="w-1 shrink-0 cursor-col-resize hover:bg-td-accent transition-colors"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-td-border shrink-0">
          <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
          <span className="text-sm font-medium text-td-text flex-1 truncate">{tool.name}</span>
          {status && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              status === 'success' ? 'bg-emerald-500/15 text-emerald-400' :
              status === 'error' ? 'bg-red-500/15 text-red-400' :
              'bg-td-border text-td-muted'
            )}>
              {status}
            </span>
          )}
          <button onClick={handleCopy} className="p-1 rounded-md text-td-muted hover:text-td-text hover:bg-td-hover transition-colors">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onClose} className="p-1 rounded-md text-td-muted hover:text-td-text hover:bg-td-hover transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Command used */}
          <div className="px-4 py-3 border-b border-td-border/50">
            <div className="text-[10px] uppercase tracking-wider text-td-muted font-medium mb-2">Command</div>
            <div className="px-3 py-2 rounded-lg bg-td-surface border border-td-border/50 font-mono text-xs text-td-text-secondary whitespace-pre-wrap break-all">
              {formatCommand(tool)}
            </div>
          </div>

          {/* Parameters used */}
          <div className="px-4 py-3 border-b border-td-border/50">
            <div className="text-[10px] uppercase tracking-wider text-td-muted font-medium mb-2">
              Parameters ({userParams.length})
            </div>
            <div className="space-y-2">
              {userParams.map(([key, value]) => {
                const paramDoc = doc.params.find((p) => p.name === key)
                return (
                  <div key={key} className="rounded-lg bg-td-surface/50 border border-td-border/30 px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-[11px] font-mono text-td-accent font-medium">{key}</code>
                      {paramDoc?.type && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-td-border/50 text-td-muted">{paramDoc.type}</span>
                      )}
                      {paramDoc?.required && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">required</span>
                      )}
                    </div>
                    {paramDoc?.description && (
                      <div className="text-[10px] text-td-muted mb-1.5">{paramDoc.description}</div>
                    )}
                    <ParamValue value={value} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Output */}
          {outputStr && (
            <div className="px-4 py-3 border-b border-td-border/50">
              <div className="text-[10px] uppercase tracking-wider text-td-muted font-medium mb-2">Output</div>
              <pre className="px-3 py-2 rounded-lg bg-td-surface border border-td-border/50 font-mono text-[11px] text-td-text-secondary whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto leading-relaxed">
                {outputStr.slice(0, 5000)}
                {outputStr.length > 5000 && (
                  <span className="text-td-muted">{`\n... (${outputStr.length - 5000} more characters)`}</span>
                )}
              </pre>
            </div>
          )}

          {/* Learn section */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-3">
              <BookOpen className="h-3 w-3 text-td-accent" />
              <span className="text-[10px] uppercase tracking-wider text-td-accent font-medium">Learn about {tool.name}</span>
            </div>

            <p className="text-xs text-td-text-secondary leading-relaxed mb-3">{doc.description}</p>

            {/* All available params */}
            {doc.params.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-td-muted hover:text-td-text-secondary transition-colors mb-1">
                  <ChevronRight className="h-2.5 w-2.5" />
                  All parameters ({doc.params.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1.5 space-y-1 ml-1">
                    {doc.params.map((p) => {
                      const wasUsed = userParams.some(([k]) => k === p.name)
                      return (
                        <div key={p.name} className={cn(
                          'flex items-start gap-2 text-[11px] py-1 px-2 rounded',
                          wasUsed ? 'bg-td-accent/5' : ''
                        )}>
                          <code className={cn('font-mono shrink-0', wasUsed ? 'text-td-accent' : 'text-td-muted')}>
                            {p.name}
                          </code>
                          <span className="text-td-text-faint">{p.type}</span>
                          <span className="text-td-muted flex-1">{p.description}</span>
                          {p.required && <span className="text-amber-400 text-[9px] shrink-0">req</span>}
                        </div>
                      )
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Tips */}
            {doc.tips && doc.tips.length > 0 && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <div className="text-[10px] text-blue-400 font-medium mb-1.5">Tips</div>
                <ul className="space-y-1">
                  {doc.tips.map((tip, i) => (
                    <li key={i} className="text-[11px] text-td-text-tertiary flex items-start gap-1.5">
                      <span className="text-blue-400/50 shrink-0 mt-0.5">-</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
