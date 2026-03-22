import { useState, useCallback, useEffect, useRef } from 'react'
import AppSidebar from './components/Sidebar'
import { SidebarProvider } from './components/ui/sidebar'
import TopBar from './components/TopBar'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import PermissionBanner from './components/PermissionBanner'
import PlanSidebar from './components/PlanSidebar'
import SettingsPage from './components/SettingsPage'

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

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools: ToolBlock[]
  reasoning: string
  images: ImageAttachment[]
  duration?: number
  timestamp: Date
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  archived: boolean
  titleEdited: boolean
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
export type PermissionMode = 'full' | 'default' | 'plan'

interface StreamBuffer {
  text: string
  tools: ToolBlock[]
  reasoning: string
  assistantMsgId: string
  startedAt: number
  permissionMode: PermissionMode
}

function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingConvs, setLoadingConvs] = useState<Set<string>>(new Set())
  const [selectedModel, setSelectedModel] = useState<ModelId>('opus')
  const [effortLevel, setEffortLevel] = useState<EffortLevel>('high')
  const [perConvPermission, setPerConvPermission] = useState<Map<string, PermissionMode>>(new Map())
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set())
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [deniedCount, setDeniedCount] = useState(0)
  const [deniedConversationId, setDeniedConversationId] = useState<string | null>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [planSidebarOpen, setPlanSidebarOpen] = useState(false)

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
    : 'full'
  const setPermissionMode = useCallback((mode: PermissionMode) => {
    const key = activeConversationId || '__new__'
    setPerConvPermission((prev) => {
      const next = new Map(prev)
      next.set(key, mode)
      return next
    })
  }, [activeConversationId])

  // --- Load projects from DB on mount ---
  useEffect(() => {
    window.api.getProjects().then((rows) => {
      const loaded: Project[] = (rows as { id: string; name: string; path: string; createdAt: Date }[]).map((r) => ({
        id: r.id,
        name: r.name,
        path: r.path,
        conversations: [],
        createdAt: r.createdAt
      }))
      setProjects(loaded)
    })
  }, [])

  // --- Load conversations when project changes ---
  useEffect(() => {
    if (!activeProjectId) return
    window.api.getConversations(activeProjectId).then((rows) => {
      const convs: Conversation[] = (rows as { id: string; title: string; archived: boolean | number; titleEdited: boolean | number; createdAt: Date }[]).map((r) => ({
        id: r.id,
        title: r.title,
        messages: [],
        archived: !!r.archived,
        titleEdited: !!r.titleEdited,
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
        tools: string; reasoning: string; images: string; duration: number | null; createdAt: Date
      }[]).map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        tools: JSON.parse(r.tools || '[]'),
        reasoning: r.reasoning || '',
        images: JSON.parse(r.images || '[]'),
        ...(r.duration != null ? { duration: r.duration } : {}),
        timestamp: new Date(r.createdAt)
      }))
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
      if (!activeProjectId) return ''
      const id = Date.now().toString()
      await window.api.addConversation(id, activeProjectId, title)
      const conversation: Conversation = {
        id,
        title,
        messages: [],
        archived: false,
        titleEdited: false,
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
    [activeProjectId]
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
    (conversationId: string, content: string, tools: ToolBlock[], reasoning: string, duration?: number) => {
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          conversations: p.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const messages = [...c.messages]
            const lastIdx = messages.length - 1
            if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
              messages[lastIdx] = { ...messages[lastIdx], content, tools: [...tools], reasoning, ...(duration != null ? { duration } : {}) }
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
        tools: [], reasoning: '', images: [], timestamp: new Date()
      }
      addMessage(convId, userMessage)
      window.api.addMessage(userMsgId, convId, 'user', text, '[]', '', '[]')

      // Assistant placeholder
      const assistantMsgId = (Date.now() + 1).toString()
      const assistantMessage: Message = {
        id: assistantMsgId, role: 'assistant', content: '',
        tools: [], reasoning: '', images: [], timestamp: new Date()
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

        updateLastAssistantMessage(convId!, content, [], '', duration)
        window.api.updateMessage(assistantMsgId, content, '[]', '', duration)
      } catch (err) {
        const duration = Date.now() - startedAt
        const content = `**Error:** ${(err as Error).message || 'Command execution failed'}`
        updateLastAssistantMessage(convId!, content, [], '', duration)
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
        timestamp: new Date()
      }
      addMessage(convId, assistantMessage)
      window.api.addMessage(assistantMsgId, convId, 'assistant', '', '[]', '', '[]')

      // Initialize per-conversation buffer
      buffers.current.set(convId, { text: '', tools: [], reasoning: '', assistantMsgId, startedAt: Date.now(), permissionMode })

      setLoadingConvs((prev) => new Set(prev).add(convId!))
      window.api.sendMessage(messageText, convId, activeProject.path, selectedModel, effortLevel, permissionMode, Array.from(disabledTools))
    },
    [activeConversationId, activeProject, activeProjectId, createConversation, addMessage, selectedModel, effortLevel, permissionMode, disabledTools]
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
      const buf = buffers.current.get(conversationId)
      if (!buf) return

      if (c.type === 'assistant' && c.message) {
        const msg = c.message as Record<string, unknown>
        if (msg.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            const b = block as Record<string, unknown>
            if (b.type === 'text' && typeof b.text === 'string') {
              buf.text += b.text
            } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
              buf.reasoning += b.thinking
            } else if (b.type === 'tool_use') {
              buf.tools.push({
                id: (b.id as string) || Date.now().toString(),
                name: (b.name as string) || 'Unknown',
                input: (b.input as Record<string, unknown>) || {}
              })
            }
          }
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning)
        }
      } else if (c.type === 'content_block_delta') {
        const delta = c.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          buf.text += delta.text
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning)
        } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          buf.reasoning += delta.thinking
          updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning)
        }
      } else if (c.type === 'result') {
        const duration = Date.now() - buf.startedAt
        if (typeof c.result === 'string') {
          buf.text = c.result as string
        }
        updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, duration)

        // Auto-capture plan content when in plan mode
        if (buf.permissionMode === 'plan' && buf.text.trim()) {
          planDrafts.current.set(conversationId, buf.text)
          setPlanSidebarOpen(true)
        }

        const denials = c.permission_denials as unknown[] | undefined
        if (denials && Array.isArray(denials) && denials.length > 0) {
          setPermissionDenied(true)
          setDeniedCount(denials.length)
          setDeniedConversationId(conversationId)
        }
        // Save final text for notification before buffer is deleted
        finalTexts.current.set(conversationId, buf.text)
        // Persist final assistant message to DB
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration)
        buffers.current.delete(conversationId)
      }
    })

    const unsubError = window.api.onError((conversationId: string, error: string) => {
      const buf = buffers.current.get(conversationId)
      if (!buf) return
      buf.text += `\n[Error: ${error}]`
      updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning)
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
        updateLastAssistantMessage(conversationId, buf.text, buf.tools, buf.reasoning, duration)
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration)
        buffers.current.delete(conversationId)
      }
      setLoadingConvs((prev) => {
        const next = new Set(prev)
        next.delete(conversationId)
        return next
      })

      // Auto-generate title after first response if not manually edited
      setProjects((prev) => {
        for (const p of prev) {
          const conv = p.conversations.find((c) => c.id === conversationId)
          if (conv && !conv.titleEdited && conv.messages.length <= 2) {
            const firstUserMsg = conv.messages.find((m) => m.role === 'user')
            if (firstUserMsg) {
              window.api.generateTitle(conversationId, firstUserMsg.content).then((newTitle) => {
                if (newTitle) {
                  setProjects((p2) =>
                    p2.map((proj) => ({
                      ...proj,
                      conversations: proj.conversations.map((c) =>
                        c.id === conversationId ? { ...c, title: newTitle } : c
                      )
                    }))
                  )
                }
              })
            }
            break
          }
        }
        return prev
      })

      // Send desktop notification with AI-generated summary
      if (assistantText) {
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
        updateLastAssistantMessage(activeConversationId, buf.text, buf.tools, buf.reasoning, duration)
        window.api.updateMessage(buf.assistantMsgId, buf.text, JSON.stringify(buf.tools), buf.reasoning, duration)
        buffers.current.delete(activeConversationId)
      }
    }
  }, [activeConversationId, updateLastAssistantMessage])

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
    if (activeProject) window.api.openInTerminal(activeProject.path)
  }, [activeProject])

  const handleExecutePlan = useCallback((plan: string) => {
    // Switch to full access and send the plan as a message
    setPermissionMode('full')
    setPlanSidebarOpen(false)
    handleSend(`Execute this plan:\n\n${plan}`)
  }, [handleSend])

  const currentPlanContent = activeConversationId
    ? planDrafts.current.get(activeConversationId) || ''
    : ''

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

  return (
    <SidebarProvider className="bg-td-bg text-td-text">
      <AppSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConvs}
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
        onNewChatForProject={handleNewChatForProject}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen ? (
        <SettingsPage project={activeProject} onClose={() => setSettingsOpen(false)} />
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
                <ChatArea
                  messages={activeConversation?.messages || []}
                  isLoading={isLoading}
                  permissionMode={permissionMode}
                />
              </div>
              {planSidebarOpen && (
                <PlanSidebar
                  planContent={currentPlanContent}
                  onPlanChange={(content) => {
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
                setDeniedConversationId(null)
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
              disabledTools={disabledTools}
              onToggleTool={(tool) => setDisabledTools((prev) => {
                const next = new Set(prev)
                if (next.has(tool)) next.delete(tool)
                else next.add(tool)
                return next
              })}
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
