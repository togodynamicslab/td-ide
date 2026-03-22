import { ElectronAPI } from '@electron-toolkit/preload'

interface ClaudeAPI {
  // Window controls
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>

  // Claude process
  sendMessage: (message: string, conversationId: string, cwd: string, model: string, effort: string, permissionMode: string, disabledTools?: string[]) => void
  cancelMessage: (conversationId: string) => void

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
  generateTitle: (conversationId: string, userMessage: string) => Promise<string | null>
  deleteConversation: (id: string) => Promise<boolean>

  // DB — Messages
  getMessages: (conversationId: string) => Promise<unknown[]>
  addMessage: (id: string, conversationId: string, role: 'user' | 'assistant', content: string, tools: string, reasoning: string, images: string) => Promise<boolean>
  updateMessage: (id: string, content: string, tools: string, reasoning: string, duration?: number) => Promise<boolean>

  // Notifications
  showNotification: (title: string, body: string) => Promise<boolean>
  generateNotificationSummary: (assistantText: string, conversationTitle: string) => Promise<string | null>

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
