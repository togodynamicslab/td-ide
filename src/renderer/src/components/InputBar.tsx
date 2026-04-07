import { useState, useRef, useEffect, useCallback, useMemo, FormEvent } from 'react'
import {
  Sparkles, Gauge, Square, Loader2, Plus, Paperclip,
  Camera, CornerDownLeft, X, ListOrdered, Image as ImageIcon,
  Map as MapIcon, ShieldCheck, ShieldQuestion,
  MessageSquarePlus, Eraser, HelpCircle, Hash, Sun,
  Moon, Settings, FileCode, Minimize2, FolderOpen,
  Terminal, Zap, Info, Check, Timer, RefreshCw,
  Code2, Bug, Keyboard, BookOpen, Archive, GitFork, BarChart3,
  Key, Eye, ChevronDown, CircleCheck, Cpu, Search, DollarSign,
  AlertTriangle, GitBranch, ArrowLeft, ArrowUp, Trash2,
  Pencil, FilePlus2, TerminalSquare, Wrench
} from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuItem, DropdownMenuCheckboxItem
} from './ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { cn } from '@/lib/utils'
import RichInput from './RichInput'
import type { RichInputHandle } from './RichInput'
import ShellSessionBar from './ShellSessionBar'
import BackgroundCommandBar from './BackgroundCommandBar'
import type { BackgroundSession } from './BackgroundCommandBar'
import type { ModelId, EffortLevel, PermissionMode, ImageAttachment, ApiMode, ApiProvider, ConversationUsage } from '../App'

interface InputBarProps {
  conversationId: string | null
  onSend: (message: string, images?: ImageAttachment[]) => void
  onCancel: () => void
  onNewChat: () => void
  onClearConversation: () => void
  onOpenSettings: () => void
  onOpenInExplorer: () => void
  onOpenInTerminal: () => void
  onAddFile: () => void
  isLoading: boolean
  queueLength: number
  queuedMessages: { text: string }[]
  selectedModel: ModelId
  onModelChange: (model: ModelId) => void
  effortLevel: EffortLevel
  onEffortChange: (effort: EffortLevel) => void
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => void
  disabledTools: Set<string>
  onToggleTool: (tool: string) => void
  onArchiveConversation: () => void
  onShowUsage: () => void
  apiMode: ApiMode
  onApiModeChange: (mode: ApiMode) => void
  apiProvider: ApiProvider
  onApiProviderChange: (provider: ApiProvider) => void
  apiKey: string
  onApiKeyChange: (key: string) => void
  customModel: string
  onCustomModelChange: (model: string) => void
  contextTokens: number
  conversationUsage: ConversationUsage | null
  gitBranch: string | null
  gitDiffStats: { additions: number; deletions: number }
  onCommitChanges: () => void
  projectPath: string | null
  onBranchChange: (branch: string) => void
  worktreePath: string | null
  messageHistory: string[]
  onCreateWorktree: (branchName: string) => Promise<{ success: boolean; error?: string }>
  onSelectWorktree: (path: string | null) => void
  onRemoveWorktree: (path: string) => Promise<{ success: boolean; error?: string }>
  terminalOpen: boolean
  onToggleTerminal: () => void
  shellSession: { id: string; command: string; exitCode: number | null; conversationId: string | null; scope: 'conversation' | 'global' } | null
  onShellSession: (session: { id: string; command: string; exitCode: number | null; conversationId: string | null; scope: 'conversation' | 'global' } | null) => void
  backgroundSessions: BackgroundSession[]
  onCloseBackgroundSession: (id: string) => void
  alwaysAllowedTypes: Set<string>
  onToggleAlwaysAllowed: (actionType: string) => void
}

// --- Slash command definitions ---

type SlashCategory = 'chat' | 'config' | 'project' | 'automation' | 'info'

const CATEGORY_LABELS: Record<SlashCategory, string> = {
  chat: 'Chat',
  config: 'Configuration',
  project: 'Project',
  automation: 'Automation',
  info: 'Info'
}

interface SlashCommand {
  name: string
  description: string
  icon: React.ReactNode
  category: SlashCategory
  badge?: string // current value indicator
  subOptions?: { value: string; label: string; current?: boolean }[]
  action: (arg?: string) => void
}

const MANAGEABLE_TOOLS = [
  { id: 'Agent', label: 'Agent (sub-agents)' },
  { id: 'WebSearch', label: 'Web Search' },
  { id: 'WebFetch', label: 'Web Fetch' },
  { id: 'Bash', label: 'Bash / Shell' },
  { id: 'Edit', label: 'Edit files' },
  { id: 'Write', label: 'Write files' },
  { id: 'NotebookEdit', label: 'Notebook Edit' },
]

interface Draft {
  text: string
  images: ImageAttachment[]
}

const MODEL_LABELS: Record<ModelId, string> = {
  opus: 'Claude Opus 4.6',
  sonnet: 'Claude Sonnet 4.6',
  haiku: 'Claude Haiku 4.5'
}

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low', medium: 'Medium', high: 'High', max: 'Max'
}

const PERMISSION_LABELS: Record<PermissionMode, string> = {
  full: 'Full access', approve: 'Approve edits', default: 'Default', plan: 'Plan mode'
}

const ALWAYS_ALLOWED_OPTIONS = [
  { type: 'read', label: 'Read / Search', icon: Search },
  { type: 'edit', label: 'Edits', icon: Pencil },
  { type: 'write', label: 'File writes', icon: FilePlus2 },
  { type: 'execute', label: 'Terminal', icon: TerminalSquare },
  { type: 'web', label: 'Web access', icon: Eye },
  { type: 'agent', label: 'Agents', icon: Cpu },
  { type: 'other', label: 'Other tools', icon: Wrench },
] as const

const MODEL_INFO = ([
  { id: 'opus' as ModelId, description: 'Most capable, complex tasks', badge: 'Best' },
  { id: 'sonnet' as ModelId, description: 'Fast & intelligent' },
  { id: 'haiku' as ModelId, description: 'Fastest, lightweight tasks' },
] as const).map((m) => ({ ...m, label: MODEL_LABELS[m.id] }))

interface OpenRouterModel {
  id: string
  name: string
  contextLength: number
  promptPrice: number
  completionPrice: number
}

// Cache OpenRouter models in module scope so we don't refetch every render
let orModelsCache: OpenRouterModel[] | null = null
let orModelsFetchPromise: Promise<OpenRouterModel[]> | null = null

async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (orModelsCache) return orModelsCache
  if (orModelsFetchPromise) return orModelsFetchPromise
  orModelsFetchPromise = fetch('https://openrouter.ai/api/v1/models')
    .then((r) => r.json())
    .then((json) => {
      const models: OpenRouterModel[] = (json.data || [])
        .map((m: Record<string, unknown>) => ({
          id: String(m.id || ''),
          name: String(m.name || m.id || ''),
          contextLength: Number((m as Record<string, unknown>).context_length || 0),
          promptPrice: Number((m.pricing as Record<string, unknown>)?.prompt || 0),
          completionPrice: Number((m.pricing as Record<string, unknown>)?.completion || 0),
        }))
        .filter((m: OpenRouterModel) => m.id)
        .sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name))
      orModelsCache = models
      return models
    })
    .catch(() => {
      orModelsFetchPromise = null
      return []
    })
  return orModelsFetchPromise
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  const perMillion = price * 1_000_000
  if (perMillion < 0.01) return '<$0.01/M'
  if (perMillion < 1) return `$${perMillion.toFixed(2)}/M`
  return `$${perMillion.toFixed(1)}/M`
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

// Context window limits per model (tokens)
const MODEL_SHORT_LABELS: Record<ModelId, string> = {
  opus: 'Opus 4.6',
  sonnet: 'Sonnet 4.6',
  haiku: 'Haiku 4.5'
}

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  opus: 1_000_000,
  sonnet: 200_000,
  haiku: 200_000
}

function getContextStatus(tokens: number, model: string): { percent: number; level: 'ok' | 'moderate' | 'warning' | 'critical'; label: string; color: string } {
  const limit = MODEL_CONTEXT_LIMITS[model] || 200_000
  const percent = Math.min((tokens / limit) * 100, 100)
  if (percent >= 90) return { percent, level: 'critical', label: `${Math.round(percent)}% context used`, color: 'text-red-400' }
  if (percent >= 75) return { percent, level: 'warning', label: `${Math.round(percent)}% context used`, color: 'text-orange-400' }
  if (percent >= 50) return { percent, level: 'moderate', label: `${Math.round(percent)}% context used`, color: 'text-yellow-400' }
  return { percent, level: 'ok', label: `${Math.round(percent)}% context used`, color: 'text-td-muted' }
}

function OpenRouterModelPicker({
  customModel,
  onCustomModelChange,
}: {
  customModel: string
  onCustomModelChange: (m: string) => void
}) {
  const [models, setModels] = useState<OpenRouterModel[]>(orModelsCache || [])
  const [loading, setLoading] = useState(!orModelsCache)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (orModelsCache) { setModels(orModelsCache); setLoading(false); return }
    fetchOpenRouterModels().then((m) => { setModels(m); setLoading(false) })
  }, [])

  useEffect(() => {
    if (expanded && searchRef.current) searchRef.current.focus()
  }, [expanded])

  const filtered = useMemo(() => {
    if (!search.trim()) return models.slice(0, 50)
    const q = search.toLowerCase()
    return models.filter((m) =>
      m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    ).slice(0, 50)
  }, [models, search])

  const selectedInfo = models.find((m) => m.id === customModel)

  if (!expanded) {
    return (
      <div>
        <label className="text-[10px] font-medium text-td-muted uppercase tracking-wider mb-1.5 block">
          Model
        </label>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            'w-full flex items-center gap-2 bg-td-bg border rounded-lg px-3 py-2 text-left transition-all',
            customModel ? 'border-td-accent/30' : 'border-td-border hover:border-td-muted'
          )}
        >
          <Cpu className="h-3.5 w-3.5 text-td-muted shrink-0" />
          <span className={cn('flex-1 text-xs truncate', customModel ? 'text-td-text font-medium' : 'text-td-muted')}>
            {selectedInfo?.name || customModel || 'Select a model...'}
          </span>
          {selectedInfo && (
            <span className="text-[9px] text-td-muted shrink-0">{formatContext(selectedInfo.contextLength)} ctx</span>
          )}
          <ChevronDown className="h-3 w-3 text-td-muted shrink-0" />
        </button>
        {customModel && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-td-muted font-mono truncate">{customModel}</span>
            <button
              type="button"
              onClick={() => onCustomModelChange('')}
              className="text-td-muted hover:text-red-400 transition-colors shrink-0"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-medium text-td-muted uppercase tracking-wider">Model</label>
        <button
          type="button"
          onClick={() => { setExpanded(false); setSearch('') }}
          className="text-td-muted hover:text-td-text transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-td-muted" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models..."
          className="w-full bg-td-bg border border-td-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-td-text placeholder-td-muted/50 outline-none focus:border-td-accent/50 focus:ring-1 focus:ring-td-accent/20 transition-all"
        />
      </div>

      {/* Model list */}
      <div className="max-h-52 overflow-y-auto rounded-lg border border-td-border bg-td-bg">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-td-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading models...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-td-muted">
            {search ? 'No models match your search' : 'No models available'}
          </div>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onCustomModelChange(m.id); setExpanded(false); setSearch('') }}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors border-b border-td-border/50 last:border-b-0',
                m.id === customModel
                  ? 'bg-td-accent/10'
                  : 'hover:bg-td-hover'
              )}
            >
              {m.id === customModel
                ? <CircleCheck className="h-3 w-3 text-td-accent shrink-0" />
                : <Cpu className="h-3 w-3 text-td-muted shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-td-text truncate">{m.name}</div>
                <div className="text-[9px] text-td-muted font-mono truncate">{m.id}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[9px] text-td-muted">{formatContext(m.contextLength)}</div>
                <div className="flex items-center gap-0.5 text-[9px] text-emerald-400">
                  <DollarSign className="h-2 w-2" />
                  {formatPrice(m.promptPrice)}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Manual input fallback */}
      <div className="mt-2">
        <input
          type="text"
          value={customModel}
          onChange={(e) => onCustomModelChange(e.target.value)}
          placeholder="Or type model ID manually..."
          className="w-full bg-td-bg border border-td-border rounded-lg px-3 py-1.5 text-[10px] text-td-text placeholder-td-muted/50 outline-none focus:border-td-accent/50 transition-all font-mono"
        />
      </div>
    </div>
  )
}

function BranchPicker({
  currentBranch, projectPath, onBranchChange
}: {
  currentBranch: string
  projectPath: string | null
  onBranchChange: (branch: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !projectPath) return
    setLoading(true)
    setSearch('')
    window.api.gitBranches(projectPath).then((result) => {
      if (result.success) setBranches(result.branches)
      setLoading(false)
    })
  }, [open, projectPath])

  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return branches
    const q = search.toLowerCase()
    return branches.filter(b => b.name.toLowerCase().includes(q))
  }, [branches, search])

  const exactMatch = branches.some(b => b.name === search.trim())

  const handleSwitch = async (branch: string) => {
    if (!projectPath || branch === currentBranch) { setOpen(false); return }
    const result = await window.api.gitCheckout(projectPath, branch)
    if (result.success) {
      onBranchChange(branch)
    }
    setOpen(false)
  }

  const handleCreate = async () => {
    if (!projectPath || !search.trim()) return
    setCreating(true)
    const result = await window.api.gitCreateBranch(projectPath, search.trim())
    if (result.success) {
      onBranchChange(search.trim())
    }
    setCreating(false)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-td-text font-semibold hover:text-td-accent transition-colors cursor-pointer"
        >
          {currentBranch}
          <ChevronDown className="h-2.5 w-2.5 text-td-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-td-muted" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (filtered.length > 0) handleSwitch(filtered[0].name)
                  else if (search.trim()) handleCreate()
                }
              }}
              placeholder="Search or create branch..."
              className="w-full bg-td-bg border border-td-border rounded-md pl-7 pr-3 py-1.5 text-xs text-td-text placeholder-td-muted/50 outline-none focus:border-td-accent/50"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto border-t border-td-border/50">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-td-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </div>
          ) : filtered.length === 0 && !search.trim() ? (
            <div className="px-3 py-3 text-xs text-td-muted text-center">No branches found</div>
          ) : (
            <>
              {filtered.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                    b.name === currentBranch
                      ? 'bg-td-accent/10 text-td-text'
                      : 'text-td-text-secondary hover:bg-td-hover'
                  )}
                  onClick={() => handleSwitch(b.name)}
                >
                  <GitBranch className="h-3 w-3 text-td-muted shrink-0" />
                  <span className="flex-1 truncate font-mono">{b.name}</span>
                  {b.name === currentBranch && <Check className="h-3 w-3 text-td-accent shrink-0" />}
                </button>
              ))}
              {search.trim() && !exactMatch && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-emerald-400 hover:bg-td-hover transition-colors border-t border-td-border/50"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating
                    ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    : <Plus className="h-3 w-3 shrink-0" />
                  }
                  <span className="font-mono truncate">Create &ldquo;{search.trim()}&rdquo;</span>
                </button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ModelConfigPopover({
  selectedModel, onModelChange,
  customModel, onCustomModelChange,
}: {
  selectedModel: ModelId
  onModelChange: (m: ModelId) => void
  customModel: string
  onCustomModelChange: (m: string) => void
}) {
  const shortLabel = MODEL_SHORT_LABELS[selectedModel]
  const ctxLabel = formatContext(MODEL_CONTEXT_LIMITS[selectedModel] || 200_000)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-td-muted hover:text-td-text font-medium px-2">
          {customModel
            ? <span className="truncate max-w-[140px] font-mono text-[11px]">{customModel.split('/').pop()}</span>
            : <span>{shortLabel} {ctxLabel}</span>
          }
          <ChevronDown className="h-2.5 w-2.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0">
        {/* Model cards */}
        <div className="p-3 pb-2">
          <div className="text-[11px] font-medium text-td-muted uppercase tracking-wider mb-2">Model</div>
          <div className="space-y-1">
            {MODEL_INFO.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onModelChange(m.id); onCustomModelChange('') }}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-all',
                  selectedModel === m.id && !customModel
                    ? 'bg-td-accent/10 border border-td-accent/30'
                    : 'hover:bg-td-hover border border-transparent'
                )}
              >
                <div className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
                  selectedModel === m.id && !customModel ? 'bg-td-accent/20' : 'bg-td-bg'
                )}>
                  {selectedModel === m.id && !customModel
                    ? <CircleCheck className="h-3.5 w-3.5 text-td-accent" />
                    : <Cpu className="h-3.5 w-3.5 text-td-muted" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-xs font-medium', selectedModel === m.id && !customModel ? 'text-td-text' : 'text-td-text-secondary')}>
                      {m.label}
                    </span>
                    {m.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-td-muted">{m.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="h-px bg-td-border" />

        {/* ACP authentication info */}
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg bg-td-bg px-3 py-2.5">
            <div className="h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CircleCheck className="h-3 w-3 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs text-td-text font-medium">Using Claude CLI authentication</div>
              <div className="text-[10px] text-td-muted">Your subscription plan applies</div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const BORDER_COLORS: Record<string, string> = {
  full: '#10b981',
  plan: '#3b82f6',
  approve: '#f59e0b',
  default: '#6b7280'
}

function AnimatedBorder({ permissionMode, isDragging, children }: {
  permissionMode: PermissionMode
  isDragging: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const angle = useRef(0)
  const raf = useRef(0)

  const color = isDragging ? '#3b82f6' : (BORDER_COLORS[permissionMode] || BORDER_COLORS.default)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const tick = () => {
      angle.current = (angle.current + 0.42) % 360
      el.style.background = `conic-gradient(from ${angle.current}deg, ${color}20 0deg, ${color}20 140deg, ${color} 180deg, ${color}20 220deg, ${color}20 360deg)`
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [color])

  return (
    <div
      ref={ref}
      className="rounded-xl p-[1.5px]"
      style={{ background: `${color}20` }}
    >
      {children}
    </div>
  )
}

function DiffFilesPopover({ projectPath, children }: { projectPath: string | null; children: React.ReactNode }) {
  const [files, setFiles] = useState<{ file: string; additions: number; deletions: number }[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || !projectPath) return
    window.api.gitDiffFiles(projectPath).then(setFiles)
  }, [open, projectPath])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[360px] p-0">
        <div className="px-3 py-2 border-b border-td-border">
          <span className="text-xs font-medium text-td-text">Changed files</span>
          <span className="text-[10px] text-td-muted ml-2">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="px-3 py-4 text-xs text-td-muted text-center">No changes</div>
          ) : (
            files.map((f) => (
              <div key={f.file} className="flex items-center gap-2 px-3 py-1.5 hover:bg-td-hover/50 text-xs">
                <span className="truncate flex-1 min-w-0 text-td-text-secondary font-mono">{f.file}</span>
                <span className="shrink-0 font-mono tabular-nums text-[10px]">
                  {f.additions > 0 && <span className="text-emerald-400">+{f.additions}</span>}
                  {f.additions > 0 && f.deletions > 0 && ' '}
                  {f.deletions > 0 && <span className="text-red-400">-{f.deletions}</span>}
                </span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface Worktree {
  path: string
  branch: string
  bare: boolean
  current: boolean
  diffStats?: { additions: number; deletions: number }
}

function WorktreeManager({
  projectPath, worktreePath, conversationId,
  onCreate, onSelect, onRemove, children
}: {
  projectPath: string | null
  worktreePath: string | null
  conversationId: string | null
  onCreate: (branchName: string) => Promise<{ success: boolean; error?: string }>
  onSelect: (path: string | null) => void
  onRemove: (path: string) => Promise<{ success: boolean; error?: string }>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    const result = await window.api.gitWorktreeList(projectPath)
    if (result.success) {
      // Fetch diff stats for each non-bare worktree
      const withStats = await Promise.all(
        result.worktrees.map(async (wt) => {
          if (wt.bare || wt.current) return { ...wt }
          try {
            const stats = await window.api.gitDiffStats(wt.path)
            return { ...wt, diffStats: stats }
          } catch {
            return { ...wt }
          }
        })
      )
      setWorktrees(withStats)
    }
    setLoading(false)
  }, [projectPath])

  useEffect(() => {
    if (open) {
      refresh()
      setError(null)
      setCreating(false)
      setNewBranch('')
    }
  }, [open, refresh])

  const handleCreate = async () => {
    const branch = newBranch.trim()
    if (!branch) return
    setError(null)
    const result = await onCreate(branch)
    if (result.success) {
      setCreating(false)
      setNewBranch('')
      refresh()
    } else {
      setError(result.error || 'Failed to create worktree')
    }
  }

  const handleRemove = async (path: string) => {
    setError(null)
    const result = await onRemove(path)
    if (result.success) {
      refresh()
    } else {
      setError(result.error || 'Failed to remove worktree')
    }
  }

  // Filter: show non-bare, non-current worktrees (the ones td-ide manages)
  const managedWorktrees = worktrees.filter((wt) => !wt.bare && !wt.current)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[340px] p-0">
        <div className="px-3 py-2 border-b border-td-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitFork className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs font-medium text-td-text">Worktrees</span>
            <span className="text-[10px] text-td-muted">{managedWorktrees.length}</span>
          </div>
          {!creating && (
            <button
              type="button"
              className="text-[10px] text-td-accent hover:text-td-text transition-colors flex items-center gap-1"
              onClick={() => { setCreating(true); setTimeout(() => inputRef.current?.focus(), 50) }}
            >
              <Plus className="h-3 w-3" /> New
            </button>
          )}
        </div>

        {creating && (
          <div className="px-3 py-2 border-b border-td-border">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="Branch name..."
                className="flex-1 bg-td-bg rounded px-2 py-1 text-xs text-td-text border border-td-border outline-none focus:border-td-accent"
              />
              <button type="button" onClick={handleCreate} className="text-xs text-td-accent hover:text-td-text">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setCreating(false)} className="text-xs text-td-muted hover:text-td-text">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-1.5 text-[10px] text-red-400 bg-red-500/5 border-b border-td-border">
            {error}
          </div>
        )}

        <div className="max-h-[240px] overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-xs text-td-muted text-center flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          ) : managedWorktrees.length === 0 ? (
            <div className="px-3 py-4 text-xs text-td-muted text-center">
              No worktrees. Create one to isolate changes.
            </div>
          ) : (
            managedWorktrees.map((wt) => {
              const isActive = worktreePath === wt.path
              const hasChanges = wt.diffStats && (wt.diffStats.additions > 0 || wt.diffStats.deletions > 0)
              return (
                <div
                  key={wt.path}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-xs group transition-colors',
                    isActive ? 'bg-purple-500/10' : 'hover:bg-td-hover/50'
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left flex items-center gap-2"
                    onClick={() => {
                      onSelect(isActive ? null : wt.path)
                      setOpen(false)
                    }}
                  >
                    <GitBranch className={cn('h-3 w-3 shrink-0', isActive ? 'text-purple-400' : 'text-td-muted')} />
                    <span className={cn('truncate font-mono', isActive ? 'text-purple-400' : 'text-td-text-secondary')}>
                      {wt.branch}
                    </span>
                    {isActive && <span className="text-[9px] text-purple-400/70 uppercase tracking-wider shrink-0">active</span>}
                  </button>
                  {hasChanges && (
                    <span className="shrink-0 font-mono tabular-nums text-[10px]">
                      <span className="text-emerald-400">+{wt.diffStats!.additions}</span>
                      {' '}
                      <span className="text-red-400">-{wt.diffStats!.deletions}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    className={cn(
                      'shrink-0 text-td-muted hover:text-red-400 transition-colors',
                      isActive ? 'opacity-50 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'
                    )}
                    onClick={(e) => { e.stopPropagation(); if (!isActive) handleRemove(wt.path) }}
                    disabled={isActive}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {worktreePath && conversationId && (
          <div className="px-3 py-1.5 border-t border-td-border">
            <button
              type="button"
              className="text-[10px] text-td-muted hover:text-td-text transition-colors"
              onClick={() => { onSelect(null); setOpen(false) }}
            >
              Detach from worktree
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function InputBar({
  conversationId, onSend, onCancel, onNewChat, onClearConversation,
  onOpenSettings, onOpenInExplorer, onOpenInTerminal, onAddFile,
  isLoading, queueLength, queuedMessages, selectedModel, onModelChange,
  effortLevel, onEffortChange, permissionMode, onPermissionModeChange,
  disabledTools, onToggleTool, onArchiveConversation,
  onShowUsage,
  apiMode, onApiModeChange, apiProvider, onApiProviderChange,
  apiKey, onApiKeyChange, customModel, onCustomModelChange,
  contextTokens, conversationUsage, gitBranch, gitDiffStats, onCommitChanges,
  projectPath, onBranchChange, worktreePath, messageHistory,
  onCreateWorktree, onSelectWorktree, onRemoveWorktree,
  terminalOpen, onToggleTerminal,
  shellSession, onShellSession,
  backgroundSessions, onCloseBackgroundSession,
  alwaysAllowedTypes, onToggleAlwaysAllowed
}: InputBarProps): JSX.Element {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  // shellSession is now lifted to App.tsx via props (shellSession, onShellSession)
  const richInputRef = useRef<RichInputHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const drafts = useRef<Map<string, Draft>>(new Map())
  const historyIndex = useRef(-1)
  const historyDraft = useRef('')
  const prevConvId = useRef<string | null>(null)

  const status = isLoading ? 'streaming' : 'ready'

  // Build slash commands with categories
  const slashCommands: SlashCommand[] = useMemo(() => [
    // ── Chat ──
    {
      name: 'new',
      description: 'Start a new chat',
      icon: <MessageSquarePlus className="h-3.5 w-3.5 text-td-accent" />,
      category: 'chat' as SlashCategory,
      action: () => onNewChat()
    },
    {
      name: 'clear',
      description: 'Clear current conversation',
      icon: <Eraser className="h-3.5 w-3.5 text-red-400" />,
      category: 'chat' as SlashCategory,
      action: () => onClearConversation()
    },
    {
      name: 'compact',
      description: 'Summarize conversation to save context',
      icon: <Minimize2 className="h-3.5 w-3.5 text-purple-400" />,
      category: 'chat' as SlashCategory,
      action: () => onSend('/compact')
    },
    {
      name: 'archive',
      description: 'Archive current conversation',
      icon: <Archive className="h-3.5 w-3.5 text-amber-400" />,
      category: 'chat' as SlashCategory,
      action: () => onArchiveConversation()
    },

    // ── Config ──
    {
      name: 'model',
      description: 'Switch Claude model',
      icon: <Sparkles className="h-3.5 w-3.5 text-orange-400" />,
      category: 'config' as SlashCategory,
      badge: MODEL_LABELS[selectedModel],
      subOptions: [
        { value: 'opus', label: 'Claude Opus 4.6', current: selectedModel === 'opus' },
        { value: 'sonnet', label: 'Claude Sonnet 4.6', current: selectedModel === 'sonnet' },
        { value: 'haiku', label: 'Claude Haiku 4.5', current: selectedModel === 'haiku' },
      ],
      action: (arg) => { if (arg && ['opus', 'sonnet', 'haiku'].includes(arg)) onModelChange(arg as ModelId) }
    },
    {
      name: 'effort',
      description: 'Set thinking effort level',
      icon: <Gauge className="h-3.5 w-3.5 text-blue-400" />,
      category: 'config' as SlashCategory,
      badge: EFFORT_LABELS[effortLevel],
      subOptions: [
        { value: 'max', label: 'Max', current: effortLevel === 'max' },
        { value: 'high', label: 'High', current: effortLevel === 'high' },
        { value: 'medium', label: 'Medium', current: effortLevel === 'medium' },
        { value: 'low', label: 'Low', current: effortLevel === 'low' },
      ],
      action: (arg) => { if (arg && ['low', 'medium', 'high', 'max'].includes(arg)) onEffortChange(arg as EffortLevel) }
    },
    {
      name: 'permission',
      description: 'Change permission mode',
      icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />,
      category: 'config' as SlashCategory,
      badge: PERMISSION_LABELS[permissionMode],
      subOptions: [
        { value: 'full', label: 'Full access', current: permissionMode === 'full' },
        { value: 'approve', label: 'Approve edits', current: permissionMode === 'approve' },
        { value: 'plan', label: 'Plan mode', current: permissionMode === 'plan' },
      ],
      action: (arg) => { if (arg && ['full', 'approve', 'plan'].includes(arg)) onPermissionModeChange(arg as PermissionMode) }
    },
    {
      name: 'theme',
      description: 'Toggle dark / light mode',
      icon: document.documentElement.classList.contains('dark')
        ? <Sun className="h-3.5 w-3.5 text-yellow-400" />
        : <Moon className="h-3.5 w-3.5 text-indigo-400" />,
      category: 'config' as SlashCategory,
      badge: document.documentElement.classList.contains('dark') ? 'Dark' : 'Light',
      action: () => {
        // Toggle theme via the same mechanism as sidebar
        document.documentElement.classList.toggle('dark')
        localStorage.setItem('td-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light')
      }
    },
    {
      name: 'settings',
      description: 'Open settings panel',
      icon: <Settings className="h-3.5 w-3.5 text-td-muted" />,
      category: 'config' as SlashCategory,
      action: () => onOpenSettings()
    },

    // ── Project ──
    {
      name: 'add-file',
      description: 'Add a file to the conversation',
      icon: <FileCode className="h-3.5 w-3.5 text-cyan-400" />,
      category: 'project' as SlashCategory,
      action: () => onAddFile()
    },
    {
      name: 'explorer',
      description: 'Open project in file explorer',
      icon: <FolderOpen className="h-3.5 w-3.5 text-td-muted" />,
      category: 'project' as SlashCategory,
      action: () => onOpenInExplorer()
    },
    {
      name: 'terminal',
      description: 'Open project in terminal',
      icon: <Terminal className="h-3.5 w-3.5 text-td-muted" />,
      category: 'project' as SlashCategory,
      action: () => onOpenInTerminal()
    },
    {
      name: 'init',
      description: 'Create CLAUDE.md for this project',
      icon: <FileCode className="h-3.5 w-3.5 text-orange-400" />,
      category: 'project' as SlashCategory,
      action: () => onSend('Please create a CLAUDE.md file in the project root with best practices, project conventions, and a brief description of the codebase.')
    },

    // ── Automation ──
    {
      name: 'loop',
      description: 'Run a prompt on a recurring interval',
      icon: <Timer className="h-3.5 w-3.5 text-amber-400" />,
      category: 'automation' as SlashCategory,
      action: (arg) => {
        // Format: /loop [interval] [prompt] — e.g. "/loop 5m check build status"
        // If no arg, send a helpful prompt
        if (arg) {
          onSend(`/loop ${arg}`)
        } else {
          setStatusMsg('Usage: /loop 5m <prompt> — runs a prompt every N minutes')
          setTimeout(() => setStatusMsg(null), 4000)
        }
      }
    },
    {
      name: 'review',
      description: 'Review recent code changes',
      icon: <Code2 className="h-3.5 w-3.5 text-cyan-400" />,
      category: 'automation' as SlashCategory,
      action: () => onSend('Please review my recent code changes. Run git diff to see what changed, then provide feedback on code quality, potential bugs, and improvements.')
    },
    {
      name: 'simplify',
      description: 'Review changed code for issues and improvements',
      icon: <RefreshCw className="h-3.5 w-3.5 text-teal-400" />,
      category: 'automation' as SlashCategory,
      action: () => onSend('/simplify')
    },
    {
      name: 'btw',
      description: 'Add context or a follow-up instruction',
      icon: <HelpCircle className="h-3.5 w-3.5 text-violet-400" />,
      category: 'automation' as SlashCategory,
      action: (arg) => {
        if (arg) {
          onSend(`By the way: ${arg}`)
        } else {
          setStatusMsg('Usage: /btw <context> — adds context to the conversation')
          setTimeout(() => setStatusMsg(null), 4000)
        }
      }
    },
    {
      name: 'bug',
      description: 'Report or investigate a bug',
      icon: <Bug className="h-3.5 w-3.5 text-red-400" />,
      category: 'automation' as SlashCategory,
      action: (arg) => onSend(arg
        ? `Please help me investigate and fix this bug: ${arg}`
        : 'Please help me investigate and fix the following bug:')
    },

    // ── Info ──
    {
      name: 'usage',
      description: 'Show Claude Code subscription usage (coming soon)',
      icon: <BarChart3 className="h-3.5 w-3.5 text-green-400" />,
      category: 'info' as SlashCategory,
      action: () => setStatusMsg('Usage tracking is coming soon')
    },
    {
      name: 'status',
      description: 'Show current configuration',
      icon: <Info className="h-3.5 w-3.5 text-td-muted" />,
      category: 'info' as SlashCategory,
      action: () => {
        setStatusMsg(`Model: ${MODEL_LABELS[selectedModel]}  |  Effort: ${EFFORT_LABELS[effortLevel]}  |  Mode: ${PERMISSION_LABELS[permissionMode]}${disabledTools.size > 0 ? `  |  Disabled tools: ${disabledTools.size}` : ''}`)
        setTimeout(() => setStatusMsg(null), 4000)
      }
    },
    {
      name: 'keybindings',
      description: 'Show keyboard shortcuts',
      icon: <Keyboard className="h-3.5 w-3.5 text-td-muted" />,
      category: 'info' as SlashCategory,
      action: () => {
        setStatusMsg('⌘B: Sidebar  |  ⌘N: New chat  |  ⌘1-9: Switch tab  |  ⌘,: Settings  |  /: Commands')
        setTimeout(() => setStatusMsg(null), 5000)
      }
    },
    {
      name: 'claude-api',
      description: 'Get help building with the Claude API',
      icon: <BookOpen className="h-3.5 w-3.5 text-purple-400" />,
      category: 'info' as SlashCategory,
      action: () => onSend('I want to build something with the Claude API or Anthropic SDK. Please help me get started.')
    },
    {
      name: 'help',
      description: 'Show available commands',
      icon: <HelpCircle className="h-3.5 w-3.5 text-td-muted" />,
      category: 'info' as SlashCategory,
      action: () => {} // just shows the menu
    },
  ], [onModelChange, onEffortChange, onPermissionModeChange, onNewChat, onClearConversation, onArchiveConversation, onOpenSettings, onOpenInExplorer, onOpenInTerminal, onAddFile, onSend, onShowUsage, selectedModel, effortLevel, permissionMode, disabledTools])

  // Parse slash input
  const slashParse = useMemo(() => {
    const trimmed = text.trimStart()
    if (!trimmed.startsWith('/')) return null
    const hasSpace = trimmed.includes(' ')
    const parts = trimmed.slice(1).split(/\s+/)
    const cmdName = parts[0]?.toLowerCase() || ''
    const arg = parts[1]?.toLowerCase() || ''
    // Full rest of text after "/command "
    const restIdx = trimmed.indexOf(' ')
    const rest = restIdx >= 0 ? trimmed.slice(restIdx + 1).trim() : ''
    return { cmdName, arg, hasSpace, rest }
  }, [text])

  // Detect shell command mode (! prefix, but not !!)
  const shellMode = useMemo(() => {
    const trimmed = text.trimStart()
    if (!trimmed.startsWith('!') || trimmed.startsWith('!!') || trimmed.length <= 1) return null
    return { command: trimmed.slice(1) }
  }, [text])

  // Detect terminal session mode (!! prefix)
  const terminalMode = useMemo(() => {
    const trimmed = text.trimStart()
    if (!trimmed.startsWith('!!') || trimmed.length <= 2) return null
    return { command: trimmed.slice(2) }
  }, [text])

  // Build menu items with category grouping
  const menuItems = useMemo(() => {
    if (!slashParse) return []
    const { cmdName, arg, hasSpace } = slashParse
    const exactCmd = slashCommands.find((c) => c.name === cmdName)

    // Sub-options mode (e.g. "/model ")
    if (exactCmd?.subOptions && hasSpace) {
      const filtered = arg
        ? exactCmd.subOptions.filter((o) => o.value.startsWith(arg))
        : exactCmd.subOptions
      return filtered.map((o) => ({
        key: o.value, label: o.label, isSub: true, cmd: exactCmd,
        current: o.current, categoryHeader: undefined as string | undefined
      }))
    }

    // Filter commands by prefix, add category headers
    const filtered = slashCommands.filter((c) => c.name.startsWith(cmdName))
    const items: { key: string; label: string; description?: string; icon?: React.ReactNode; badge?: string; isSub: boolean; cmd: SlashCommand; current?: boolean; categoryHeader?: string }[] = []
    let lastCat = ''
    for (const c of filtered) {
      const header = c.category !== lastCat ? CATEGORY_LABELS[c.category] : undefined
      lastCat = c.category
      items.push({
        key: c.name, label: `/${c.name}`, description: c.description,
        icon: c.icon, badge: c.badge, isSub: false, cmd: c, categoryHeader: header
      })
    }
    return items
  }, [slashParse, slashCommands])

  const showSlashMenu = menuItems.length > 0

  // Reset index when items change
  useEffect(() => { setSlashIdx(0) }, [menuItems.length, showSlashMenu])

  // Scroll active item into view
  useEffect(() => {
    if (slashMenuRef.current && slashIdx >= 0) {
      const items = slashMenuRef.current.querySelectorAll('[data-slash-item]')
      const el = items[slashIdx] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [slashIdx])

  // Execute slash
  const executeSlash = (item: (typeof menuItems)[number]) => {
    if (item.isSub) {
      item.cmd.action(item.key)
    } else if (item.cmd.subOptions) {
      setText(`/${item.cmd.name} `)
      richInputRef.current?.focus()
      return
    } else {
      // Pass full rest of text for commands that accept inline args (e.g. /loop 5m ...)
      item.cmd.action(slashParse?.rest || undefined)
    }
    setText('')
    richInputRef.current?.focus()
  }

  // Save/restore drafts when conversation changes
  useEffect(() => {
    const key = conversationId || '__new__'
    const prevKey = prevConvId.current || '__new__'

    if (prevKey !== key) {
      // Save current draft for the previous conversation
      drafts.current.set(prevKey, { text, images })

      // Restore draft for the new conversation
      const saved = drafts.current.get(key)
      setText(saved?.text || '')
      setImages(saved?.images || [])
      historyIndex.current = -1
      historyDraft.current = ''
    }

    prevConvId.current = conversationId
  }, [conversationId])

  useEffect(() => { richInputRef.current?.focus() }, [conversationId])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    const newImages: ImageAttachment[] = []
    for (const file of imageFiles) {
      const dataUrl = await fileToDataUrl(file)
      newImages.push({ id: Date.now().toString() + Math.random(), name: file.name, dataUrl })
    }
    setImages((prev) => [...prev, ...newImages])
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()

    // If slash menu is open, execute selected item
    if (showSlashMenu && menuItems.length > 0) {
      const item = menuItems[Math.min(slashIdx, menuItems.length - 1)]
      if (item) { executeSlash(item); return }
    }

    // !! prefix: spawn interactive PTY in action bar (vs ! which runs inline in chat)
    if (terminalMode && projectPath) {
      onShellSession({ id: `shell-${Date.now()}`, command: terminalMode.command, exitCode: null, conversationId: conversationId, scope: 'conversation' })
      setText('')
      drafts.current.delete(conversationId || '__new__')
      // Rich input handles its own sizing
      return
    }

    if (!text.trim() && images.length === 0) {
      if (isLoading) onCancel()
      return
    }
    onSend(text, images)
    setText('')
    setImages([])
    historyIndex.current = -1
    historyDraft.current = ''
    drafts.current.delete(conversationId || '__new__')
    // Rich input handles its own sizing
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Slash menu navigation
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx((i) => Math.min(i + 1, menuItems.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab') { e.preventDefault(); const item = menuItems[slashIdx]; if (item) executeSlash(item); return }
      if (e.key === 'Escape') { e.preventDefault(); setText(''); return }
    }

    // History navigation — cursor at start for Up, at end for Down
    if (e.key === 'ArrowUp' && messageHistory.length > 0) {
      const ri = richInputRef.current
      if (ri && ri.isCursorAtStart()) {
        e.preventDefault()
        if (historyIndex.current === -1) {
          historyDraft.current = text
        }
        const nextIdx = Math.min(historyIndex.current + 1, messageHistory.length - 1)
        if (nextIdx !== historyIndex.current) {
          historyIndex.current = nextIdx
          const msg = messageHistory[messageHistory.length - 1 - nextIdx]
          setText(msg)
        }
        return
      }
    }
    if (e.key === 'ArrowDown' && historyIndex.current >= 0) {
      const ri = richInputRef.current
      if (ri && ri.isCursorAtEnd()) {
        e.preventDefault()
        const nextIdx = historyIndex.current - 1
        if (nextIdx < 0) {
          historyIndex.current = -1
          setText(historyDraft.current)
        } else {
          historyIndex.current = nextIdx
          setText(messageHistory[messageHistory.length - 1 - nextIdx])
        }
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Backspace' && !text && images.length > 0) {
      setImages((prev) => prev.slice(0, -1))
    }
  }

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[]
    await addFiles(files)
  }, [addFiles])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    await addFiles(e.dataTransfer.files)
  }, [addFiles])

  // Rich input handles its own auto-sizing

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-td-bg">
        {/* Shell session terminal (!! command) — outside form to avoid focus conflicts with textarea */}
        {shellSession && projectPath && (
          <div
            className="px-6 pb-2"
            style={{ display: shellSession.scope === 'global' || shellSession.conversationId === conversationId ? undefined : 'none' }}
          >
            <div className="max-w-3xl mx-auto">
              <ShellSessionBar
                sessionId={shellSession.id}
                command={shellSession.command}
                cwd={projectPath}
                scope={shellSession.scope}
                onScopeToggle={() => onShellSession({ ...shellSession, scope: shellSession.scope === 'global' ? 'conversation' : 'global' })}
                onClose={() => onShellSession(null)}
                onExit={(exitCode) => onShellSession(shellSession ? { ...shellSession, exitCode } : null)}
              />
            </div>
          </div>
        )}
        {/* Background command bars (Claude's run_in_background Bash/Agent calls) */}
        {backgroundSessions.filter(s => s.conversationId === conversationId).map(session => (
          <div key={session.id} className="px-6 pb-2">
            <div className="max-w-3xl mx-auto">
              <BackgroundCommandBar
                session={session}
                onClose={onCloseBackgroundSession}
              />
            </div>
          </div>
        ))}
        <div className="px-6 py-3">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="w-full">
            <div className="relative">
              {/* Slash command popup — outside overflow-hidden container */}
              {showSlashMenu && (
                <div
                  ref={slashMenuRef}
                  className="absolute bottom-full left-0 right-0 mb-1 max-h-80 overflow-y-auto rounded-lg border border-td-border bg-td-surface shadow-xl z-50"
                >
                  {/* Sub-option header */}
                  {menuItems[0]?.isSub && (
                    <div className="px-3 py-1.5 text-[11px] text-td-muted font-medium uppercase tracking-wider border-b border-td-border flex items-center gap-2">
                      <span>/{menuItems[0].cmd.name}</span>
                      {menuItems[0].cmd.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-td-accent/15 text-td-accent font-normal normal-case tracking-normal">
                          {menuItems[0].cmd.badge}
                        </span>
                      )}
                    </div>
                  )}
                  {menuItems.map((item, i) => (
                    <div key={item.key}>
                      {/* Category header */}
                      {item.categoryHeader && (
                        <div className="px-3 pt-2 pb-1 text-[10px] text-td-muted font-medium uppercase tracking-wider first:pt-1.5">
                          {item.categoryHeader}
                        </div>
                      )}
                      <button
                        type="button"
                        data-slash-item
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                          i === slashIdx ? 'bg-td-hover text-td-text' : 'text-td-text-secondary hover:bg-td-hover'
                        )}
                        onMouseEnter={() => setSlashIdx(i)}
                        onClick={() => executeSlash(item)}
                      >
                        {item.isSub ? (
                          <>
                            <Hash className="h-3.5 w-3.5 text-td-muted shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            {item.current && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
                          </>
                        ) : (
                          <>
                            {item.icon}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="font-medium">{item.label}</span>
                              {item.description && (
                                <span className="text-td-muted text-xs truncate">{item.description}</span>
                              )}
                            </div>
                            {item.badge && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-td-bg text-td-muted shrink-0">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                  {/* Keyboard hints */}
                  <div className="px-3 py-1.5 border-t border-td-border flex items-center gap-3 text-[10px] text-td-muted">
                    <span><kbd className="px-1 py-0.5 rounded bg-td-bg text-td-text-tertiary">↑↓</kbd> navigate</span>
                    <span><kbd className="px-1 py-0.5 rounded bg-td-bg text-td-text-tertiary">Tab</kbd> select</span>
                    <span><kbd className="px-1 py-0.5 rounded bg-td-bg text-td-text-tertiary">Enter</kbd> execute</span>
                    <span><kbd className="px-1 py-0.5 rounded bg-td-bg text-td-text-tertiary">Esc</kbd> close</span>
                  </div>
                </div>
              )}

              {/* Terminal session indicator — !! prefix */}
              {terminalMode && !showSlashMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-purple-500/30 bg-td-surface shadow-xl z-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Terminal className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span className="text-td-text font-medium">Terminal session</span>
                    <span className="text-td-muted text-xs truncate">{terminalMode.command}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-td-muted">
                    <span><kbd className="px-1 py-0.5 rounded bg-td-bg text-td-text-tertiary">Enter</kbd> launch</span>
                    <span>Interactive PTY session</span>
                  </div>
                </div>
              )}

              {/* Shell command indicator — ! prefix */}
              {shellMode && !showSlashMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-td-border bg-td-surface shadow-xl z-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Terminal className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                    <span className="text-td-text font-medium">Shell command</span>
                    <span className="text-td-muted text-xs truncate">{shellMode.command}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-td-muted">
                    <span><kbd className="px-1 py-0.5 rounded bg-td-bg text-td-text-tertiary">Enter</kbd> execute</span>
                    <span>Runs in project directory</span>
                  </div>
                </div>
              )}

              {/* Status toast */}
              {statusMsg && (
                <div className="absolute bottom-full left-0 right-0 mb-1 px-3 py-2 rounded-lg border border-td-border bg-td-surface shadow-xl z-50 text-xs text-td-text-secondary flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-td-accent shrink-0" />
                  {statusMsg}
                </div>
              )}

              <AnimatedBorder permissionMode={permissionMode} isDragging={isDragging}>
              <div
                className="rounded-xl overflow-hidden bg-td-input-bg"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >

              {/* Git info bar (above textarea) */}
              {gitBranch && (
                <div className="flex items-center justify-between px-4 py-2 border-b border-td-border/30 bg-td-bg">
                  <div className="flex items-center gap-2 text-xs">
                    <GitBranch className="h-3.5 w-3.5 text-td-muted" />
                    <span className="text-td-muted">Branch</span>
                    <span className="text-td-muted/50">&larr;</span>
                    <BranchPicker
                      currentBranch={gitBranch}
                      projectPath={projectPath}
                      onBranchChange={onBranchChange}
                    />
                    <WorktreeManager
                      projectPath={projectPath}
                      worktreePath={worktreePath}
                      conversationId={conversationId}
                      onCreate={onCreateWorktree}
                      onSelect={onSelectWorktree}
                      onRemove={onRemoveWorktree}
                    >
                      <button
                        type="button"
                        className={cn(
                          'flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border transition-colors',
                          worktreePath
                            ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                            : 'border-td-border/60 bg-td-bg/50 text-td-muted hover:text-td-text hover:border-td-muted'
                        )}
                      >
                        <GitFork className="h-3 w-3" />
                        {worktreePath
                          ? worktreePath.split('/').pop()
                          : 'Worktree'}
                      </button>
                    </WorktreeManager>
                  </div>
                  <div className="flex items-center gap-2">
                    {(gitDiffStats.additions > 0 || gitDiffStats.deletions > 0) && (
                      <>
                        <DiffFilesPopover projectPath={worktreePath || projectPath}>
                          <span className="text-[11px] px-2 py-0.5 rounded-md border border-td-border/60 bg-td-bg/50 font-mono tabular-nums cursor-pointer hover:border-td-accent/50 transition-colors">
                            <span className="text-emerald-400">+{gitDiffStats.additions}</span>
                            {' '}
                            <span className="text-red-400">-{gitDiffStats.deletions}</span>
                          </span>
                        </DiffFilesPopover>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-2.5 text-td-muted hover:text-td-text font-medium"
                          onClick={(e) => { e.preventDefault(); onCommitChanges() }}
                        >
                          Commit changes
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Image previews */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
                  {images.map((img) => (
                    <div key={img.id} className="relative group">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="h-16 w-16 rounded-lg object-cover border border-td-border"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white px-1 py-0.5 rounded-b-lg truncate">
                        {img.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Drop zone overlay */}
              {isDragging && (
                <div className="px-4 py-6 text-center text-sm text-td-accent">
                  <ImageIcon className="h-6 w-6 mx-auto mb-1" />
                  Drop images here
                </div>
              )}

              {/* Rich text input */}
              <RichInput
                ref={richInputRef}
                value={text}
                onChange={setText}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={permissionMode === 'plan' ? 'Describe what you want to plan...' : 'Type / for commands, or ask anything...'}
                className={cn(
                  'w-full px-4 pt-3 pb-2',
                  isDragging && 'hidden'
                )}
              />

              {/* Footer */}
              <div className="flex items-center justify-between px-2 py-1.5">
                {/* Left side: + button, permission mode */}
                <div className="flex items-center gap-0.5 min-w-0">
                  {/* Action menu with file upload */}
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-td-muted">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top">Add</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent side="top" align="start">
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="h-3.5 w-3.5 mr-2" />
                        Add photos or files
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        try {
                          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
                          const track = stream.getVideoTracks()[0]
                          const imageCapture = new (window as any).ImageCapture(track)
                          const blob = await imageCapture.grabFrame()
                          track.stop()
                          const canvas = document.createElement('canvas')
                          canvas.width = blob.width
                          canvas.height = blob.height
                          const ctx = canvas.getContext('2d')!
                          ctx.drawImage(blob, 0, 0)
                          const dataUrl = canvas.toDataURL('image/png')
                          setImages((prev) => [...prev, {
                            id: Date.now().toString(),
                            name: `screenshot-${Date.now()}.png`,
                            dataUrl
                          }])
                        } catch { /* user cancelled */ }
                      }}>
                        <Camera className="h-3.5 w-3.5 mr-2" />
                        Take screenshot
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
                  />

                  {/* Permission mode */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className={cn(
                        'h-7 text-xs gap-1.5 font-medium px-2 transition-colors',
                        permissionMode === 'full'
                          ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                          : permissionMode === 'approve'
                            ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                            : permissionMode === 'plan'
                              ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                              : 'text-td-muted hover:text-td-text'
                      )}>
                        {permissionMode === 'full' ? <ShieldCheck className="h-3 w-3" />
                          : permissionMode === 'approve' ? <ShieldCheck className="h-3 w-3" />
                          : permissionMode === 'plan' ? <MapIcon className="h-3 w-3" />
                          : <ShieldQuestion className="h-3 w-3" />}
                        {PERMISSION_LABELS[permissionMode]}
                        {alwaysAllowedTypes.size > 0 && permissionMode !== 'full' && (
                          <span className="text-emerald-400/70">+{alwaysAllowedTypes.size}</span>
                        )}
                        {disabledTools.size > 0 && <span className="text-td-muted">(-{disabledTools.size})</span>}
                        <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" className="min-w-[220px]">
                      <DropdownMenuLabel className="text-[10px] text-td-muted uppercase tracking-wider">Mode</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={permissionMode} onValueChange={(v) => onPermissionModeChange(v as PermissionMode)}>
                        <DropdownMenuRadioItem value="full">Full access</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="approve">Approve edits</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="plan">Plan mode</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                      {permissionMode !== 'full' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] text-td-muted uppercase tracking-wider">Always allowed</DropdownMenuLabel>
                          {ALWAYS_ALLOWED_OPTIONS.map(({ type, label, icon: Icon }) => (
                            <DropdownMenuCheckboxItem
                              key={type}
                              checked={alwaysAllowedTypes.has(type)}
                              onCheckedChange={() => onToggleAlwaysAllowed(type)}
                              onSelect={(e) => e.preventDefault()}
                            >
                              <span className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                              </span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Queued messages */}
                  {queuedMessages.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 overflow-x-auto">
                      <ListOrdered className="h-3 w-3 text-orange-400 shrink-0" />
                      {queuedMessages.map((msg, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono truncate max-w-[180px] shrink-0"
                        >
                          {msg.text.slice(0, 50)}{msg.text.length > 50 ? '...' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Context usage indicator — always visible */}
                  {(() => {
                    const ctx = getContextStatus(contextTokens, selectedModel)
                    const limit = MODEL_CONTEXT_LIMITS[selectedModel] || 200_000
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn('flex items-center gap-1 text-[10px] px-1.5 cursor-default', ctx.color)}>
                            <Gauge className="h-3 w-3 shrink-0" />
                            <span className="whitespace-nowrap">{formatContext(contextTokens)}/{formatContext(limit)}</span>
                            <div className="w-10 h-1 rounded-full bg-td-border overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  ctx.level === 'critical' ? 'bg-red-400' :
                                  ctx.level === 'warning' ? 'bg-orange-400' :
                                  ctx.level === 'moderate' ? 'bg-yellow-400' :
                                  'bg-emerald-400/60'
                                )}
                                style={{ width: `${Math.max(ctx.percent, 1)}%` }}
                              />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px]">
                          <div className="text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-4">
                              <span className="font-medium">Context</span>
                              <span className={ctx.color}>{formatContext(contextTokens)} / {formatContext(limit)} ({Math.round(ctx.percent)}%)</span>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full h-1.5 rounded-full bg-td-border overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  ctx.level === 'critical' ? 'bg-red-400' :
                                  ctx.level === 'warning' ? 'bg-orange-400' :
                                  ctx.level === 'moderate' ? 'bg-yellow-400' :
                                  'bg-emerald-400/60'
                                )}
                                style={{ width: `${Math.max(ctx.percent, 1)}%` }}
                              />
                            </div>
                            {/* Token breakdown */}
                            {conversationUsage && (
                              <div className="border-t border-td-border pt-1.5 space-y-0.5 text-td-muted">
                                <div className="flex justify-between"><span>Input</span><span className="text-td-text">{formatContext(conversationUsage.inputTokens)}</span></div>
                                <div className="flex justify-between"><span>Output</span><span className="text-td-text">{formatContext(conversationUsage.outputTokens)}</span></div>
                                {conversationUsage.cacheReadTokens > 0 && (
                                  <div className="flex justify-between"><span>Cache read</span><span className="text-td-text">{formatContext(conversationUsage.cacheReadTokens)}</span></div>
                                )}
                                {conversationUsage.cacheCreationTokens > 0 && (
                                  <div className="flex justify-between"><span>Cache write</span><span className="text-td-text">{formatContext(conversationUsage.cacheCreationTokens)}</span></div>
                                )}
                                {conversationUsage.turns > 0 && (
                                  <div className="flex justify-between"><span>Turns</span><span className="text-td-text">{conversationUsage.turns}</span></div>
                                )}
                                {conversationUsage.totalCostUsd > 0 && (
                                  <div className="flex justify-between"><span>Cost (API equiv.)</span><span className="text-emerald-400">${conversationUsage.totalCostUsd < 0.01 ? conversationUsage.totalCostUsd.toFixed(4) : conversationUsage.totalCostUsd.toFixed(2)}</span></div>
                                )}
                              </div>
                            )}
                            {ctx.level === 'critical' && (
                              <p className="text-red-400 border-t border-td-border pt-1">Context nearly full — start a new chat</p>
                            )}
                            {ctx.level === 'warning' && (
                              <p className="text-orange-400 border-t border-td-border pt-1">Consider starting a new chat soon</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })()}
                </div>

                {/* Right side: terminal + model selector + send button */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Global terminal toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7',
                          terminalOpen ? 'text-td-accent' : 'text-td-muted'
                        )}
                        onClick={onToggleTerminal}
                      >
                        <Terminal className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Terminal (Ctrl+`)</TooltipContent>
                  </Tooltip>

                  {/* Model selector (compact) */}
                  <ModelConfigPopover
                    selectedModel={selectedModel}
                    onModelChange={onModelChange}
                    customModel={customModel}
                    onCustomModelChange={onCustomModelChange}
                  />

                  {/* Submit / Stop — color matches permission mode */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {status === 'streaming' && !text.trim() && images.length === 0 ? (
                        <Button
                          type="button"
                          onClick={onCancel}
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-7 shrink-0 gap-1.5 px-2 rounded-lg',
                            permissionMode === 'full'
                              ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                              : permissionMode === 'plan'
                                ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                                : permissionMode === 'approve'
                                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                  : 'text-td-muted hover:text-td-text'
                          )}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <Square className="h-2.5 w-2.5 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          size="icon"
                          className={cn(
                            'h-7 w-7 rounded-full shrink-0 transition-all',
                            !(text.trim() || images.length > 0)
                              ? 'bg-td-muted/20 text-td-muted'
                              : permissionMode === 'full'
                                ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                                : permissionMode === 'plan'
                                  ? 'bg-blue-500 text-white hover:bg-blue-400'
                                  : permissionMode === 'approve'
                                    ? 'bg-amber-500 text-white hover:bg-amber-400'
                                    : 'bg-td-accent text-white hover:bg-td-accent/90'
                          )}
                          disabled={status === 'ready' && !text.trim() && images.length === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {status === 'streaming' && !text.trim() && images.length === 0 ? 'Stop generation' : isLoading ? 'Queue message' : 'Send message'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              </div>
              </AnimatedBorder>
            </div>
          </form>
        </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default InputBar
