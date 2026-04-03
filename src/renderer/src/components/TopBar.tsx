import { useState, useCallback, useMemo } from 'react'
import { Plus, FolderOpen, GitBranch, ChevronDown, Map, Terminal, FilePlus, Loader2, Check, AlertCircle, Trash2, GitFork, Search } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup
} from './ui/dropdown-menu'
import type { Project, Conversation, PermissionMode } from '../App'

interface TopBarProps {
  project?: Project
  conversation?: Conversation
  permissionMode: PermissionMode
  gitBranch: string | null
  onBranchChange: (branch: string) => void
  onGitInit: () => Promise<{ success: boolean; error?: string }>
  onOpenInExplorer: () => void
  onOpenInTerminal: () => void
  onAddFile: () => void
}

interface BranchInfo {
  name: string
  current: boolean
}

interface WorktreeInfo {
  path: string
  branch: string
  bare: boolean
  current: boolean
}

function TopBar({
  project, conversation, permissionMode,
  gitBranch, onBranchChange, onGitInit, onOpenInExplorer, onOpenInTerminal, onAddFile
}: TopBarProps): JSX.Element {
  const [gitInitState, setGitInitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [gitError, setGitError] = useState('')

  // Branch state
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchLoading, setBranchLoading] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [branchError, setBranchError] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const filteredBranches = useMemo(() => {
    const search = branchSearch.toLowerCase()
    return search ? branches.filter((b) => b.name.toLowerCase().includes(search)) : branches
  }, [branches, branchSearch])

  // Worktree state
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [worktreeLoading, setWorktreeLoading] = useState(false)
  const [showNewWorktree, setShowNewWorktree] = useState(false)
  const [worktreeBranch, setWorktreeBranch] = useState('')
  const [worktreePath, setWorktreePath] = useState('')
  const [worktreeError, setWorktreeError] = useState('')

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

  // Branch handlers
  const loadBranches = useCallback(async () => {
    if (!project) return
    setBranchLoading(true)
    setBranchError('')
    const result = await window.api.gitBranches(project.path)
    setBranches(result.success ? result.branches : [])
    setBranchLoading(false)
  }, [project])

  const handleCheckout = useCallback(async (branch: string) => {
    if (!project) return
    const result = await window.api.gitCheckout(project.path, branch)
    if (result.success) {
      onBranchChange(branch)
    } else {
      setBranchError(result.error || 'Checkout failed')
    }
  }, [project, onBranchChange])

  const handleCreateBranch = useCallback(async () => {
    if (!project || !newBranchName.trim()) return
    const name = newBranchName.trim()
    const result = await window.api.gitCreateBranch(project.path, name)
    if (result.success) {
      onBranchChange(name)
      setNewBranchName('')
      setShowNewBranch(false)
      loadBranches()
    } else {
      setBranchError(result.error || 'Failed to create branch')
    }
  }, [project, newBranchName, onBranchChange, loadBranches])

  const handleDeleteBranch = useCallback(async (branch: string) => {
    if (!project) return
    const result = await window.api.gitDeleteBranch(project.path, branch)
    if (result.success) {
      loadBranches()
    } else {
      setBranchError(result.error || 'Failed to delete branch')
    }
  }, [project, loadBranches])

  // Worktree handlers
  const loadWorktrees = useCallback(async () => {
    if (!project) return
    setWorktreeLoading(true)
    setWorktreeError('')
    const [wtResult, brResult] = await Promise.all([
      window.api.gitWorktreeList(project.path),
      window.api.gitBranches(project.path)
    ])
    setWorktrees(wtResult.success ? wtResult.worktrees : [])
    setBranches(brResult.success ? brResult.branches : [])
    setWorktreeLoading(false)
  }, [project])

  const handleAddWorktree = useCallback(async () => {
    if (!project || !worktreeBranch.trim() || !worktreePath.trim()) return
    const branch = worktreeBranch.trim()
    const path = worktreePath.trim()
    const exists = branches.some((b) => b.name === branch)
    const result = await window.api.gitWorktreeAdd(
      project.path,
      path,
      exists ? branch : undefined,
      exists ? undefined : branch
    )
    if (result.success) {
      setWorktreeBranch('')
      setWorktreePath('')
      setShowNewWorktree(false)
      loadWorktrees()
    } else {
      setWorktreeError(result.error || 'Failed to add worktree')
    }
  }, [project, worktreeBranch, worktreePath, branches, loadWorktrees])

  const handleRemoveWorktree = useCallback(async (path: string) => {
    if (!project) return
    const result = await window.api.gitWorktreeRemove(project.path, path)
    if (result.success) {
      loadWorktrees()
    } else {
      setWorktreeError(result.error || 'Failed to remove worktree')
    }
  }, [project, loadWorktrees])

  const handleOpenWorktree = useCallback((path: string) => {
    window.api.openInExplorer(path)
  }, [])

  const updateWorktreeBranch = useCallback((value: string) => {
    setWorktreeBranch(value)
    if (project) {
      const parentDir = project.path.replace(/[\\/][^\\/]+$/, '')
      const dirName = project.path.replace(/^.*[\\/]/, '')
      setWorktreePath(`${parentDir}/${dirName}-${value}`)
    }
  }, [project])

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-td-border bg-td-bg titlebar-drag">
      <div className="flex items-center gap-2 min-w-0 titlebar-no-drag">
        <span className="text-sm text-td-text-secondary truncate">
          {conversation?.title || 'New Chat'}
        </span>
        {project && (
          <span className="text-[11px] h-5 px-2 rounded bg-td-surface text-td-text-tertiary shrink-0 inline-flex items-center">
            {project.name}
          </span>
        )}

        {/* Branch dropdown */}
        {gitBranch ? (
          <DropdownMenu onOpenChange={(open) => { if (open) { loadBranches(); setShowNewBranch(false); setBranchError(''); setBranchSearch('') } }}>
            <DropdownMenuTrigger asChild>
              <button className="text-[11px] h-5 px-2 rounded bg-td-surface text-emerald-400 shrink-0 inline-flex items-center gap-1 hover:bg-td-hover transition-colors cursor-pointer outline-none">
                <GitBranch className="h-3 w-3" />
                {gitBranch}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Branches</DropdownMenuLabel>
              <div className="px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-td-muted" />
                  <input
                    autoFocus
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    placeholder="Search branches..."
                    className="w-full bg-td-bg border border-td-border rounded pl-7 pr-2 py-1 text-xs text-td-text placeholder-td-muted outline-none focus:border-td-accent"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              {branchLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-td-muted" />
                </div>
              ) : branches.length === 0 ? (
                <div className="px-2 py-3 text-xs text-td-muted text-center">
                  No branches yet. Create a commit first.
                </div>
              ) : filteredBranches.length === 0 ? (
                <div className="px-2 py-3 text-xs text-td-muted text-center">
                  No branches matching &quot;{branchSearch}&quot;
                </div>
              ) : (
                <DropdownMenuGroup>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredBranches.map((b) => (
                      <DropdownMenuItem
                        key={b.name}
                        onClick={() => { if (!b.current) handleCheckout(b.name) }}
                        className="flex items-center justify-between group/branch"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <span className="truncate">{b.name}</span>
                          {b.current && (
                            <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        {!b.current && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBranch(b.name) }}
                            className="opacity-0 group-hover/branch:opacity-100 p-0.5 hover:text-red-400 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuGroup>
              )}
              <DropdownMenuSeparator />
              {branchError && (
                <div className="px-2 py-1.5 text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{branchError}</span>
                </div>
              )}
              {showNewBranch ? (
                <div className="px-2 py-1.5">
                  <form onSubmit={(e) => { e.preventDefault(); handleCreateBranch() }} className="flex gap-1.5">
                    <input
                      autoFocus
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="branch-name"
                      className="flex-1 bg-td-bg border border-td-border rounded px-2 py-1 text-xs text-td-text placeholder-td-muted outline-none focus:border-td-accent min-w-0"
                      onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewBranch(false); setNewBranchName('') } }}
                    />
                    <Button type="submit" size="sm" className="h-6 text-xs px-2" disabled={!newBranchName.trim()}>
                      Create
                    </Button>
                  </form>
                </div>
              ) : (
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowNewBranch(true) }}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  New branch
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-[11px] h-5 px-2 rounded bg-td-surface text-orange-400 shrink-0 inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            No Git
          </span>
        )}

        {/* Worktree dropdown — separate badge, only shown when git is active */}
        {gitBranch && (
          <DropdownMenu onOpenChange={(open) => { if (open) { loadWorktrees(); setShowNewWorktree(false); setWorktreeError('') } }}>
            <DropdownMenuTrigger asChild>
              <button className="text-[11px] h-5 px-2 rounded bg-td-surface text-purple-400 shrink-0 inline-flex items-center gap-1 hover:bg-td-hover transition-colors cursor-pointer outline-none">
                <GitFork className="h-3 w-3" />
                Worktrees
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {worktreeLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-td-muted" />
                </div>
              ) : worktrees.length === 0 ? (
                <div className="px-2 py-3 text-xs text-td-muted text-center">
                  No worktrees.
                </div>
              ) : (
                <DropdownMenuGroup>
                  {worktrees.map((wt) => (
                    <DropdownMenuItem
                      key={wt.path}
                      onClick={() => handleOpenWorktree(wt.path)}
                      className="flex items-center justify-between group/wt"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GitFork className="h-3 w-3 shrink-0 text-purple-400" />
                        <div className="min-w-0">
                          <div className="text-xs truncate">{wt.branch || (wt.bare ? 'bare' : 'detached')}</div>
                          <div className="text-[10px] text-td-muted truncate">{wt.path}</div>
                        </div>
                        {wt.current && (
                          <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      {!wt.current && !wt.bare && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveWorktree(wt.path) }}
                          className="opacity-0 group-hover/wt:opacity-100 p-0.5 hover:text-red-400 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
              <DropdownMenuSeparator />
              {worktreeError && (
                <div className="px-2 py-1.5 text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{worktreeError}</span>
                </div>
              )}
              {showNewWorktree ? (
                <div className="px-2 py-1.5 space-y-1.5">
                  <form onSubmit={(e) => { e.preventDefault(); handleAddWorktree() }} className="space-y-1.5">
                    <input
                      autoFocus
                      value={worktreeBranch}
                      onChange={(e) => updateWorktreeBranch(e.target.value)}
                      placeholder="branch name"
                      className="w-full bg-td-bg border border-td-border rounded px-2 py-1 text-xs text-td-text placeholder-td-muted outline-none focus:border-td-accent"
                      onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewWorktree(false); setWorktreeBranch(''); setWorktreePath('') } }}
                    />
                    <input
                      value={worktreePath}
                      onChange={(e) => setWorktreePath(e.target.value)}
                      placeholder="path"
                      className="w-full bg-td-bg border border-td-border rounded px-2 py-1 text-xs text-td-text placeholder-td-muted outline-none focus:border-td-accent"
                    />
                    <Button type="submit" size="sm" className="h-6 text-xs px-2 w-full" disabled={!worktreeBranch.trim() || !worktreePath.trim()}>
                      Add worktree
                    </Button>
                  </form>
                </div>
              ) : (
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowNewWorktree(true) }}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  New worktree
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {permissionMode === 'full' && (
          <span className="text-[11px] h-5 px-2 rounded bg-emerald-500/15 text-emerald-400 shrink-0 inline-flex items-center gap-1">
            <Check className="h-3 w-3" />
            Full Access
          </span>
        )}
        {permissionMode === 'plan' && (
          <span className="text-[11px] h-5 px-2 rounded bg-blue-500/15 text-blue-400 shrink-0 inline-flex items-center gap-1">
            <Map className="h-3 w-3" />
            Plan Mode
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 titlebar-no-drag">
        {/* Add action */}
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
            {gitInitState === 'loading' ? 'Initializing...'
              : gitInitState === 'success' ? 'Initialized!'
              : gitInitState === 'error' ? gitError
              : 'Initialize Git'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default TopBar
