import { X, FileEdit, FilePlus, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DiffSidebarProps {
  filePath: string
  action: 'write' | 'edit' | 'execute' | 'other'
  oldString?: string
  newString?: string
  newContent?: string
  command?: string
  onClose: () => void
}

function DiffLine({ type, content, lineNum }: { type: 'add' | 'remove' | 'context'; content: string; lineNum?: number }) {
  return (
    <div className={cn(
      'flex text-[12px] font-mono leading-5 min-h-[20px]',
      type === 'add' && 'bg-emerald-500/10',
      type === 'remove' && 'bg-red-500/10',
    )}>
      <span className="w-10 shrink-0 text-right pr-2 text-td-muted/40 select-none text-[10px] leading-5">
        {lineNum ?? ''}
      </span>
      <span className={cn(
        'w-5 shrink-0 text-center select-none text-[10px] leading-5',
        type === 'add' && 'text-emerald-400/60',
        type === 'remove' && 'text-red-400/60',
        type === 'context' && 'text-td-muted/30',
      )}>
        {type === 'add' ? '+' : type === 'remove' ? '-' : ' '}
      </span>
      <span className={cn(
        'flex-1 whitespace-pre-wrap break-all px-2',
        type === 'add' && 'text-emerald-300',
        type === 'remove' && 'text-red-300',
        type === 'context' && 'text-td-text-tertiary',
      )}>
        {content || '\u00A0'}
      </span>
    </div>
  )
}

export default function DiffSidebar({ filePath, action, oldString, newString, newContent, command, onClose }: DiffSidebarProps) {
  const fileName = filePath.split('/').pop() || filePath
  const dirPath = filePath.split('/').slice(0, -1).join('/') || ''

  return (
    <div className="w-[420px] shrink-0 border-l border-td-border bg-td-bg flex flex-col animate-in slide-in-from-right-4 fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-td-border bg-td-surface/50 shrink-0">
        {action === 'edit' && <FileEdit className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
        {action === 'write' && <FilePlus className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
        {action === 'execute' && <Terminal className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-td-text truncate">{fileName}</div>
          {dirPath && <div className="text-[10px] text-td-muted truncate">{dirPath}</div>}
        </div>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
          action === 'write' ? 'bg-emerald-500/15 text-emerald-400' :
          action === 'edit' ? 'bg-amber-500/15 text-amber-400' :
          action === 'execute' ? 'bg-blue-500/15 text-blue-400' :
          'bg-td-border text-td-muted'
        )}>
          {action === 'write' ? 'New file' : action === 'edit' ? 'Modified' : action === 'execute' ? 'Command' : 'Tool'}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-td-muted hover:text-td-text hover:bg-td-hover transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {action === 'edit' && oldString != null && newString != null && (
          <div className="py-1">
            {/* Removed lines */}
            {oldString.split('\n').map((line, i) => (
              <DiffLine key={`r-${i}`} type="remove" content={line} lineNum={i + 1} />
            ))}
            {/* Separator */}
            <div className="h-px bg-td-border/30 my-1" />
            {/* Added lines */}
            {newString.split('\n').map((line, i) => (
              <DiffLine key={`a-${i}`} type="add" content={line} lineNum={i + 1} />
            ))}
          </div>
        )}

        {action === 'write' && newContent != null && (
          <div className="py-1">
            {newContent.split('\n').map((line, i) => (
              <DiffLine key={i} type="add" content={line} lineNum={i + 1} />
            ))}
          </div>
        )}

        {action === 'execute' && command && (
          <div className="p-3">
            <div className="text-[12px] font-mono bg-td-surface rounded-lg p-3 text-blue-300 border border-td-border/50 whitespace-pre-wrap">
              $ {command}
            </div>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-td-border text-[10px] text-td-muted shrink-0">
        {action === 'edit' && oldString != null && newString != null && (
          <>
            <span className="text-red-400">-{oldString.split('\n').length} lines</span>
            <span className="text-emerald-400">+{newString.split('\n').length} lines</span>
          </>
        )}
        {action === 'write' && newContent != null && (
          <span className="text-emerald-400">+{newContent.split('\n').length} lines</span>
        )}
      </div>
    </div>
  )
}
