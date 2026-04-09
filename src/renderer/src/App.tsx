import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import AppSidebar from './components/Sidebar'
import { SidebarProvider, useSidebar } from './components/ui/sidebar'
import TopBar from './components/TopBar'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import PermissionBanner from './components/PermissionBanner'
import PlanSidebar from './components/PlanSidebar'
import SettingsPage from './components/SettingsPage'
import TerminalPanel from './components/TerminalPanel'
import ResizeHandle from './components/ResizeHandle'
import UsageDialog from './components/UsageDialog'
import ApprovalWidget from './components/ApprovalWidget'
import type { DiffViewData } from './components/ApprovalWidget'
import DiffSidebar from './components/DiffSidebar'
import ToolDetailSidebar from './components/ToolDetailSidebar'
import ConversationTabs from './components/ConversationTabs'
import type { BackgroundSession } from './components/BackgroundCommandBar'
import type { AgentTask } from './components/AgentOrchestrationPanel'
import { useKeyboardShortcuts, mergeShortcuts, DEFAULT_SHORTCUTS, type ShortcutBinding, type ShortcutModifiers } from './hooks/useKeyboardShortcuts'

export interface ToolBlock {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ImageAttachment {
  id: string
  name: string
  dataUrl: string
  filePath?: string
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: ToolBlock }
  | { type: 'thinking'; thinking: string }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools: ToolBlock[]
  reasoning: string
  images: ImageAttachment[]
  contentBlocks: ContentBlock[]
  duration?: number
  timestamp: Date
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  archived: boolean
  titleEdited: boolean
  worktreePath: string | null
  createdAt: Date
}

export interface Project {
  id: string
  name: string
  path: string
  additionalPaths: string[]
  conversations: Conversation[]
}

export type ModelId = 'opus' | 'sonnet' | 'haiku'
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type PermissionMode = 'full' | 'default' | 'plan' | 'approve'
export type ApiProvider = 'anthropic' | 'openrouter'
export type ApiMode = 'subscription' | 'apikey'

export type PlanEntryStatus = 'pending' | 'in_progress' | 'completed'
export type PlanEntryPriority = 'high' | 'medium' | 'low'

export interface PlanEntry {
  content: string
  status: PlanEntryStatus
  priority: PlanEntryPriority
}

// ACP title for ExitPlanMode — handled by Plan Sidebar, hidden from chat
const EXIT_PLAN_MODE_TITLE = 'Ready to code?'

export interface ModelUsageEntry {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}

export interface ConversationUsage {
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  turns: number
  durationMs: number
  modelUsage: Record<string, ModelUsageEntry>
  rateLimitResetsAt?: number
}

export type ToolActionType = 'read' | 'edit' | 'write' | 'execute' | 'web' | 'agent' | 'other'
const EMPTY_ALLOWED_SET = new Set<string>()
const EMPTY_DENIALS: DeniedTool[] = []

/** Detect the permission action type from a tool name string */
export function getToolActionType(toolName: string): ToolActionType {
  const lower = toolName.toLowerCase()
  if (lower.includes('read') || lower.includes('glob') || lower.includes('grep') || lower.includes('search')) return 'read'
  if (lower.includes('edit')) return 'edit'
  if (lower.includes('write')) return 'write'
  if (lower.includes('bash') || lower.includes('execute')) return 'execute'
  if (lower.includes('webfetch') || lower.includes('websearch') || lower.includes('web_fetch') || lower.includes('web_search')) return 'web'
  if (lower.includes('agent')) return 'agent'
  return 'other'
}

export interface DeniedTool {
  tool_name: string
  tool_use_id: string
  tool_input: Record<string, unknown>
}

interface StreamBuffer {
  text: string
  tools: ToolBlock[]
  reasoning: string
  contentBlocks: ContentBlock[]
  assistantMsgId: string
  startedAt: number
  permissionMode: PermissionMode
}

function SidebarToggleBridge({ toggleRef }: { toggleRef: { current: (() => void) | null } }): null {
  const { toggleSidebar } = useSidebar()
  useEffect(() => { toggleRef.current = toggleSidebar }, [toggleSidebar, toggleRef])
  return null
}

function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const activeConversationIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
    setToolDetailTool(null)
  }, [activeConversationId])
  const [loadingConvs, setLoadingConvs] = useState<Set<string>>(new Set())
  const [recentlyRetitled, setRecentlyRetitled] = useState<Set<string>>(new Set())
  const [selectedModel, setSelectedModel] = useState<ModelId>('opus')
  const [apiMode, setApiMode] = useState<ApiMode>('subscription')
  const [apiProvider, setApiProvider] = useState<ApiProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [contentFontSize, setContentFontSize] = useState(14)
  const [effortLevel, setEffortLevel] = useState<EffortLevel>('high')
  const [perConvPermission, setPerConvPermission] = useState<Map<string, PermissionMode>>(new Map())
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set())
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [deniedCount, setDeniedCount] = useState(0)
  const [deniedConversationId, setDeniedConversationId] = useState<string | null>(null)
  const [pendingApprovalsMap, setPendingApprovalsMap] = useState<Map<string, DeniedTool[]>>(new Map())
  const [alwaysAllowedTypesMap, setAlwaysAllowedTypesMap] = useState<Map<string, Set<string>>>(new Map())
  const alwaysAllowedTypesRef = useRef(alwaysAllowedTypesMap)
  useEffect(() => { alwaysAllowedTypesRef.current = alwaysAllowedTypesMap }, [alwaysAllowedTypesMap])
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [gitDiffStats, setGitDiffStats] = useState<{ additions: number; deletions: number }>({ additions: 0, deletions: 0 })
  const [settingsOpen, setSettingsOpen] = useState<false | 'global' | 'project'>(false)
  const [customShortcuts, setCustomShortcuts] = useState<ShortcutBinding[] | null>(null)
  const [settingsProject, setSettingsProject] = useState<Project | null>(null)
  const [homedir, setHomedir] = useState('')
  const [planSidebarOpen, _setPlanSidebarOpen] = useState(false)
  const planSidebarOpenRef = useRef(false)
  const setPlanSidebarOpen = useCallback((open: boolean) => {
    planSidebarOpenRef.current = open
    _setPlanSidebarOpen(open)
  }, [])
  const [planContent, setPlanContent] = useState('')
  const [planEntries, setPlanEntries] = useState<PlanEntry[]>([])
  const [planConvId, _setPlanConvId] = useState<string | null>(null)
  const planConvIdRef = useRef<string | null>(null)
  const setPlanConvId = useCallback((id: string | null) => {
    planConvIdRef.current = id
    _setPlanConvId(id)
  }, [])
  const [pendingPlanApproval, setPendingPlanApproval] = useState<{ requestId: string; conversationId: string } | null>(null)
  const [diffViewData, setDiffViewData] = useState<DiffViewData | null>(null)
  const [toolDetailTool, setToolDetailTool] = useState<ToolBlock | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalPanelHeight, setTerminalPanelHeight] = useState(300)
  const [shellSession, setShellSession] = useState<{ id: string; command: string; exitCode: number | null; conversationId: string | null; scope: 'conversation' | 'global' } | null>(null)
  const [backgroundSessions, setBackgroundSessions] = useState<BackgroundSession[]>([])
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([])
  const [useWorktree, setUseWorktree] = useState(false)
  const [interruptedConvIds, setInterruptedConvIds] = useState<Set<string>>(new Set())
  const [usageOpen, setUsageOpen] = useState(false)
  const [stateRestored, setStateRestored] = useState(false)
  const [debugToast, setDebugToast] = useState<string | null>(null)
  // Per-conversation context token tracking (latest input_tokens = current context size)
  const [contextTokensMap, setContextTokensMap] = useState<Map<string, number>>(new Map())

  // Per-conversation usage tracking (state so UI re-renders on updates)
  const [usageMap, setUsageMap] = useState(new Map<string, ConversationUsage>())
  // Per-conversation plan entries (structured) and text fallback
  const planDrafts = useRef(new Map<string, string>())
  const planEntryDrafts = useRef(new Map<string, PlanEntry[]>())
  // Per-conversation stream buffers for parallel support
  const buffers = useRef(new Map<string, StreamBuffer>())
  const projectsRef = useRef(projects)
  useEffect(() => { projectsRef.current = projects }, [projects])
  useEffect(() => { window.api.getHomedir().then(setHomedir) }, [])

  // Track which conversations have had their messages loaded from DB
  const loadedConvs = useRef(new Set<string>())
  // Cache fetched messages to handle race between conversations and messages effects
  const messagesCache = useRef(new Map<string, Message[]>())
  // Store final assistant text per conversation for notification (buffer gets deleted before handleDone)
  const finalTexts = useRef(new Map<string, string>())
  // Track permission mode per conversation so handleDone can check plan mode after buffer is deleted
  const convPermissionModes = useRef(new Map<string, PermissionMode>())
  // Map tool call IDs to their tool name (Bash, Agent, etc.) for deferred background session creation
  const toolNameMapRef = useRef(new Map<string, string>())
  // Per-conversation message queue for queuing messages while Claude is working
  const messageQueue = useRef(new Map<string, { text: string; images: ImageAttachment[] }[]>())
  // Stable ref for processMessage so handleDone inside useEffect can call the latest version
  const processMessageRef = useRef<(text: string, images: ImageAttachment[], convId?: string) => void>(() => {})

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const activeConversation = activeProject?.conversations.find(
    (c) => c.id === activeConversationId
  )
  const activeConversations = useMemo(
    () => activeProject?.conversations.filter((c) => !c.archived) ?? [],
    [activeProject?.conversations]
  )
  const userMessageHistory = useMemo(
    () => activeConversation?.messages.filter((m) => m.role === 'user').map((m) => m.content) || [],
    [activeConversation?.messages]
  )
  const activeWorktreePath = activeConversation?.worktreePath ?? null
  const isLoading = activeConversationId ? loadingConvs.has(activeConversationId) : false

  // Per-conversation pending approvals — derived for active conversation
  const pendingApprovals = activeConversationId
    ? (pendingApprovalsMap.get(activeConversationId) ?? EMPTY_DENIALS)
    : EMPTY_DENIALS
  // Set of conversation IDs that have pending approvals (for sidebar indicator)
  const pendingPermissionConvIds = useMemo(
    () => new Set(Array.from(pendingApprovalsMap.keys()).filter((k) => (pendingApprovalsMap.get(k)?.length ?? 0) > 0)),
    [pendingApprovalsMap]
  )

  // Per-conversation permission mode (defaults to 'approve'), persisted across restarts
  const permissionMode: PermissionMode = activeConversationId
    ? (perConvPermission.get(activeConversationId) || 'approve')
    : (perConvPermission.get('__new__') || 'approve')
  const setPermissionMode = useCallback((mode: PermissionMode) => {
    const key = activeConversationId || '__new__'
    setPerConvPermission((prev) => {
      const next = new Map(prev)
      next.set(key, mode)
      // Persist to app state
      const obj: Record<string, string> = {}
      next.forEach((v, k) => { obj[k] = v })
      window.api.setAppState('convPermissions', JSON.stringify(obj))
      return next
    })
  }, [activeConversationId])

  // Current conversation's always-allowed action types
  const convKey = activeConversationId || '__new__'
  const currentAlwaysAllowed = useMemo(
    () => alwaysAllowedTypesMap.get(convKey) ?? EMPTY_ALLOWED_SET,
    [alwaysAllowedTypesMap, convKey]
  )
  const handleToggleAlwaysAllowed = useCallback((actionType: string) => {
    setAlwaysAllowedTypesMap((prev) => {
      const next = new Map(prev)
      const types = new Set(prev.get(convKey) || [])
      if (types.has(actionType)) types.delete(actionType)
      else types.add(actionType)
      next.set(convKey, types)
      return next
    })
  }, [convKey])

  // --- Load projects from DB on mount, then restore saved state ---
  useEffect(() => {
    const init = async () => {
      // Load projects
      const rows = await window.api.getProjects()
      const loaded: Project[] = (rows as { id: string; name: string; path: string; additionalPaths?: string; createdAt: Date }[]).map((r) => ({
        id: r.id,
        name: r.name,
        path: r.path,
        additionalPaths: JSON.parse(r.additionalPaths || '[]'),
        conversations: [],
        createdAt: r.createdAt
      }))
      setProjects(loaded)

      // Restore saved UI state
      const state = await window.api.getAllAppState()
      if (state.activeProjectId && loaded.some((p) => p.id === state.activeProjectId)) {
        setActiveProjectId(state.activeProjectId)
      }
      if (state.activeConversationId) {
        setActiveConversationId(state.activeConversationId)
      }
      if (state.selectedModel && ['opus', 'sonnet', 'haiku'].includes(state.selectedModel)) {
        setSelectedModel(state.selectedModel as ModelId)
      }
      if (state.effortLevel && ['low', 'medium', 'high', 'max'].includes(state.effortLevel)) {
        setEffortLevel(state.effortLevel as EffortLevel)
      }
      if (state.terminalOpen === 'true') {
        setTerminalOpen(true)
      }
      if (state.apiMode && ['subscription', 'apikey'].includes(state.apiMode)) {
        setApiMode(state.apiMode as ApiMode)
      }
      if (state.apiProvider && ['anthropic', 'openrouter'].includes(state.apiProvider)) {
        setApiProvider(state.apiProvider as ApiProvider)
      }
      if (state.apiKey) {
        setApiKey(state.apiKey)
      }
      if (state.customModel) {
        setCustomModel(state.customModel)
      }
      if (state.contentFontSize) {
        const size = parseInt(state.contentFontSize, 10)
        if (size >= 10 && size <= 24) setContentFontSize(size)
      }
      if (state.convPermissions) {
        try {
          const obj = JSON.parse(state.convPermissions) as Record<string, string>
          const validModes = ['full', 'default', 'plan', 'approve']
          const restored = new Map<string, PermissionMode>()
          for (const [k, v] of Object.entries(obj)) {
            if (validModes.includes(v)) restored.set(k, v as PermissionMode)
          }
          if (restored.size > 0) setPerConvPermission(restored)
        } catch { /* ignore corrupt data */ }
      }
      if (state.keyboardShortcuts) {
        try {
          setCustomShortcuts(JSON.parse(state.keyboardShortcuts) as ShortcutBinding[])
        } catch { /* ignore corrupt data */ }
      }

      // Detect interrupted sessions from previous run
      const interrupted = await window.api.getInterruptedProcesses()
      if (interrupted.length > 0) {
        const ids = new Set<string>()
        for (const proc of interrupted) {
          ids.add(proc.conversationId)
          // Kill any orphaned processes that are still alive
          if (proc.alive) {
            await window.api.killOrphanProcess(proc.pid)
          }
        }
        setInterruptedConvIds(ids)
      }

      setStateRestored(true)
    }
    init()
  }, [])

  // --- Auto-save UI state to DB on changes ---
  useEffect(() => {
    if (!stateRestored) return
    if (activeProjectId) window.api.setAppState('activeProjectId', activeProjectId)
  }, [activeProjectId, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    if (activeConversationId) window.api.setAppState('activeConversationId', activeConversationId)
    else window.api.setAppState('activeConversationId', '')
  }, [activeConversationId, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('selectedModel', selectedModel)
  }, [selectedModel, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('effortLevel', effortLevel)
  }, [effortLevel, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('terminalOpen', terminalOpen ? 'true' : 'false')
  }, [terminalOpen, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('apiMode', apiMode)
  }, [apiMode, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('apiProvider', apiProvider)
  }, [apiProvider, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('apiKey', apiKey)
  }, [apiKey, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('customModel', customModel)
  }, [customModel, stateRestored])

  useEffect(() => {
    if (!stateRestored) return
    window.api.setAppState('contentFontSize', String(contentFontSize))
  }, [contentFontSize, stateRestored])

  // --- Load conversations when project changes ---
  useEffect(() => {
    if (!activeProjectId) return
    window.api.getConversations(activeProjectId).then((rows) => {
      const convs: Conversation[] = (rows as { id: string; title: string; archived: boolean | number; titleEdited: boolean | number; worktreePath?: string | null; createdAt: Date }[]).map((r) => ({
        id: r.id,
        title: r.title,
        messages: [],
        archived: !!r.archived,
        titleEdited: !!r.titleEdited,
        worktreePath: r.worktreePath ?? null,
        createdAt: new Date(r.createdAt)
      }))
      // Sort newest first
      convs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p
          // Preserve already-loaded messages, or apply cached messages from a race condition
          const existingMsgs = new Map(p.conversations.map((c) => [c.id, c.messages]))
          return {
            ...p,
            conversations: convs.map((c) => ({
              ...c,
              messages: existingMsgs.get(c.id) || messagesCache.current.get(c.id) || []
            }))
          }
        })
      )
    })
  }, [activeProjectId])

  // --- Check git status when project changes ---
  const refreshGitInfo = useCallback(() => {
    if (!activeProject) {
      setGitBranch(null)
      setGitDiffStats({ additions: 0, deletions: 0 })
      return
    }
    const effectivePath = activeWorktreePath || activeProject.path
    window.api.gitStatus(effectivePath).then((result) => {
      setGitBranch(result.isRepo ? result.branch : null)
    })
    window.api.gitDiffStats(effectivePath).then(setGitDiffStats)
  }, [activeProject, activeWorktreePath])

  useEffect(() => { refreshGitInfo() }, [refreshGitInfo])

  // --- Load messages when conversation changes ---
  useEffect(() => {
    if (!activeConversationId) return
    // Skip DB fetch if messages are already cached
    if (loadedConvs.current.has(activeConversationId)) return

    window.api.getMessages(activeConversationId).then((rows) => {
      const msgs: Message[] = (rows as {
        id: string; role: 'user' | 'assistant'; content: string;
        tools: string; reasoning: string; images: string; contentBlocks?: string; duration: number | null; createdAt: Date
      }[]).map((r) => {
        const tools = JSON.parse(r.tools || '[]')
        const reasoning = r.reasoning || ''
        let contentBlocks: ContentBlock[] = []
        try {
          contentBlocks = JSON.parse(r.contentBlocks || '[]')
        } catch { /* ignore */ }
        // Rebuild blocks from legacy data if not present
        if (contentBlocks.length === 0 && (r.content || tools.length > 0 || reasoning)) {
          if (reasoning) contentBlocks.push({ type: 'thinking', thinking: reasoning })
          if (r.content) contentBlocks.push({ type: 'text', text: r.content })
          for (const tool of tools) contentBlocks.push({ type: 'tool_use', tool })
        }
        return {
          id: r.id,
          role: r.role,
          content: r.content,
          tools,
          reasoning,
          images: JSON.parse(r.images || '[]'),
          contentBlocks,
          ...(r.duration != null ? { duration: r.duration } : {}),
          timestamp: new Date(r.createdAt)
        }
      })
      // Always cache so the conversations effect can pick them up if it resolves later
      messagesCache.current.set(activeConversationId, msgs)
      loadedConvs.current.add(activeConversationId)
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          conversations: p.conversations.map((c) =>
            c.id === activeConversationId ? { ...c, messages: msgs } : c
          )
        }))
      )
    })
  }, [activeConversationId])

  // --- Project management ---
  const handleAddProject = useCallback(async () => {
    const folderPath = await window.api.openFolder()
    if (!folderPath) return
    const name = folderPath.split(/[/\\]/).pop() || folderPath
    const id = Date.now().toString()
    await window.api.addProject(id, name, folderPath)
    const project: Project = { id, name, path: folderPath, additionalPaths: [], conversations: [] }
    setProjects((prev) => [...prev, project])
    setActiveProjectId(id)
    setActiveConversationId(null)
  }, [])

  // --- Conversation management ---
  const createConversation = useCallback(
    async (title: string): Promise<string> => {
      if (!activeProjectId || !activeProject) return ''
      const id = Date.now().toString()
      await window.api.addConversation(id, activeProjectId, title)

      let worktreePath: string | null = null
      if (useWorktree) {
        const branchName = `td-${id}`
        const wtPath = `${activeProject.path}/../.td-worktrees/${branchName}`
        const result = await window.api.gitWorktreeAdd(activeProject.path, wtPath, undefined, branchName)
        if (result.success) {
          worktreePath = wtPath
          await window.api.setConversationWorktree(id, wtPath)
        }
        setUseWorktree(false)
      }

      const conversation: Conversation = {
        id,
        title,
        messages: [],
        archived: false,
        titleEdited: false,
        worktreePath,
        createdAt: new Date()
      }
      loadedConvs.current.add(id)
      setProjects((prev) =>
        prev.map((p) =>
          p.id === activeProjectId
            ? { ...p, conversations: [conversation, ...p.conversations] }
            : p
        )
      )
      // Transfer permission mode from "new chat" slot to the new conversation
      setPerConvPermission((prev) => {
        const newMode = prev.get('__new__')
        if (newMode) {
          const next = new Map(prev)
          next.set(id, newMode)
          next.delete('__new__')
          return next
        }
        return prev
      })
      setActiveConversationId(id)
      return id
    },
    [activeProjectId, activeProject, useWorktree]
  )

  // --- Message helpers ---
  const addMessage = useCallback(
    (conversationId: string, message: Message) => {
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          conversations: p.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, message] }
              : c
          )
        }))
      )
    },
    []
  )

  const updateLastAssistantMessage = useCallback(
    (conversationId: string, content: string, tools: ToolBlock[], reasoning: string, contentBlocks: ContentBlock[], duration?: number) => {
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          conversations: p.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const messages = [...c.messages]
            const lastIdx = messages.length - 1
            if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
              messages[lastIdx] = { ...messages[lastIdx], content, tools: [...tools], reasoning, contentBlocks: [...contentBlocks], ...(duration != null ? { duration } : {}) }
            }
            return { ...c, messages }
          })
        }))
      )
    },
    []
  )

  // --- Shell command execution (! prefix) ---
  const executeShellCommand = useCallback(
    async (text: string) => {
      if (!activeProjectId || !activeProject) return

      const command = text.trimStart().slice(1) // Remove "!" prefix
      let convId = activeConversationId
      if (!convId) {
        convId = await createConversation(text.length > 50 ? text.slice(0, 50) + '...' : text)
      }

      // User message
      const userMsgId = Date.now().toString()
      const userMessage: Message = {
        id: userMsgId, role: 'user', content: text,
        tools: [], reasoning: '', images: [], contentBlocks: [], timestamp: new Date()
      }
      addMessage(convId, userMessage)
      window.api.addMessage(userMsgId, convId, 'user', text, '[]', '', '[]')

      // Assistant placeholder
      const assistantMsgId = (Date.now() + 1).toString()
      const assistantMessage: Message = {
        id: assistantMsgId, role: 'assistant', content: '',
        tools: [], reasoning: '', images: [], contentBlocks: [], timestamp: new Date()
      }
      addMessage(convId, assistantMessage)
      window.api.addMessage(assistantMsgId, convId, 'assistant', '', '[]', '', '[]')

      setLoadingConvs((prev) => new Set(prev).add(convId!))
      const startedAt = Date.now()

      try {
        const result = await window.api.executeCommand(command, activeProject.path)
        const duration = Date.now() - startedAt

        let content = ''
        if (result.stdout.trim()) {
          content += '```\n' + result.stdout.trimEnd() + '\n```'
        }
        if (result.exitCode !== 0) {
          if (content) content += '\n\n'
          content += `**Error** (exit code ${result.exitCode}):`
          if (result.stderr.trim()) {
            content += '\n```\n' + result.stderr.trimEnd() + '\n```'
          }
        } else if (result.stderr.trim()) {
          if (content) content += '\n\n'
          content += '```\n' + result.stderr.trimEnd() + '\n```'
        }
        if (!content) {
          content = `Command completed with exit code ${result.exitCode}.`
        }

        updateLastAssistantMessage(convId!, content, [], '', [], duration)
        window.api.updateMessage(assistantMsgId, content, '[]', '', duration)
      } catch (err) {
        const duration = Date.now() - startedAt
        const content = `**Error:** ${(err as Error).message || 'Command execution failed'}`
        updateLastAssistantMessage(convId!, content, [], '', [], duration)
        window.api.updateMessage(assistantMsgId, content, '[]', '', duration)
      } finally {
        setLoadingConvs((prev) => {
          const next = new Set(prev)
          next.delete(convId!)
          return next
        })
      }
    },
    [activeConversationId, activeProject, activeProjectId, createConversation, addMessage, updateLastAssistantMessage]
  )

  // --- Send message ---
  const processMessage = useCallback(
    async (text: string, images: ImageAttachment[], convIdOverride?: string) => {
      if (!activeProjectId || !activeProject) return

      let convId = convIdOverride || activeConversationId
      if (!convId) {
        const title = text.length > 50 ? text.slice(0, 50) + '...' : text
        convId = await createConversation(title)
      }

      // Save images to temp and build message with file paths
      const savedImages: ImageAttachment[] = []
      let messageText = text
      for (const img of images) {
        const filePath = await window.api.saveImage(img.dataUrl, img.name)
        savedImages.push({ ...img, filePath })
        messageText += `\n\n[Image: ${filePath}]`
      }

      const userMsgId = Date.now().toString()
      const userMessage: Message = {
        id: userMsgId,
        role: 'user',
        content: text,
        tools: [],
        reasoning: '',
        images: savedImages,
        contentBlocks: [],
        timestamp: new Date()
      }
      addMessage(convId, userMessage)
      window.api.addMessage(userMsgId, convId, 'user', text, '[]', '', JSON.stringify(savedImages))

      const assistantMsgId = (Date.now() + 1).toString()
      const assistantMessage: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        tools: [],
        reasoning: '',
        images: [],
        contentBlocks: [],
        timestamp: new Date()
      }
      addMessage(convId, assistantMessage)
      window.api.addMessage(assistantMsgId, convId, 'assistant', '', '[]', '', '[]')

      // Initialize per-conversation buffer
      buffers.current.set(convId, { text: '', tools: [], reasoning: '', contentBlocks: [], assistantMsgId, startedAt: Date.now(), permissionMode })
      convPermissionModes.current.set(convId, permissionMode)

      // Clear interrupted state when user sends a new message
      setInterruptedConvIds((prev) => {
        if (!prev.has(convId!)) return prev
        const next = new Set(prev)
        next.delete(convId!)
        return next
      })

      setLoadingConvs((prev) => new Set(prev).add(convId!))
      // Use worktree path if the conversation has one, otherwise project path
      const conv = activeProject.conversations.find((c) => c.id === convId)
      const cwd = conv?.worktreePath || activeProject.path

      // Expand !`cmd` patterns (inline shell commands like Claude Code)
      let finalMessage = messageText
      const bangPattern = /!\`([^`]+)\`/g
      const bangMatches = [...messageText.matchAll(bangPattern)]
      if (bangMatches.length > 0) {
        for (const m of bangMatches) {
          try {
            const result = await window.api.executeCommand(m[1], cwd)
            finalMessage = finalMessage.replace(m[0], result.stdout.trim() || result.stderr.trim() || '')
          } catch {
            finalMessage = finalMessage.replace(m[0], `[error running: ${m[1]}]`)
          }
        }
      }

      const additionalDirectories = activeProject.additionalPaths.length > 0 ? activeProject.additionalPaths : undefined
      window.api.sendMessage(finalMessage, convId, cwd, permissionMode, additionalDirectories)

      // Auto-generate/update title at the start of the session (using just the user message)
      window.api.generateTitle(convId, text).then((newTitle) => {
        if (newTitle) {
          setProjects((p2) =>
            p2.map((proj) => ({
              ...proj,
              conversations: proj.conversations.map((c) =>
                c.id === convId ? { ...c, title: newTitle } : c
              )
            }))
          )
          setRecentlyRetitled((s) => new Set(s).add(convId!))
          setTimeout(() => {
            setRecentlyRetitled((s) => {
              const next = new Set(s)
              next.delete(convId!)
              return next
            })
          }, 3000)
        }
      })
    },
    [activeConversationId, activeProject, activeProjectId, createConversation, addMessage, permissionMode]
  )

  // Keep ref in sync so handleDone (inside useEffect) can call the latest processMessage
  processMessageRef.current = processMessage

  const handleSend = useCallback(
    (text: string, images: ImageAttachment[] = []) => {
      if (!text.trim() && images.length === 0) return
      if (!activeProjectId || !activeProject) return

      // Shell command: !<command>
      if (text.trimStart().startsWith('!') && text.trimStart().length > 1) {
        executeShellCommand(text)
        return
      }

      // Queue if conversation is already loading
      if (activeConversationId && loadingConvs.has(activeConversationId)) {
        const queue = messageQueue.current.get(activeConversationId) || []
        queue.push({ text, images })
        messageQueue.current.set(activeConversationId, queue)
        // Force re-render so InputBar sees updated queue length
        setLoadingConvs((prev) => new Set(prev))
        return
      }

      processMessage(text, images)
    },
    [activeProjectId, activeProject, activeConversationId, loadingConvs, processMessage, executeShellCommand]
  )

  // Helper: open plan sidebar for a conversation (using stored drafts)
  const openPlanSidebar = useCallback((convId: string) => {
    const entries = planEntryDrafts.current.get(convId)
    const text = planDrafts.current.get(convId) || ''
    if (!entries && !text) return
    setPlanContent(text)
    setPlanEntries(entries || [])
    setPlanConvId(convId)
    setActiveConversationId(convId)
    setPlanSidebarOpen(true)
  }, [setPlanSidebarOpen])

  // --- Stream handling (ACP SessionUpdate events) ---
  useEffect(() => {
    const unsubStream = window.api.onStream((conversationId: string, data: unknown) => {
      const update = data as Record<string, unknown>
      const buf = buffers.current.get(conversationId)
      if (!buf) return

      // Helper: append to last block of same type, or create new block
      const appendBlock = (type: 'text' | 'thinking', value: string) => {
        const last = buf.contentBlocks[buf.contentBlocks.length - 1]
        if (last && last.type === type) {
          if (type === 'text') (last as { type: 'text'; text: string }).text += value
          else (last as { type: 'thinking'; thinking: string }).thinking += value
        } else {
          buf.contentBlocks.push(type === 'text' ? { type: 'text', text: value } : { type: 'thinking', thinking: value })
        }
      }

      const sessionUpdate = update.sessionUpdate as string

      if (sessionUpdate === 'agent_message_chunk') {
        // Text content from assistant
        const content = update.content as Record<string, unknown> | undefined
        if (content?.type === 'text') {
          const text = (content as { text: string }).text || ''
          buf.text += text
          appendBlock('text', text)
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        }
      } else if (sessionUpdate === 'agent_thought_chunk') {
        // Thinking/reasoning content
        const content = update.content as Record<string, unknown> | undefined
        if (content?.type === 'text') {
          const thinking = (content as { text: string }).text || ''
          buf.reasoning += thinking
          appendBlock('thinking', thinking)
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        }
      } else if (sessionUpdate === 'tool_call') {
        console.log('[bg-debug tool_call]', JSON.stringify(update))
        const toolCallId = update.toolCallId as string || `tool-${Date.now()}`
        const title = update.title as string || 'Tool'
        if (title === EXIT_PLAN_MODE_TITLE) return // Handled by Plan Sidebar
        const rawInput = update.rawInput as Record<string, unknown> || {}
        const kind = update.kind as string || 'other'
        const seenToolIds = new Set(buf.tools.map((t) => t.id))
        if (!seenToolIds.has(toolCallId)) {
          const tool: ToolBlock = {
            id: toolCallId,
            name: title,
            input: { ...rawInput, _kind: kind }
          }
          buf.tools.push(tool)
          buf.contentBlocks.push({ type: 'tool_use', tool })
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        }

        // Save toolName metadata so tool_call_update can check run_in_background
        const meta = update._meta as Record<string, unknown> | undefined
        const claudeCode = meta?.claudeCode as Record<string, unknown> | undefined
        const toolName = claudeCode?.toolName as string | undefined
        if (toolName) {
          toolNameMapRef.current.set(toolCallId, toolName)
        }

        // Create agent task entry for Agent tool calls
        if (toolName === 'Agent') {
          const ri = rawInput as Record<string, unknown>
          setAgentTasks(prev => {
            if (prev.some(t => t.id === toolCallId)) return prev
            return [...prev, {
              id: toolCallId,
              description: String(ri.description || 'Agent task'),
              subagentType: String(ri.subagent_type || 'general-purpose'),
              model: ri.model ? String(ri.model) : undefined,
              status: 'running' as const,
              output: '',
              startedAt: Date.now(),
              conversationId
            }]
          })
        }
      } else if (sessionUpdate === 'tool_call_update') {
        console.log('[bg-debug tool_call_update]', JSON.stringify(update))
        // Update to an existing tool call (results, status changes)
        const toolCallId = update.toolCallId as string
        const existing = buf.tools.find((t) => t.id === toolCallId)
        if (existing) {
          if (update.rawInput !== undefined) {
            const ri = update.rawInput as Record<string, unknown>
            existing.input = { ...existing.input, ...ri }
          }
          if (update.rawOutput !== undefined) {
            existing.input = { ...existing.input, _output: update.rawOutput }
          }
          if (update.status) {
            existing.input = { ...existing.input, _status: update.status }
          }
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        }

        // Route updates: Agent tool calls → agentTasks, Bash background → backgroundSessions
        const ri = update.rawInput as Record<string, unknown> | undefined
        const savedToolName = toolNameMapRef.current.get(toolCallId)

        if (savedToolName === 'Agent') {
          // Update agent task in the orchestration panel
          setAgentTasks(prev => {
            const idx = prev.findIndex(t => t.id === toolCallId)
            if (idx === -1) {
              // Agent task not yet created (rare — create it now)
              return [...prev, {
                id: toolCallId,
                description: ri?.description ? String(ri.description) : 'Agent task',
                subagentType: ri?.subagent_type ? String(ri.subagent_type) : 'general-purpose',
                model: ri?.model ? String(ri.model) : undefined,
                status: 'running' as const,
                output: update.rawOutput !== undefined ? String(update.rawOutput) : '',
                startedAt: Date.now(),
                conversationId
              }]
            }
            const updated = [...prev]
            const task = { ...updated[idx] }
            if (ri?.description) task.description = String(ri.description)
            if (ri?.subagent_type) task.subagentType = String(ri.subagent_type)
            if (ri?.model) task.model = String(ri.model)
            if (update.rawOutput !== undefined) task.output = String(update.rawOutput)
            if (update.status) {
              const st = String(update.status)
              if (st === 'completed' || st === 'success') {
                task.status = 'completed'
                task.completedAt = Date.now()
              } else if (st === 'error' || st === 'failed') {
                task.status = 'error'
                task.completedAt = Date.now()
              }
            }
            updated[idx] = task
            return updated
          })
        } else {
          // Background Bash sessions
          const isBgBash = savedToolName === 'Bash' && ri?.run_in_background === true

          if (isBgBash) {
            setBackgroundSessions(prev => {
              const idx = prev.findIndex(s => s.id === toolCallId)
              if (idx === -1) {
                return [...prev, {
                  id: toolCallId,
                  command: ri?.command ? String(ri.command) : (savedToolName ?? 'Background task'),
                  description: ri?.description ? String(ri.description) : undefined,
                  output: update.rawOutput !== undefined ? String(update.rawOutput) : '',
                  status: 'running' as const,
                  conversationId,
                  kind: 'bash' as const
                }]
              }
              const updated = [...prev]
              const session = { ...updated[idx] }
              if (ri?.command) session.command = String(ri.command)
              if (ri?.description) session.description = String(ri.description)
              if (update.rawOutput !== undefined) session.output = String(update.rawOutput)
              if (update.status) {
                const st = String(update.status)
                if (st === 'completed' || st === 'success') session.status = 'completed'
                else if (st === 'error' || st === 'failed') session.status = 'error'
              }
              updated[idx] = session
              return updated
            })
          } else {
            // Update existing background session (subsequent updates after creation)
            setBackgroundSessions(prev => {
              const idx = prev.findIndex(s => s.id === toolCallId)
              if (idx === -1) return prev
              const updated = [...prev]
              const session = { ...updated[idx] }
              if (ri?.command) session.command = String(ri.command)
              if (ri?.description) session.description = String(ri.description)
              if (update.rawOutput !== undefined) session.output = String(update.rawOutput)
              if (update.status) {
                const st = String(update.status)
                if (st === 'completed' || st === 'success') session.status = 'completed'
                else if (st === 'error' || st === 'failed') session.status = 'error'
              }
              updated[idx] = session
              return updated
            })
          }
        }
      } else if (sessionUpdate === 'usage_update') {
        // Context window and cost update
        const used = Number(update.used) || 0
        const size = Number(update.size) || 0
        const cost = update.cost as Record<string, unknown> | undefined
        if (used > 0) {
          setContextTokensMap(prev => {
            const next = new Map(prev)
            next.set(conversationId, used)
            return next
          })
        }
        if (cost || used) {
          setUsageMap(prev => {
            const next = new Map(prev)
            const existing = next.get(conversationId) || {
              totalCostUsd: 0, inputTokens: 0, outputTokens: 0,
              cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0,
              durationMs: 0, modelUsage: {}
            }
            next.set(conversationId, {
              ...existing,
              inputTokens: used,
              totalCostUsd: cost ? Number((cost as Record<string, unknown>).total) || existing.totalCostUsd : existing.totalCostUsd
            })
            return next
          })
        }
      } else if (sessionUpdate === 'prompt_complete') {
        // Final prompt response with stop reason and usage
        const duration = Date.now() - buf.startedAt
        updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks, duration)

        // Auto-open plan sidebar when in plan mode and we received plan entries
        if (buf.permissionMode === 'plan' && planEntryDrafts.current.has(conversationId)) {
          openPlanSidebar(conversationId)
        }

        // Usage from prompt response
        const usage = update.usage as Record<string, unknown> | undefined
        if (usage) {
          setUsageMap(prev => {
            const next = new Map(prev)
            const existing = next.get(conversationId) || {
              totalCostUsd: 0, inputTokens: 0, outputTokens: 0,
              cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0,
              durationMs: 0, modelUsage: {}
            }
            next.set(conversationId, {
              ...existing,
              inputTokens: existing.inputTokens + (Number(usage.inputTokens) || 0),
              outputTokens: existing.outputTokens + (Number(usage.outputTokens) || 0),
              cacheReadTokens: existing.cacheReadTokens + (Number(usage.cachedReadTokens) || 0),
              cacheCreationTokens: existing.cacheCreationTokens + (Number(usage.cachedWriteTokens) || 0),
              turns: existing.turns + 1,
              durationMs: existing.durationMs + duration
            })
            return next
          })
        }

        // Save final text for notification before buffer is deleted
        finalTexts.current.set(conversationId, buf.text)
        // Persist final assistant message to DB
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration, JSON.stringify(buf.contentBlocks))
        buffers.current.delete(conversationId)
      } else if (sessionUpdate === 'plan') {
        // Show plan task updates when in plan mode OR when the plan sidebar is already open
        // (e.g. after approving a plan and switching to full mode for execution)
        const convMode = buf?.permissionMode || convPermissionModes.current.get(conversationId)
        const sidebarShowingThisConv = planSidebarOpenRef.current && planConvIdRef.current === conversationId
        if (convMode !== 'plan' && !sidebarShowingThisConv) {
          // Not relevant — ignore
        } else {
          const rawEntries = update.entries as Array<Record<string, unknown>> | undefined
          if (rawEntries && rawEntries.length > 0) {
            const entries: PlanEntry[] = rawEntries.map(e => ({
              content: String(e.content || ''),
              status: (e.status as PlanEntryStatus) || 'pending',
              priority: (e.priority as PlanEntryPriority) || 'medium'
            }))
            const planText = entries.map(e => `- [${e.status}] ${e.content}`).join('\n')
            planDrafts.current.set(conversationId, planText)
            planEntryDrafts.current.set(conversationId, entries)
            if (conversationId === activeConversationIdRef.current) {
              setPlanEntries(entries)
              setPlanContent(planText)
              setPlanConvId(conversationId)
              if (!planSidebarOpenRef.current) {
                setPlanSidebarOpen(true)
              }
            }
          }
        }
      } else if (sessionUpdate === 'current_mode_update') {
        // Mode changed by the agent
        const currentModeId = update.currentModeId as string | undefined
        if (currentModeId) {
          convPermissionModes.current.set(conversationId, currentModeId as PermissionMode)
        }
      }
    })

    const unsubError = window.api.onError((conversationId: string, error: string) => {
      const buf = buffers.current.get(conversationId)
      if (!buf) return
      buf.text += `\n[Error: ${error}]`
      buf.contentBlocks.push({ type: 'text', text: `\n[Error: ${error}]` })
      updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
    })

    const handleDone = (conversationId: string) => {
      const buf = buffers.current.get(conversationId)
      // Use finalTexts (saved during result event) since buffer may already be deleted
      const assistantText = finalTexts.current.get(conversationId) || buf?.text || ''
      finalTexts.current.delete(conversationId)

      // Persist any remaining buffer content
      if (buf) {
        const duration = Date.now() - buf.startedAt
        updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks, duration)
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration, JSON.stringify(buf.contentBlocks))

        // Fallback: open plan sidebar if prompt_complete didn't trigger it
        if (buf.permissionMode === 'plan' && planEntryDrafts.current.has(conversationId)) {
          openPlanSidebar(conversationId)
        }

        buffers.current.delete(conversationId)
      }

      // Final fallback: check stored permission mode even if buffer was already deleted by result handler
      const convMode = convPermissionModes.current.get(conversationId)
      if (convMode === 'plan' && planEntryDrafts.current.has(conversationId) && !planSidebarOpenRef.current) {
        openPlanSidebar(conversationId)
      }
      convPermissionModes.current.delete(conversationId)
      // Refresh git diff stats after agent may have modified files
      refreshGitInfo()
      setLoadingConvs((prev) => {
        const next = new Set(prev)
        next.delete(conversationId)
        return next
      })


      // Send desktop notification when conversation finishes in the background
      if (assistantText && (document.hidden || conversationId !== activeConversationIdRef.current)) {
        setProjects((prev) => {
          let convTitle = 'Chat'
          for (const p of prev) {
            const conv = p.conversations.find((c) => c.id === conversationId)
            if (conv) { convTitle = conv.title; break }
          }
          window.api.generateNotificationSummary(assistantText, convTitle)
            .then((summary) => {
              const body = summary || assistantText.slice(0, 120).replace(/\n/g, ' ')
              window.api.showNotification(`td-ide — ${convTitle}`, body, conversationId)
            })
            .catch(() => {
              const body = assistantText.slice(0, 120).replace(/\n/g, ' ')
              window.api.showNotification(`td-ide — ${convTitle}`, body, conversationId)
            })
          return prev
        })
      }

      // Drain message queue — send the next queued message for this conversation
      const queue = messageQueue.current.get(conversationId)
      if (queue && queue.length > 0) {
        const next = queue.shift()!
        if (queue.length === 0) messageQueue.current.delete(conversationId)
        // Small delay to let state settle before sending next
        setTimeout(() => processMessageRef.current(next.text, next.images, conversationId), 100)
      }
    }

    const unsubDone = window.api.onDone((conversationId: string) => handleDone(conversationId))
    const unsubClosed = window.api.onAgentClosed((conversationId: string) => handleDone(conversationId))

    return () => {
      unsubStream()
      unsubError()
      unsubDone()
      unsubClosed()
    }
  }, [updateLastAssistantMessage])

  const handleCancel = useCallback(() => {
    if (activeConversationId) {
      window.api.cancelMessage(activeConversationId)
      // Clear any queued messages for this conversation
      messageQueue.current.delete(activeConversationId)
      setLoadingConvs((prev) => {
        const next = new Set(prev)
        next.delete(activeConversationId)
        return next
      })
      const buf = buffers.current.get(activeConversationId)
      if (buf) {
        const duration = Date.now() - buf.startedAt
        updateLastAssistantMessage(activeConversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks, duration)
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration, JSON.stringify(buf.contentBlocks))
        buffers.current.delete(activeConversationId)
      }
    }
  }, [activeConversationId, updateLastAssistantMessage])

  const navigateToConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId)
    const ownerProject = projectsRef.current.find((p) =>
      p.conversations.some((c) => c.id === conversationId)
    )
    if (ownerProject) setActiveProjectId(ownerProject.id)
  }, [])

  // --- ACP Permission handling ---
  useEffect(() => {
    const unsub = window.api.onPermissionRequest(async (data) => {
      const toolTitle = (data.toolCall as Record<string, unknown>)?.title as string || ''

      if (toolTitle === EXIT_PLAN_MODE_TITLE) {
        if (data.conversationId) navigateToConversation(data.conversationId)

        // Load plan file content into sidebar
        let content = ''
        const planFilePath = await window.api.findLatestPlanFile()
        if (planFilePath) {
          const result = await window.api.readFileContent(planFilePath)
          if (result.exists) content = result.content
        }

        setPlanContent(content)
        setPlanEntries([])
        setPlanConvId(data.conversationId)
        setPlanSidebarOpen(true)
        setPendingPlanApproval({ requestId: data.requestId, conversationId: data.conversationId })
        return
      }

      const toolName = toolTitle || 'Tool'
      const actionType = getToolActionType(toolName)

      // Auto-approve if this action type was already always-allowed for this conversation
      const allowedTypes = alwaysAllowedTypesRef.current.get(data.conversationId)
      if (allowedTypes?.has(actionType)) {
        window.api.respondToPermission(data.requestId, 'allow_always')
        return
      }

      const newDenial: DeniedTool = {
        tool_name: toolName,
        tool_use_id: data.requestId,
        tool_input: (data.toolCall as Record<string, unknown>)?.rawInput as Record<string, unknown> || {}
      }
      setPendingApprovalsMap((prev) => {
        const next = new Map(prev)
        const existing = prev.get(data.conversationId) || []
        next.set(data.conversationId, [...existing, newDenial])
        return next
      })
    })
    return unsub
  }, [navigateToConversation])

  useEffect(() => {
    const unsub = window.api.onNotificationNavigate(({ conversationId }) => {
      navigateToConversation(conversationId)
    })
    return unsub
  }, [navigateToConversation])

  const handleApproveChanges = useCallback(async (approved: DeniedTool[]) => {
    if (!activeConversationId) return
    for (const tool of approved) {
      window.api.respondToPermission(tool.tool_use_id, 'allow')
    }
    setPendingApprovalsMap((prev) => {
      const next = new Map(prev)
      next.delete(activeConversationId)
      return next
    })
  }, [activeConversationId])

  const handleApproveAllForSession = useCallback(() => {
    if (!activeConversationId) return
    const convDenials = pendingApprovalsMap.get(activeConversationId) || []
    const prevTypes = alwaysAllowedTypesRef.current.get(activeConversationId) || new Set<string>()
    const newTypes = new Set(prevTypes)
    for (const tool of convDenials) {
      const actionType = getToolActionType(tool.tool_name)
      newTypes.add(actionType)
      window.api.respondToPermission(tool.tool_use_id, 'allow_always')
    }
    setAlwaysAllowedTypesMap((prev) => {
      const next = new Map(prev)
      next.set(activeConversationId, newTypes)
      return next
    })
    setPendingApprovalsMap((prev) => {
      const next = new Map(prev)
      next.delete(activeConversationId)
      return next
    })
  }, [pendingApprovalsMap, activeConversationId])

  const handleRejectAllChanges = useCallback(() => {
    if (!activeConversationId) return
    const convDenials = pendingApprovalsMap.get(activeConversationId) || []
    for (const tool of convDenials) {
      window.api.respondToPermission(tool.tool_use_id, 'reject')
    }
    setPendingApprovalsMap((prev) => {
      const next = new Map(prev)
      next.delete(activeConversationId)
      return next
    })
  }, [pendingApprovalsMap, activeConversationId])

  const handleApprovePlan = useCallback(() => {
    if (!pendingPlanApproval) return
    window.api.respondToPermission(pendingPlanApproval.requestId, 'allow')
    setPendingPlanApproval(null)
    setPermissionMode('full')
    // Keep sidebar open to show task progress
  }, [pendingPlanApproval, setPermissionMode])

  const handleRejectPlan = useCallback(() => {
    if (!pendingPlanApproval) return
    window.api.respondToPermission(pendingPlanApproval.requestId, 'reject')
    setPendingPlanApproval(null)
  }, [pendingPlanApproval])

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null)
  }, [])

  const handleClearConversation = useCallback(() => {
    if (!activeConversationId) return
    // Clear messages in state (keeps the conversation shell)
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        conversations: p.conversations.map((c) =>
          c.id === activeConversationId ? { ...c, messages: [] } : c
        )
      }))
    )
  }, [activeConversationId])

  // --- Rename / Delete handlers ---
  const handleRenameProject = useCallback(async (projectId: string, newName: string) => {
    await window.api.renameProject(projectId, newName)
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, name: newName } : p))
    )
  }, [])

  const handleReorderProjects = useCallback(async (orderedIds: string[]) => {
    setProjects((prev) => {
      const map = new Map(prev.map(p => [p.id, p]))
      return orderedIds.map(id => map.get(id)!).filter(Boolean)
    })
    await window.api.reorderProjects(orderedIds)
  }, [])

  const handleCreateWorktree = useCallback(async (branchName: string) => {
    if (!activeProject || !activeConversationId) return { success: false, error: 'No active project or conversation' }
    const wtPath = `${activeProject.path}/../.td-worktrees/${branchName}`
    const result = await window.api.gitWorktreeAdd(activeProject.path, wtPath, undefined, branchName)
    if (result.success) {
      await window.api.setConversationWorktree(activeConversationId, wtPath)
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          conversations: p.conversations.map((c) =>
            c.id === activeConversationId ? { ...c, worktreePath: wtPath } : c
          )
        }))
      )
      refreshGitInfo()
    }
    return result
  }, [activeProject, activeConversationId, refreshGitInfo])

  const handleSelectWorktree = useCallback(async (path: string | null) => {
    if (!activeConversationId) return
    await window.api.setConversationWorktree(activeConversationId, path)
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        conversations: p.conversations.map((c) =>
          c.id === activeConversationId ? { ...c, worktreePath: path } : c
        )
      }))
    )
    refreshGitInfo()
  }, [activeConversationId, refreshGitInfo])

  const handleRemoveWorktree = useCallback(async (path: string) => {
    if (!activeProject) return { success: false, error: 'No active project' }
    const result = await window.api.gitWorktreeRemove(activeProject.path, path)
    if (result.success) {
      if (activeWorktreePath === path && activeConversationId) {
        await window.api.setConversationWorktree(activeConversationId, null)
        setProjects((prev) =>
          prev.map((p) => ({
            ...p,
            conversations: p.conversations.map((c) =>
              c.id === activeConversationId ? { ...c, worktreePath: null } : c
            )
          }))
        )
      }
      refreshGitInfo()
    }
    return result
  }, [activeProject, activeWorktreePath, activeConversationId, refreshGitInfo])

  const handleUpdateProjectFolders = useCallback(async (projectId: string, additionalPaths: string[]) => {
    console.log('[App] handleUpdateProjectFolders:', projectId, additionalPaths)
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, additionalPaths } : p))
    )
    await window.api.updateProjectAdditionalPaths(projectId, additionalPaths)
  }, [])

  const handleDeleteProject = useCallback(async (projectId: string) => {
    await window.api.deleteProject(projectId)
    setProjects((prev) => prev.filter((p) => p.id !== projectId))
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
      setActiveConversationId(null)
    }
  }, [activeProjectId])

  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await window.api.renameConversation(conversationId, newTitle, true)
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        conversations: p.conversations.map((c) =>
          c.id === conversationId ? { ...c, title: newTitle, titleEdited: true } : c
        )
      }))
    )
  }, [])

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    await window.api.deleteConversation(conversationId)
    loadedConvs.current.delete(conversationId)
    messagesCache.current.delete(conversationId)
    planDrafts.current.delete(conversationId)
    planEntryDrafts.current.delete(conversationId)
    setUsageMap(prev => { const next = new Map(prev); next.delete(conversationId); return next })
    finalTexts.current.delete(conversationId)
    convPermissionModes.current.delete(conversationId)
    setAlwaysAllowedTypesMap((prev) => { const next = new Map(prev); next.delete(conversationId); return next })
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        conversations: p.conversations.filter((c) => c.id !== conversationId)
      }))
    )
    if (activeConversationId === conversationId) {
      setActiveConversationId(null)
    }
  }, [activeConversationId])

  const handleArchiveConversation = useCallback(async (conversationId: string, archived: boolean) => {
    await window.api.archiveConversation(conversationId, archived)
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        conversations: p.conversations.map((c) =>
          c.id === conversationId ? { ...c, archived } : c
        )
      }))
    )
    if (archived && activeConversationId === conversationId) {
      setActiveConversationId(null)
    }
  }, [activeConversationId])

  const handleDeleteAllArchived = useCallback(async (projectId: string) => {
    await window.api.deleteArchivedConversations(projectId)
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const archived = p.conversations.filter((c) => c.archived)
        for (const c of archived) loadedConvs.current.delete(c.id)
        if (activeConversationId && archived.some((c) => c.id === activeConversationId)) {
          setActiveConversationId(null)
        }
        return { ...p, conversations: p.conversations.filter((c) => !c.archived) }
      })
    )
  }, [activeConversationId])

  const handleNewChatForProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId)
    setActiveConversationId(null)
  }, [])

  // --- TopBar action handlers ---
  const handleGitInit = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!activeProject) return { success: false, error: 'No project selected' }
    const result = await window.api.gitInit(activeProject.path)
    if (result.success && result.branch) {
      setGitBranch(result.branch)
    }
    return result
  }, [activeProject])

  const handleOpenInExplorer = useCallback(() => {
    if (activeProject) window.api.openInExplorer(activeProject.path)
  }, [activeProject])

  const handleOpenInTerminal = useCallback(() => {
    if (activeProject) setTerminalOpen((prev) => !prev)
  }, [activeProject])

  const handleExecutePlan = useCallback((plan: string) => {
    // Switch to full access and send the plan as a message to the plan's conversation
    setPermissionMode('full')
    setPlanSidebarOpen(false)
    const targetConvId = planConvId || activeConversationId
    if (targetConvId) {
      setActiveConversationId(targetConvId)
      processMessage(`Execute this plan:\n\n${plan}`, [], targetConvId)
    }
    setPlanConvId(null)
  }, [planConvId, activeConversationId, processMessage])

  // Sync plan content when switching conversations
  useEffect(() => {
    const content = activeConversationId ? planDrafts.current.get(activeConversationId) || '' : ''
    const entries = activeConversationId ? planEntryDrafts.current.get(activeConversationId) || [] : []
    setPlanContent(content)
    setPlanEntries(entries)
  }, [activeConversationId])

  const handleAddFile = useCallback(async () => {
    if (!activeProject) return
    const files = await window.api.openFile(activeProject.path)
    if (!files || files.length === 0) return
    // Format file paths as a message referencing them
    const paths = files.map((f) => f.replace(/\\/g, '/')).join('\n')
    const text = files.length === 1
      ? `Please look at this file: ${paths}`
      : `Please look at these files:\n${paths}`
    handleSend(text)
  }, [activeProject, handleSend])

  // --- Keyboard shortcuts ---
  const sidebarToggleRef = useRef<(() => void) | null>(null)

  const mergedShortcuts = useMemo(
    () => mergeShortcuts(DEFAULT_SHORTCUTS, customShortcuts),
    [customShortcuts]
  )

  const activeConvsRef = useRef(activeConversations)
  activeConvsRef.current = activeConversations

  const shortcutActions = useMemo(() => {
    const actions: Record<string, () => void> = {
      newChat: handleNewChat,
      toggleSidebar: () => sidebarToggleRef.current?.(),
      toggleTerminal: () => setTerminalOpen((prev) => !prev),
      openSettings: () => setSettingsOpen('global'),
      openProjectSettings: () => setSettingsOpen('project'),
    }
    for (let i = 1; i <= 9; i++) {
      actions[`switchTab${i}`] = () => {
        const conv = activeConvsRef.current[i - 1]
        if (conv) setActiveConversationId(conv.id)
      }
      actions[`switchProject${i}`] = () => {
        const proj = projectsRef.current[i - 1]
        if (proj) setActiveProjectId(proj.id)
      }
    }
    return actions
  }, [handleNewChat])

  useKeyboardShortcuts(shortcutActions, customShortcuts)

  const handleUpdateShortcut = useCallback((id: string, key: string, modifiers: ShortcutModifiers) => {
    setCustomShortcuts((prev) => {
      const base = prev ?? DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
      const next = base.map((s) => s.id === id ? { ...s, key, modifiers } : s)
      window.api.setAppState('keyboardShortcuts', JSON.stringify(next))
      return next
    })
  }, [])

  const handleResetShortcuts = useCallback(() => {
    setCustomShortcuts(null)
    window.api.setAppState('keyboardShortcuts', '')
  }, [])

  return (
    <SidebarProvider className="bg-td-bg text-td-text">
      <SidebarToggleBridge toggleRef={sidebarToggleRef} />
      <AppSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConvs}
        pendingPermissionConvIds={pendingPermissionConvIds}
        interruptedConversations={interruptedConvIds}
        queuedCounts={new Map(Array.from(messageQueue.current.entries()).map(([k, v]) => [k, v.length]))}
        onSelectProject={setActiveProjectId}
        onSelectConversation={setActiveConversationId}
        onNewChat={handleNewChat}
        onAddProject={handleAddProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onReorderProjects={handleReorderProjects}
        onUpdateProjectFolders={handleUpdateProjectFolders}
        onKillSession={(convId) => window.api.cancelMessage(convId)}
        onKillAgent={() => window.api.restartAgent()}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onArchiveConversation={handleArchiveConversation}
        onDeleteAllArchived={handleDeleteAllArchived}
        onNewChatForProject={handleNewChatForProject}
        onOpenSettings={() => setSettingsOpen('global')}
        onOpenProjectSettings={(projectId: string) => {
          const proj = projects.find((p) => p.id === projectId)
          if (proj) { setSettingsProject(proj); setActiveProjectId(projectId); setSettingsOpen('project') }
        }}
        recentlyRetitled={recentlyRetitled}
      />
      {settingsOpen ? (
        <SettingsPage key={`${settingsOpen}-${settingsOpen === 'project' ? settingsProject?.id : 'global'}`} project={settingsOpen === 'project' ? settingsProject || activeProject : activeProject} homedir={homedir} scope={settingsOpen} onClose={() => setSettingsOpen(false)} contentFontSize={contentFontSize} onContentFontSizeChange={setContentFontSize} shortcuts={mergedShortcuts} onUpdateShortcut={handleUpdateShortcut} onResetShortcuts={handleResetShortcuts} onTestPlanSidebar={() => {
          const testPlan = '# Test Plan\n\n## Context\nSimulated plan to test the sidebar with approve/reject buttons.\n\n## Changes\n\n### 1. Update `package.json`\n**File:** `package.json` (line 4)\n- **From:** `"A desktop GUI for Claude Code"`\n- **To:** `"TD IDE — A desktop GUI for Claude Code"`\n\n## Verification\n- Build still passes'
          setPlanContent(testPlan)
          setPlanEntries([])
          setPendingPlanApproval({ requestId: 'test-plan-approval', conversationId: activeConversationId || 'test' })
          setPlanSidebarOpen(true)
          setSettingsOpen(false)
        }} />
      ) : (
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar
          project={activeProject}
          conversation={activeConversation}
          gitBranch={gitBranch}
          onGitInit={handleGitInit}
          onOpenInExplorer={handleOpenInExplorer}
          onOpenInTerminal={handleOpenInTerminal}
          onAddFile={handleAddFile}
        />
        {activeProject ? (
          <>
            <ConversationTabs
              conversations={activeConversations}
              activeConversationId={activeConversationId}
              loadingConversations={loadingConvs}
              interruptedConversations={interruptedConvIds}
              pendingPermissionConvIds={pendingPermissionConvIds}
              onSelectConversation={setActiveConversationId}
              onArchiveConversation={(id) => handleArchiveConversation(id, true)}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
            />
            <div className="flex flex-1 min-h-0">
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex-1 flex flex-col min-h-0">
                  <ChatArea
                    messages={activeConversation?.messages || []}
                    isLoading={isLoading}
                    permissionMode={permissionMode}
                    contentFontSize={contentFontSize}
                    onToolClick={setToolDetailTool}
                  />
                </div>
                {terminalOpen && (
                  <>
                    <ResizeHandle onResize={setTerminalPanelHeight} />
                    <TerminalPanel
                      cwd={activeProject.path}
                      height={terminalPanelHeight}
                      onClose={() => setTerminalOpen(false)}
                    />
                  </>
                )}
              </div>
              {planSidebarOpen && (
                <PlanSidebar
                  planContent={planContent}
                  planEntries={planEntries}
                  onPlanChange={(content) => {
                    setPlanContent(content)
                    if (activeConversationId) planDrafts.current.set(activeConversationId, content)
                  }}
                  onExecutePlan={handleExecutePlan}
                  onClose={() => { setPlanSidebarOpen(false); setPendingPlanApproval(null) }}
                  isStreaming={isLoading}
                  pendingApproval={pendingPlanApproval}
                  onApprovePlan={handleApprovePlan}
                  onRejectPlan={handleRejectPlan}
                />
              )}
              {diffViewData && (
                <DiffSidebar
                  filePath={diffViewData.filePath}
                  action={diffViewData.action}
                  oldString={diffViewData.oldString}
                  newString={diffViewData.newString}
                  newContent={diffViewData.newContent}
                  command={diffViewData.command}
                  onClose={() => setDiffViewData(null)}
                />
              )}
              {toolDetailTool && !diffViewData && !planSidebarOpen && (
                <ToolDetailSidebar
                  tool={toolDetailTool}
                  onClose={() => setToolDetailTool(null)}
                />
              )}
            </div>
            <PermissionBanner
              visible={permissionDenied}
              deniedCount={deniedCount}
              conversationTitle={
                deniedConversationId
                  ? projects.flatMap((p) => p.conversations).find((c) => c.id === deniedConversationId)?.title
                  : undefined
              }
              onNavigate={deniedConversationId && deniedConversationId !== activeConversationId ? () => {
                setActiveConversationId(deniedConversationId)
                // Find which project owns this conversation
                const ownerProject = projects.find((p) =>
                  p.conversations.some((c) => c.id === deniedConversationId)
                )
                if (ownerProject) setActiveProjectId(ownerProject.id)
              } : undefined}
              onSwitchToFull={() => {
                setPermissionMode('full')
                setPermissionDenied(false)
                setDeniedCount(0)
                // Resume the conversation with full access
                const convId = deniedConversationId
                setDeniedConversationId(null)
                if (convId) {
                  processMessage('I switched to full access mode. Continue with all permissions granted.', [], convId)
                }
              }}
              onDismiss={() => {
                setPermissionDenied(false)
                setDeniedCount(0)
                setDeniedConversationId(null)
              }}
            />
            {/* Context exhaustion warning */}
            {activeConversationId && (contextTokensMap.get(activeConversationId) || 0) >= 900_000 && (
              <div className="mx-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-xs">
                <span className="text-red-400 font-medium shrink-0">Context nearly full</span>
                <span className="text-td-muted">This conversation is approaching the context limit. Responses may degrade or the session may stop.</span>
                <button
                  onClick={handleNewChat}
                  className="shrink-0 px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
                >
                  New chat
                </button>
              </div>
            )}
            {pendingApprovals.length > 0 && (
              <ApprovalWidget
                denials={pendingApprovals}
                onApprove={(approved) => { handleApproveChanges(approved); setDiffViewData(null) }}
                onApproveAll={() => { handleApproveAllForSession(); setDiffViewData(null) }}
                onReject={() => { handleRejectAllChanges(); setDiffViewData(null) }}
              />
            )}
            <InputBar
              conversationId={activeConversationId}
              onSend={handleSend}
              onCancel={handleCancel}
              onNewChat={handleNewChat}
              onClearConversation={handleClearConversation}
              onOpenSettings={() => setSettingsOpen('global')}
              onOpenInExplorer={handleOpenInExplorer}
              onOpenInTerminal={handleOpenInTerminal}
              onAddFile={handleAddFile}
              isLoading={isLoading}
              queueLength={activeConversationId ? (messageQueue.current.get(activeConversationId)?.length ?? 0) : 0}
              queuedMessages={activeConversationId ? (messageQueue.current.get(activeConversationId) ?? []) : []}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              effortLevel={effortLevel}
              onEffortChange={setEffortLevel}
              permissionMode={permissionMode}
              onPermissionModeChange={setPermissionMode}
              onArchiveConversation={() => {
                if (activeConversationId) handleArchiveConversation(activeConversationId, true)
              }}
              disabledTools={disabledTools}
              onToggleTool={(tool) => setDisabledTools((prev) => {
                const next = new Set(prev)
                if (next.has(tool)) next.delete(tool)
                else next.add(tool)
                return next
              })}
              onShowUsage={() => setUsageOpen(true)}
              contextTokens={activeConversationId ? (contextTokensMap.get(activeConversationId) || 0) : 0}
              conversationUsage={activeConversationId ? (usageMap.get(activeConversationId) || null) : null}
              apiMode={apiMode}
              onApiModeChange={setApiMode}
              apiProvider={apiProvider}
              onApiProviderChange={setApiProvider}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              customModel={customModel}
              onCustomModelChange={setCustomModel}
              gitBranch={gitBranch}
              gitDiffStats={gitDiffStats}
              onCommitChanges={() => handleSend('Please commit the current changes. Review the diff, write a good commit message, and create the commit.')}
              projectPath={activeProject?.path || null}
              onBranchChange={(branch) => { setGitBranch(branch); refreshGitInfo() }}
              worktreePath={activeConversation?.worktreePath || null}
              messageHistory={userMessageHistory}
              onCreateWorktree={handleCreateWorktree}
              onSelectWorktree={handleSelectWorktree}
              onRemoveWorktree={handleRemoveWorktree}
              terminalOpen={terminalOpen}
              onToggleTerminal={() => setTerminalOpen((prev) => !prev)}
              shellSession={shellSession}
              onShellSession={setShellSession}
              backgroundSessions={backgroundSessions}
              onCloseBackgroundSession={(id) => setBackgroundSessions(prev => prev.filter(s => s.id !== id))}
              agentTasks={agentTasks.filter(t => t.conversationId === activeConversationId)}
              onDismissAgentTask={(id) => setAgentTasks(prev => prev.filter(t => t.id !== id))}
              onClearCompletedAgentTasks={() => setAgentTasks(prev => prev.filter(t => t.status === 'running'))}
              onInjectDemoAgentTasks={() => {
                const convId = activeConversationId || 'demo'
                const now = Date.now()
                setAgentTasks(prev => [...prev,
                  { id: `demo-explore-${now}`, description: 'Explore codebase structure and architecture', subagentType: 'Explore', model: 'sonnet', status: 'running', output: 'Scanning src/ directory...\nFound 42 TypeScript files across 6 modules.\nAnalyzing component dependency graph...', startedAt: now - 12000, conversationId: convId },
                  { id: `demo-plan-${now}`, description: 'Design authentication migration strategy', subagentType: 'Plan', status: 'running', output: 'Reviewing current auth middleware...\nIdentified 3 session storage patterns that need updating.', startedAt: now - 5000, conversationId: convId },
                  { id: `demo-worker-${now}`, description: 'Write comprehensive unit tests for auth module', subagentType: 'general-purpose', model: 'opus', status: 'completed', output: 'Created 3 test suites with 24 test cases.\nAll tests passing.\n\nFiles created:\n  src/auth/__tests__/jwt.test.ts\n  src/auth/__tests__/middleware.test.ts\n  src/auth/__tests__/session.test.ts', startedAt: now - 20000, completedAt: now - 8000, conversationId: convId },
                ])
              }}
              alwaysAllowedTypes={currentAlwaysAllowed}
              onToggleAlwaysAllowed={handleToggleAlwaysAllowed}
            />
            <UsageDialog
              open={usageOpen}
              onOpenChange={setUsageOpen}
              usage={activeConversationId ? (usageMap.get(activeConversationId) || null) : null}
              conversationTitle={activeConversation?.title || null}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col text-td-muted">
            <div className="h-10 titlebar-drag shrink-0" />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-20">{'</>'}</div>
                <p className="text-lg mb-2">Welcome to td-ide</p>
                <p className="text-sm mb-4">Open a project folder to get started</p>
                <button
                  onClick={handleAddProject}
                  className="px-4 py-2 rounded bg-td-accent hover:bg-blue-600 text-white text-sm transition-colors"
                >
                  Open Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </SidebarProvider>
  )
}

export default App
