import { ElectronAPI } from '@electron-toolkit/preload'

interface ClaudeAPI {
  // Window controls
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>

  // Claude process (ACP)
  sendMessage: (message: string, conversationId: string, cwd: string, permissionMode?: string) => void
  cancelMessage: (conversationId: string) => void

  // Permission handling (ACP)
  onPermissionRequest: (callback: (data: { conversationId: string; requestId: string; toolCall: unknown; options: unknown[] }) => void) => () => void
  respondToPermission: (requestId: string, optionId: string) => void

  // File operations
  readFileContent: (filePath: string) => Promise<{ content: string; exists: boolean }>
  writeFileContent: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  findFiles: (rootDir: string, filename: string, maxDepth?: number) => Promise<{ files: string[] }>
  listDirectory: (dirPath: string) => Promise<{ files: { name: string; isDirectory: boolean }[] }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getHomedir: () => Promise<string>

  // Dialog / files
  openFolder: () => Promise<string | null>
  openFile: (cwd: string) => Promise<string[] | null>
  saveImage: (dataUrl: string, filename: string) => Promise<string>

  // Git
  gitStatus: (cwd: string) => Promise<{ isRepo: boolean; branch: string | null }>
  gitInit: (cwd: string) => Promise<{ success: boolean; branch?: string; error?: string }>
  gitBranches: (cwd: string) => Promise<{ success: boolean; branches: { name: string; current: boolean }[] }>
  gitCheckout: (cwd: string, branch: string) => Promise<{ success: boolean; error?: string }>
  gitCreateBranch: (cwd: string, branch: string) => Promise<{ success: boolean; error?: string }>
  gitDeleteBranch: (cwd: string, branch: string) => Promise<{ success: boolean; error?: string }>
  gitWorktreeList: (cwd: string) => Promise<{ success: boolean; worktrees: { path: string; branch: string; bare: boolean; current: boolean }[] }>
  gitWorktreeAdd: (cwd: string, path: string, branch?: string, newBranch?: string) => Promise<{ success: boolean; error?: string }>
  gitWorktreeRemove: (cwd: string, path: string) => Promise<{ success: boolean; error?: string }>

  // MCP
  getMcpServers: (projectPath: string) => Promise<{ installed: Record<string, unknown>; global: Record<string, unknown>; marketplace: unknown[] }>
  addMcpServer: (projectPath: string, name: string, config: unknown) => Promise<{ success: boolean; error?: string }>
  removeMcpServer: (projectPath: string, name: string) => Promise<{ success: boolean; error?: string }>
  updateMcpServer: (projectPath: string, name: string, config: unknown) => Promise<{ success: boolean; error?: string }>

  // Shell
  openInExplorer: (cwd: string) => Promise<boolean>
  openInTerminal: (cwd: string) => Promise<boolean>
  executeCommand: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>

  // Terminal
  terminalCreate: (id: string, cwd: string, shell?: string) => Promise<{ success: boolean; error?: string }>
  terminalInput: (id: string, data: string) => void
  terminalResize: (id: string, cols: number, rows: number) => Promise<{ success: boolean }>
  terminalClose: (id: string) => Promise<{ success: boolean }>
  onTerminalData: (callback: (id: string, data: string) => void) => () => void
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void

  // DB — Projects
  getProjects: () => Promise<unknown[]>
  addProject: (id: string, name: string, path: string) => Promise<boolean>
  renameProject: (id: string, name: string) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>

  // DB — Conversations
  getConversations: (projectId: string) => Promise<unknown[]>
  addConversation: (id: string, projectId: string, title: string) => Promise<boolean>
  renameConversation: (id: string, title: string, titleEdited?: boolean) => Promise<boolean>
  archiveConversation: (id: string, archived: boolean) => Promise<boolean>
  generateTitle: (conversationId: string, userMessage: string, assistantMessage?: string) => Promise<string | null>
  setConversationWorktree: (id: string, worktreePath: string | null) => Promise<boolean>
  getConversationWorktree: (id: string) => Promise<string | null>
  deleteConversation: (id: string) => Promise<boolean>
  deleteArchivedConversations: (projectId: string) => Promise<boolean>

  // DB — Messages
  getMessages: (conversationId: string) => Promise<unknown[]>
  addMessage: (id: string, conversationId: string, role: 'user' | 'assistant', content: string, tools: string, reasoning: string, images: string, contentBlocks?: string) => Promise<boolean>
  updateMessage: (id: string, content: string, tools: string, reasoning: string, duration?: number, contentBlocks?: string) => Promise<boolean>

  // Notifications
  showNotification: (title: string, body: string, conversationId?: string) => Promise<boolean>
  generateNotificationSummary: (assistantText: string, conversationTitle: string) => Promise<string | null>
  onNotificationNavigate: (callback: (data: { conversationId: string }) => void) => () => void

  // App State (session recovery)
  getAppState: (key: string) => Promise<string | null>
  setAppState: (key: string, value: string) => Promise<boolean>
  getAllAppState: () => Promise<Record<string, string>>
  getMemoryUsage: () => Promise<{
    main: { rss: number; heapUsed: number; heapTotal: number }
    claude: { conversationId: string; rss: number }[]
  }>
  getInterruptedProcesses: () => Promise<{ conversationId: string; pid: number; startedAt: number; alive: boolean }[]>
  killOrphanProcess: (pid: number) => Promise<{ success: boolean }>

  // Stream listeners
  onStream: (callback: (conversationId: string, data: unknown) => void) => () => void
  onError: (callback: (conversationId: string, error: string) => void) => () => void
  onDone: (callback: (conversationId: string, cancelled: boolean) => void) => () => void
  onAgentClosed: (callback: (conversationId: string, code: number) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ClaudeAPI
  }
}
