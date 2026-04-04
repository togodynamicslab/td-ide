import { useState } from 'react'
import { Plus, FolderOpen, GitBranch, ChevronDown, Terminal, FilePlus, Loader2, Check, AlertCircle, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem
} from './ui/dropdown-menu'
import { useSidebar } from './ui/sidebar'
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip'
import type { Project, Conversation } from '../App'

interface TopBarProps {
  project?: Project
  conversation?: Conversation
  gitBranch: string | null
  onGitInit: () => Promise<{ success: boolean; error?: string }>
  onOpenInExplorer: () => void
  onOpenInTerminal: () => void
  onAddFile: () => void
}

function TopBar({
  project, conversation,
  gitBranch, onGitInit, onOpenInExplorer, onOpenInTerminal, onAddFile
}: TopBarProps): JSX.Element {
  const { state: sidebarState, toggleSidebar } = useSidebar()
  const [gitInitState, setGitInitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [gitError, setGitError] = useState('')

  const handleGitInit = async () => {
    setGitInitState('loading')
    const result = await onGitInit()
    if (result.success) {
      setGitInitState('success')
      setTimeout(() => setGitInitState('idle'), 2000)
    } else {
      setGitError(result.error || 'Failed to initialize git')
      setGitInitState('error')
      setTimeout(() => setGitInitState('idle'), 3000)
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-td-border/60 bg-td-bg titlebar-drag">
      <div className="flex items-center gap-2 min-w-0 titlebar-no-drag">
        {sidebarState === 'collapsed' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-6 w-6 shrink-0">
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Expand sidebar (Cmd+B)</TooltipContent>
          </Tooltip>
        )}
        <span className={cn('text-sm truncate', conversation ? 'text-td-text-secondary' : 'text-td-muted')}>
          {conversation?.title || 'No active thread'}
        </span>
        {project && (
          <span className="text-[11px] h-5 px-2 rounded bg-td-surface text-td-text-tertiary shrink-0 inline-flex items-center">
            {project.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 titlebar-no-drag">
        {/* Add context */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-3 w-3 mr-1" />
              Add context
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddFile}>
              <FilePlus className="h-3.5 w-3.5 mr-2" />
              Add file to chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Open */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderOpen className="h-3 w-3 mr-1" />
              Open
              <ChevronDown className="h-3 w-3 ml-1 text-td-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpenInExplorer}>
              <FolderOpen className="h-3.5 w-3.5 mr-2" />
              Open in Explorer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenInTerminal}>
              <Terminal className="h-3.5 w-3.5 mr-2" />
              Open in Terminal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Git init — only show if no git */}
        {!gitBranch && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGitInit}
            disabled={gitInitState === 'loading'}
          >
            {gitInitState === 'loading' ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : gitInitState === 'success' ? (
              <Check className="h-3 w-3 mr-1 text-emerald-400" />
            ) : gitInitState === 'error' ? (
              <AlertCircle className="h-3 w-3 mr-1 text-red-400" />
            ) : (
              <GitBranch className="h-3 w-3 mr-1" />
            )}
            {gitInitState === 'error' ? gitError : 'Git init'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default TopBar
