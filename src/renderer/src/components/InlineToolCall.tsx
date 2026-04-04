import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getToolMeta, normalizeToolName } from '@/lib/tool-meta'
import type { ToolBlock } from '../App'

interface InlineToolCallProps {
  tool: ToolBlock
  isActive?: boolean
  onToolClick?: (tool: ToolBlock) => void
}

function getStatusLabel(tool: ToolBlock): string {
  const name = normalizeToolName(tool.name)
  const status = tool.input._status as string | undefined
  const isComplete = status === 'completed' || status === 'success' || tool.input._output !== undefined
  const isFailed = status === 'error' || status === 'failed'

  if (isFailed) {
    switch (name) {
      case 'Bash': return 'Command failed'
      case 'Read': return 'File read failed'
      case 'Edit': return 'File edit failed'
      case 'Write': return 'File write failed'
      default: return `${tool.name} failed`
    }
  }

  if (isComplete) {
    switch (name) {
      case 'Bash': return 'Command run complete'
      case 'Read': return 'File read complete'
      case 'Edit': return 'File edited'
      case 'Write': return 'File written'
      case 'Glob': return 'Search complete'
      case 'Grep': return 'Search complete'
      case 'WebFetch': return 'Fetch complete'
      case 'WebSearch': return 'Search complete'
      case 'Agent': return 'Agent task complete'
      default: return `${tool.name} complete`
    }
  }

  switch (name) {
    case 'Bash': return 'Running command'
    case 'Read': return 'Reading file'
    case 'Edit': return 'Editing file'
    case 'Write': return 'Writing file'
    case 'Glob': return 'Searching files'
    case 'Grep': return 'Searching content'
    case 'WebFetch': return 'Fetching URL'
    case 'WebSearch': return 'Searching web'
    case 'Agent': return 'Running agent'
    default: return `Running ${tool.name}`
  }
}

function getDetail(tool: ToolBlock): string {
  const name = normalizeToolName(tool.name)
  const input = tool.input
  switch (name) {
    case 'Bash':
      return String(input.command || '').slice(0, 100)
    case 'Read':
    case 'Edit':
    case 'Write':
      return String(input.file_path || '')
    case 'Glob':
    case 'Grep':
      return `${input.pattern || ''}${input.path ? ` in ${input.path}` : ''}`
    case 'WebFetch':
      return String(input.url || '').replace(/^https?:\/\//, '').slice(0, 80)
    case 'WebSearch':
      return String(input.query || '').slice(0, 80)
    case 'Agent':
      return String((input.description as string) || '').slice(0, 80)
    default:
      return ''
  }
}

export default function InlineToolCall({ tool, isActive = false, onToolClick }: InlineToolCallProps): JSX.Element {
  const status = tool.input._status as string | undefined
  const isComplete = status === 'completed' || status === 'success' || (!isActive && tool.input._output !== undefined)
  const isFailed = status === 'error' || status === 'failed'
  const meta = getToolMeta(tool.name)

  const statusLabel = getStatusLabel(tool)
  const detail = getDetail(tool)

  return (
    <button
      type="button"
      className="flex items-center gap-2 w-full text-left py-0.5 text-xs group cursor-pointer"
      onClick={() => onToolClick?.(tool)}
    >
      {isActive ? (
        <Loader2 className="h-3 w-3 text-td-accent animate-spin shrink-0" />
      ) : isFailed ? (
        <XCircle className="h-3 w-3 text-red-400 shrink-0" />
      ) : isComplete ? (
        <CheckCircle2 className={cn('h-3 w-3 shrink-0', meta.color)} />
      ) : (
        <CheckCircle2 className="h-3 w-3 text-td-muted shrink-0" />
      )}
      <span className={cn(
        'shrink-0',
        isFailed ? 'text-red-400' : isActive ? 'text-td-text' : 'text-td-text-secondary'
      )}>
        {statusLabel}
      </span>
      {detail && (
        <span className="text-td-muted truncate font-mono group-hover:text-td-text-tertiary transition-colors">
          {detail}
        </span>
      )}
    </button>
  )
}
