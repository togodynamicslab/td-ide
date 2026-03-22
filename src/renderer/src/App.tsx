import { useState, useCallback, useEffect, useRef } from 'react'
import AppSidebar from './components/Sidebar'
import { SidebarProvider } from './components/ui/sidebar'
import TopBar from './components/TopBar'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import PermissionBanner from './components/PermissionBanner'
import PlanSidebar from './components/PlanSidebar'
import SettingsPage from './components/SettingsPage'
import TerminalPanel from './components/TerminalPanel'
import ResizeHandle from './components/ResizeHandle'
import UsageDialog from './components/UsageDialog'
// ApprovalWidget is rendered inline in ChatArea

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
  conversations: Conversation[]
}

export type ModelId = 'opus' | 'sonnet' | 'haiku'
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type PermissionMode = 'full' | 'default' | 'plan' | 'approve'
export type ApiProvider = 'anthropic' | 'openrouter'
export type ApiMode = 'subscription' | 'apikey'

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

function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingConvs, setLoadingConvs] = useState<Set<string>>(new Set())
  const [recentlyRetitled, setRecentlyRetitled] = useState<Set<string>>(new Set())
  const [selectedModel, setSelectedModel] = useState<ModelId>('opus')
  const [apiMode, setApiMode] = useState<ApiMode>('subscription')
  const [apiProvider, setApiProvider] = useState<ApiProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [effortLevel, setEffortLevel] = useState<EffortLevel>('high')
  const [perConvPermission, setPerConvPermission] = useState<Map<string, PermissionMode>>(new Map())
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set())
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [deniedCount, setDeniedCount] = useState(0)
  const [deniedConversationId, setDeniedConversationId] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<DeniedTool[]>([])
  const [approvalConvId, setApprovalConvId] = useState<string | null>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [planSidebarOpen, setPlanSidebarOpen] = useState(false)
  const [planContent, setPlanContent] = useState('')
  const [planConvId, setPlanConvId] = useState<string | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalPanelHeight, setTerminalPanelHeight] = useState(300)
  const [useWorktree, setUseWorktree] = useState(false)
  const [interruptedConvIds, setInterruptedConvIds] = useState<Set<string>>(new Set())
  const [usageOpen, setUsageOpen] = useState(false)
  const [stateRestored, setStateRestored] = useState(false)

  // Per-conversation usage tracking
  const usageMap = useRef(new Map<string, ConversationUsage>())
  // Per-conversation plan content
  const planDrafts = useRef(new Map<string, string>())
  // Per-conversation stream buffers for parallel support
  const buffers = useRef(new Map<string, StreamBuffer>())

  // Track which conversations have had their messages loaded from DB
  const loadedConvs = useRef(new Set<string>())
  // Cache fetched messages to handle race between conversations and messages effects
  const messagesCache = useRef(new Map<string, Message[]>())
  // Store final assistant text per conversation for notification (buffer gets deleted before handleDone)
  const finalTexts = useRef(new Map<string, string>())
  // Track permission mode per conversation so handleDone can check plan mode after buffer is deleted
  const convPermissionModes = useRef(new Map<string, PermissionMode>())
  // Per-conversation message queue for queuing messages while Claude is working
  const messageQueue = useRef(new Map<string, { text: string; images: ImageAttachment[] }[]>())
  // Stable ref for processMessage so handleDone inside useEffect can call the latest version
  const processMessageRef = useRef<(text: string, images: ImageAttachment[], convId?: string) => void>(() => {})

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const activeConversation = activeProject?.conversations.find(
    (c) => c.id === activeConversationId
  )
  const isLoading = activeConversationId ? loadingConvs.has(activeConversationId) : false

  // Per-conversation permission mode (defaults to 'full')
  const permissionMode: PermissionMode = activeConversationId
    ? (perConvPermission.get(activeConversationId) || 'full')
    : (perConvPermission.get('__new__') || 'full')
  const setPermissionMode = useCallback((mode: PermissionMode) => {
    const key = activeConversationId || '__new__'
    setPerConvPermission((prev) => {
      const next = new Map(prev)
      next.set(key, mode)
      return next
    })
  }, [activeConversationId])

  // --- Load projects from DB on mount, then restore saved state ---
  useEffect(() => {
    const init = async () => {
      // Load projects
      const rows = await window.api.getProjects()
      const loaded: Project[] = (rows as { id: string; name: string; path: string; createdAt: Date }[]).map((r) => ({
        id: r.id,
        name: r.name,
        path: r.path,
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
  useEffect(() => {
    if (!activeProject) {
      setGitBranch(null)
      return
    }
    window.api.gitStatus(activeProject.path).then((result) => {
      setGitBranch(result.isRepo ? result.branch : null)
    })
  }, [activeProject?.path])

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
    const project: Project = { id, name, path: folderPath, conversations: [] }
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
      const modelToSend = apiMode === 'apikey' && customModel ? customModel : selectedModel
      window.api.sendMessage(messageText, convId, cwd, modelToSend, effortLevel, permissionMode, Array.from(disabledTools), apiMode === 'apikey' ? apiKey : '', apiMode === 'apikey' ? apiProvider : 'anthropic')
    },
    [activeConversationId, activeProject, activeProjectId, createConversation, addMessage, selectedModel, effortLevel, permissionMode, disabledTools, apiMode, apiKey, apiProvider, customModel]
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

  // --- Stream handling ---
  useEffect(() => {
    const unsubStream = window.api.onStream((conversationId: string, data: unknown) => {
      const c = data as Record<string, unknown>

      // Capture rate limit info (fires outside of buffer context)
      if (c.type === 'rate_limit_event') {
        const info = c.rate_limit_info as Record<string, unknown> | undefined
        if (info) {
          const prev = usageMap.current.get(conversationId)
          if (prev) {
            prev.rateLimitResetsAt = Number(info.resetsAt) || 0
          }
        }
      }

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

      if (c.type === 'assistant' && c.message) {
        // assistant events are snapshots of the current turn's content (not cumulative across turns).
        // They drop blocks from previous phases (e.g. thinking is gone once text starts).
        // Only use these to pick up tool_use blocks (which have no delta equivalent).
        const msg = c.message as Record<string, unknown>
        if (msg.content && Array.isArray(msg.content)) {
          // Also pick up text/thinking from assistant snapshots if we haven't captured any via deltas yet
          // (fallback for cases where stream_events aren't delivered)
          let hasNewText = false
          for (const block of msg.content) {
            const b = block as Record<string, unknown>
            if (b.type === 'text' && typeof b.text === 'string' && !buf.text) {
              buf.text = b.text
              appendBlock('text', b.text)
              hasNewText = true
            } else if (b.type === 'thinking' && typeof b.thinking === 'string' && !buf.reasoning) {
              buf.reasoning = b.thinking
              appendBlock('thinking', b.thinking)
              hasNewText = true
            }
          }

          const seenToolIds = new Set(buf.tools.map((t) => t.id))
          for (const block of msg.content) {
            const b = block as Record<string, unknown>
            if (b.type === 'tool_use' && b.id) {
              const toolId = b.id as string
              if (!seenToolIds.has(toolId)) {
                const tool: ToolBlock = {
                  id: toolId,
                  name: (b.name as string) || 'Unknown',
                  input: (b.input as Record<string, unknown>) || {}
                }
                buf.tools.push(tool)
                buf.contentBlocks.push({ type: 'tool_use', tool })
                seenToolIds.add(toolId)
              } else {
                // Update existing tool's input (may become more complete in later snapshots)
                const existing = buf.tools.find((t) => t.id === toolId)
                if (existing && b.input) {
                  existing.input = b.input as Record<string, unknown>
                }
              }
            }
          }
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        }
      } else if (c.type === 'stream_event') {
        // Handle the raw Anthropic API stream events for real-time content
        const event = c.event as Record<string, unknown> | undefined
        if (!event) return

        if (event.type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown> | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            buf.text += delta.text
            appendBlock('text', delta.text)
            updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
          } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
            buf.reasoning += delta.thinking
            appendBlock('thinking', delta.thinking)
            updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
          }
        }
      } else if (c.type === 'content_block_delta') {
        const delta = c.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          buf.text += delta.text
          appendBlock('text', delta.text)
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          buf.reasoning += delta.thinking
          appendBlock('thinking', delta.thinking)
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
        }
      } else if (c.type === 'result') {
        const duration = Date.now() - buf.startedAt
        if (typeof c.result === 'string') {
          buf.text = c.result as string
          // Rebuild contentBlocks for result override — result replaces all text
          buf.contentBlocks = buf.contentBlocks.filter(b => b.type !== 'text')
          buf.contentBlocks.push({ type: 'text', text: buf.text })
        }
        updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks, duration)

        // Auto-capture plan content when in plan mode
        if (buf.permissionMode === 'plan' && buf.text.trim()) {
          planDrafts.current.set(conversationId, buf.text)
          setPlanContent(buf.text)
          setPlanConvId(conversationId)
          setActiveConversationId(conversationId)
          setPlanSidebarOpen(true)
        }

        // Accumulate usage stats from result
        const costUsd = typeof c.total_cost_usd === 'number' ? c.total_cost_usd : 0
        const resultUsage = c.usage as Record<string, unknown> | undefined
        const resultModelUsage = c.modelUsage as Record<string, Record<string, unknown>> | undefined
        if (resultUsage || costUsd) {
          const prev = usageMap.current.get(conversationId) || {
            totalCostUsd: 0, inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0,
            durationMs: 0, modelUsage: {}
          }
          // Merge per-model usage
          const mergedModels = { ...prev.modelUsage }
          if (resultModelUsage) {
            for (const [model, data] of Object.entries(resultModelUsage)) {
              const existing = mergedModels[model]
              mergedModels[model] = {
                model,
                inputTokens: (existing?.inputTokens || 0) + (Number(data.inputTokens) || 0),
                outputTokens: (existing?.outputTokens || 0) + (Number(data.outputTokens) || 0),
                cacheReadInputTokens: (existing?.cacheReadInputTokens || 0) + (Number(data.cacheReadInputTokens) || 0),
                cacheCreationInputTokens: (existing?.cacheCreationInputTokens || 0) + (Number(data.cacheCreationInputTokens) || 0),
                costUSD: (existing?.costUSD || 0) + (Number(data.costUSD) || 0)
              }
            }
          }
          usageMap.current.set(conversationId, {
            totalCostUsd: prev.totalCostUsd + costUsd,
            inputTokens: prev.inputTokens + (Number(resultUsage?.input_tokens) || 0),
            outputTokens: prev.outputTokens + (Number(resultUsage?.output_tokens) || 0),
            cacheReadTokens: prev.cacheReadTokens + (Number(resultUsage?.cache_read_input_tokens) || 0),
            cacheCreationTokens: prev.cacheCreationTokens + (Number(resultUsage?.cache_creation_input_tokens) || 0),
            turns: prev.turns + (Number(c.num_turns) || 1),
            durationMs: prev.durationMs + (Number(c.duration_ms) || 0),
            modelUsage: mergedModels,
            rateLimitResetsAt: prev.rateLimitResetsAt
          })
        }

        const denials = c.permission_denials as DeniedTool[] | undefined
        if (denials && Array.isArray(denials) && denials.length > 0) {
          // In "approve" mode, show the approval dialog with full tool details
          const convMode = convPermissionModes.current.get(conversationId)
          if (convMode === 'approve') {
            setPendingApprovals(denials)
            setApprovalConvId(conversationId)
          } else {
            setPermissionDenied(true)
            setDeniedCount(denials.length)
            setDeniedConversationId(conversationId)
          }
        }
        // Save final text for notification before buffer is deleted
        finalTexts.current.set(conversationId, buf.text)
        // Persist final assistant message to DB
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration, JSON.stringify(buf.contentBlocks))
        buffers.current.delete(conversationId)
      }
    })

    const unsubError = window.api.onError((conversationId: string, error: string) => {
      const buf = buffers.current.get(conversationId)
      if (!buf) return
      buf.text += `\n[Error: ${error}]`
      buf.contentBlocks.push({ type: 'text', text: `\n[Error: ${error}]` })
      updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, buf.contentBlocks)
      if (error.toLowerCase().includes('permission') || error.toLowerCase().includes('denied')) {
        setPermissionDenied(true)
        setDeniedCount((prev) => prev + 1)
        setDeniedConversationId(conversationId)
      }
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

        // Fallback: open plan sidebar if result event didn't trigger it
        if (buf.permissionMode === 'plan' && buf.text.trim()) {
          planDrafts.current.set(conversationId, buf.text)
          setPlanContent(buf.text)
          setPlanConvId(conversationId)
          setActiveConversationId(conversationId)
          setPlanSidebarOpen(true)
        }

        buffers.current.delete(conversationId)
      }

      // Final fallback: check stored permission mode even if buffer was already deleted by result handler
      const convMode = convPermissionModes.current.get(conversationId)
      if (convMode === 'plan' && assistantText.trim() && !planDrafts.current.has(conversationId)) {
        planDrafts.current.set(conversationId, assistantText)
        setPlanContent(assistantText)
        setPlanConvId(conversationId)
        setActiveConversationId(conversationId)
        setPlanSidebarOpen(true)
      }
      convPermissionModes.current.delete(conversationId)
      setLoadingConvs((prev) => {
        const next = new Set(prev)
        next.delete(conversationId)
        return next
      })

      // Auto-generate/update title after each response if not manually edited
      setProjects((prev) => {
        for (const p of prev) {
          const conv = p.conversations.find((c) => c.id === conversationId)
          if (conv && !conv.titleEdited) {
            // Collect the last few user and assistant messages for context
            const recentMsgs = conv.messages.slice(-4)
            const userParts = recentMsgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n')
            const assistantParts = recentMsgs.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n')
            if (userParts) {
              window.api.generateTitle(conversationId, userParts, assistantParts).then((newTitle) => {
                if (newTitle) {
                  setProjects((p2) =>
                    p2.map((proj) => ({
                      ...proj,
                      conversations: proj.conversations.map((c) =>
                        c.id === conversationId ? { ...c, title: newTitle } : c
                      )
                    }))
                  )
                  // Flash "title updated" indicator
                  setRecentlyRetitled((s) => new Set(s).add(conversationId))
                  setTimeout(() => {
                    setRecentlyRetitled((s) => {
                      const next = new Set(s)
                      next.delete(conversationId)
                      return next
                    })
                  }, 3000)
                }
              })
            }
            break
          }
        }
        return prev
      })

      // Send desktop notification only when the window is not focused
      if (assistantText && document.hidden) {
        setProjects((prev) => {
          let convTitle = 'Chat'
          for (const p of prev) {
            const conv = p.conversations.find((c) => c.id === conversationId)
            if (conv) { convTitle = conv.title; break }
          }
          window.api.generateNotificationSummary(assistantText, convTitle)
            .then((summary) => {
              const body = summary || assistantText.slice(0, 120).replace(/\n/g, ' ')
              window.api.showNotification(`td-ide — ${convTitle}`, body)
            })
            .catch(() => {
              const body = assistantText.slice(0, 120).replace(/\n/g, ' ')
              window.api.showNotification(`td-ide — ${convTitle}`, body)
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

  // --- Approval flow handlers ---
  const handleApproveChanges = useCallback(async (approved: DeniedTool[]) => {
    // Apply approved file changes
    const appliedFiles: string[] = []
    for (const tool of approved) {
      const input = tool.tool_input
      if (tool.tool_name === 'Write' && typeof input.file_path === 'string') {
        await window.api.writeFileContent(input.file_path, String(input.content || ''))
        appliedFiles.push(input.file_path)
      } else if (tool.tool_name === 'Edit' && typeof input.file_path === 'string' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
        const { content, exists } = await window.api.readFileContent(input.file_path)
        if (exists) {
          const updated = input.replace_all
            ? content.split(input.old_string as string).join(input.new_string as string)
            : content.replace(input.old_string as string, input.new_string as string)
          await window.api.writeFileContent(input.file_path, updated)
          appliedFiles.push(input.file_path)
        }
      }
    }

    setPendingApprovals([])

    // Resume the conversation telling Claude what was applied
    if (approvalConvId) {
      const msg = appliedFiles.length > 0
        ? `I approved and applied changes to: ${appliedFiles.join(', ')}. Continue.`
        : 'I approved the requested tools. Continue.'
      processMessage(msg, [], approvalConvId)
    }
    setApprovalConvId(null)
  }, [approvalConvId, processMessage])

  const handleApproveAllForSession = useCallback(() => {
    // Switch to full access and resume
    setPermissionMode('full')
    setPendingApprovals([])
    if (approvalConvId) {
      processMessage('I switched to full access mode. Continue with all permissions granted.', [], approvalConvId)
    }
    setApprovalConvId(null)
  }, [approvalConvId, processMessage, setPermissionMode])

  const handleRejectAllChanges = useCallback(() => {
    setPendingApprovals([])
    if (approvalConvId) {
      processMessage('I rejected all proposed changes. Please suggest a different approach.', [], approvalConvId)
    }
    setApprovalConvId(null)
  }, [approvalConvId, processMessage])

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
    setPlanContent(content)
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

  // Keyboard shortcut: Ctrl+` or Cmd+` to toggle terminal
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === '`' && (e.ctrlKey || e.metaKey) && activeProject) {
        e.preventDefault()
        setTerminalOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeProject])

  return (
    <SidebarProvider className="bg-td-bg text-td-text">
      <AppSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConvs}
        interruptedConversations={interruptedConvIds}
        queuedCounts={new Map(Array.from(messageQueue.current.entries()).map(([k, v]) => [k, v.length]))}
        onSelectProject={setActiveProjectId}
        onSelectConversation={setActiveConversationId}
        onNewChat={handleNewChat}
        onAddProject={handleAddProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onArchiveConversation={handleArchiveConversation}
        onDeleteAllArchived={handleDeleteAllArchived}
        onNewChatForProject={handleNewChatForProject}
        onOpenSettings={() => setSettingsOpen(true)}
        recentlyRetitled={recentlyRetitled}
      />
      {settingsOpen ? (
        <SettingsPage project={activeProject} onClose={() => setSettingsOpen(false)} onTestPlanSidebar={() => {
          const testPlan = '## Test Plan\n\n1. **Step 1:** Read the codebase structure\n2. **Step 2:** Identify the relevant files\n3. **Step 3:** Implement the changes\n4. **Step 4:** Run tests and verify\n\n> This is a simulated plan to test the sidebar rendering.'
          setPlanContent(testPlan)
          setPlanSidebarOpen(true)
          setSettingsOpen(false)
        }} />
      ) : (
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar
          project={activeProject}
          conversation={activeConversation}
          permissionMode={permissionMode}
          gitBranch={gitBranch}
          onBranchChange={setGitBranch}
          onGitInit={handleGitInit}
          onOpenInExplorer={handleOpenInExplorer}
          onOpenInTerminal={handleOpenInTerminal}
          onAddFile={handleAddFile}
        />
        {activeProject ? (
          <>
            <div className="flex flex-1 min-h-0">
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex-1 flex flex-col min-h-0">
                  <ChatArea
                    messages={activeConversation?.messages || []}
                    isLoading={isLoading}
                    permissionMode={permissionMode}
                    pendingApprovals={pendingApprovals}
                    onApproveTools={handleApproveChanges}
                    onApproveAllForSession={handleApproveAllForSession}
                    onRejectTools={handleRejectAllChanges}
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
                  onPlanChange={(content) => {
                    setPlanContent(content)
                    if (activeConversationId) planDrafts.current.set(activeConversationId, content)
                  }}
                  onExecutePlan={handleExecutePlan}
                  onClose={() => setPlanSidebarOpen(false)}
                  isStreaming={isLoading}
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
            <InputBar
              conversationId={activeConversationId}
              onSend={handleSend}
              onCancel={handleCancel}
              onNewChat={handleNewChat}
              onClearConversation={handleClearConversation}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenInExplorer={handleOpenInExplorer}
              onOpenInTerminal={handleOpenInTerminal}
              onAddFile={handleAddFile}
              isLoading={isLoading}
              queueLength={activeConversationId ? (messageQueue.current.get(activeConversationId)?.length ?? 0) : 0}
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
              useWorktree={useWorktree}
              onUseWorktreeChange={setUseWorktree}
              onShowUsage={() => setUsageOpen(true)}
              apiMode={apiMode}
              onApiModeChange={setApiMode}
              apiProvider={apiProvider}
              onApiProviderChange={setApiProvider}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              customModel={customModel}
              onCustomModelChange={setCustomModel}
            />
            <UsageDialog
              open={usageOpen}
              onOpenChange={setUsageOpen}
              usage={activeConversationId ? (usageMap.current.get(activeConversationId) || null) : null}
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
