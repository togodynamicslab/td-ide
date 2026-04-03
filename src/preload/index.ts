import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  // Claude process (ACP)
  sendMessage: (message: string, conversationId: string, cwd: string, permissionMode = 'default') => {
    ipcRenderer.send('claude:send-message', { message, conversationId, cwd, permissionMode })
  },
  cancelMessage: (conversationId: string) => {
    ipcRenderer.send('claude:cancel', { conversationId })
  },

  // Permission handling (ACP)
  onPermissionRequest: (callback: (data: { conversationId: string; requestId: string; toolCall: unknown; options: unknown[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { conversationId: string; requestId: string; toolCall: unknown; options: unknown[] }) =>
      callback(payload)
    ipcRenderer.on('claude:permission-request', handler)
    return () => ipcRenderer.removeListener('claude:permission-request', handler)
  },
  respondToPermission: (requestId: string, optionId: string) => {
    ipcRenderer.send('claude:permission-response', { requestId, optionId })
  },

  // Dialog / files
  openFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:openFolder')
  },
  saveImage: (dataUrl: string, filename: string): Promise<string> => {
    return ipcRenderer.invoke('image:save', { dataUrl, filename })
  },

  // Git
  gitStatus: (cwd: string): Promise<{ isRepo: boolean; branch: string | null }> => {
    return ipcRenderer.invoke('git:status', { cwd })
  },
  gitInit: (cwd: string): Promise<{ success: boolean; branch?: string; error?: string }> => {
    return ipcRenderer.invoke('git:init', { cwd })
  },
  gitBranches: (cwd: string): Promise<{ success: boolean; branches: { name: string; current: boolean }[] }> => {
    return ipcRenderer.invoke('git:branches', { cwd })
  },
  gitCheckout: (cwd: string, branch: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('git:checkout', { cwd, branch })
  },
  gitCreateBranch: (cwd: string, branch: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('git:create-branch', { cwd, branch })
  },
  gitDeleteBranch: (cwd: string, branch: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('git:delete-branch', { cwd, branch })
  },
  gitWorktreeList: (cwd: string): Promise<{ success: boolean; worktrees: { path: string; branch: string; bare: boolean; current: boolean }[] }> => {
    return ipcRenderer.invoke('git:worktree-list', { cwd })
  },
  gitWorktreeAdd: (cwd: string, path: string, branch?: string, newBranch?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('git:worktree-add', { cwd, path, branch, newBranch })
  },
  gitWorktreeRemove: (cwd: string, path: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('git:worktree-remove', { cwd, path })
  },

  // MCP
  getMcpServers: (projectPath: string): Promise<{ installed: Record<string, unknown>; global: Record<string, unknown>; marketplace: unknown[] }> => {
    return ipcRenderer.invoke('mcp:get-servers', { projectPath })
  },
  addMcpServer: (projectPath: string, name: string, config: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('mcp:add-server', { projectPath, name, config })
  },
  removeMcpServer: (projectPath: string, name: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('mcp:remove-server', { projectPath, name })
  },
  updateMcpServer: (projectPath: string, name: string, config: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('mcp:update-server', { projectPath, name, config })
  },

  // Shell
  openInExplorer: (cwd: string): Promise<boolean> => {
    return ipcRenderer.invoke('shell:openInExplorer', { cwd })
  },
  openInTerminal: (cwd: string): Promise<boolean> => {
    return ipcRenderer.invoke('shell:openInTerminal', { cwd })
  },
  executeCommand: (command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> => {
    return ipcRenderer.invoke('shell:execute', { command, cwd })
  },

  // File operations
  readFileContent: (filePath: string): Promise<{ content: string; exists: boolean }> => {
    return ipcRenderer.invoke('fs:read-file', { filePath })
  },
  writeFileContent: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('fs:write-file', { filePath, content })
  },
  findFiles: (rootDir: string, filename: string, maxDepth?: number): Promise<{ files: string[] }> => {
    return ipcRenderer.invoke('fs:find-files', { rootDir, filename, maxDepth })
  },
  listDirectory: (dirPath: string): Promise<{ files: { name: string; isDirectory: boolean }[] }> => {
    return ipcRenderer.invoke('fs:list-directory', { dirPath })
  },
  deleteFile: (filePath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('fs:delete-file', { filePath })
  },
  getHomedir: (): Promise<string> => {
    return ipcRenderer.invoke('app:get-homedir')
  },

  // File picker
  openFile: (cwd: string): Promise<string[] | null> => {
    return ipcRenderer.invoke('dialog:openFile', { cwd })
  },

  // DB — Projects
  getProjects: (): Promise<unknown[]> => {
    return ipcRenderer.invoke('db:get-projects')
  },
  addProject: (id: string, name: string, path: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:add-project', { id, name, path })
  },
  renameProject: (id: string, name: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:rename-project', { id, name })
  },
  deleteProject: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:delete-project', { id })
  },

  // DB — Conversations
  getConversations: (projectId: string): Promise<unknown[]> => {
    return ipcRenderer.invoke('db:get-conversations', { projectId })
  },
  addConversation: (id: string, projectId: string, title: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:add-conversation', { id, projectId, title })
  },
  renameConversation: (id: string, title: string, titleEdited?: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('db:rename-conversation', { id, title, titleEdited })
  },
  archiveConversation: (id: string, archived: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('db:archive-conversation', { id, archived })
  },
  generateTitle: (conversationId: string, userMessage: string, assistantMessage?: string): Promise<string | null> => {
    return ipcRenderer.invoke('db:generate-title', { conversationId, userMessage, assistantMessage })
  },
  setConversationWorktree: (id: string, worktreePath: string | null): Promise<boolean> => {
    return ipcRenderer.invoke('db:set-conversation-worktree', { id, worktreePath })
  },
  getConversationWorktree: (id: string): Promise<string | null> => {
    return ipcRenderer.invoke('db:get-conversation-worktree', { id })
  },
  deleteConversation: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:delete-conversation', { id })
  },
  deleteArchivedConversations: (projectId: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:delete-archived-conversations', { projectId })
  },

  // DB — Messages
  getMessages: (conversationId: string): Promise<unknown[]> => {
    return ipcRenderer.invoke('db:get-messages', { conversationId })
  },
  addMessage: (id: string, conversationId: string, role: 'user' | 'assistant', content: string, tools: string, reasoning: string, images: string, contentBlocks = '[]'): Promise<boolean> => {
    return ipcRenderer.invoke('db:add-message', { id, conversationId, role, content, tools, reasoning, images, contentBlocks })
  },
  updateMessage: (id: string, content: string, tools: string, reasoning: string, duration?: number, contentBlocks = '[]'): Promise<boolean> => {
    return ipcRenderer.invoke('db:update-message', { id, content, tools, reasoning, duration, contentBlocks })
  },

  // Notifications
  showNotification: (title: string, body: string, conversationId?: string): Promise<boolean> => {
    return ipcRenderer.invoke('notify:show', { title, body, conversationId })
  },
  generateNotificationSummary: (assistantText: string, conversationTitle: string): Promise<string | null> => {
    return ipcRenderer.invoke('notify:generate-summary', { assistantText, conversationTitle })
  },
  onNotificationNavigate: (callback: (data: { conversationId: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { conversationId: string }): void => callback(data)
    ipcRenderer.on('notify:navigate', handler)
    return () => { ipcRenderer.removeListener('notify:navigate', handler) }
  },

  // Terminal
  terminalCreate: (id: string, cwd: string, shell?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('terminal:create', { id, cwd, shell })
  },
  terminalInput: (id: string, data: string): void => {
    ipcRenderer.send('terminal:input', { id, data })
  },
  terminalResize: (id: string, cols: number, rows: number): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('terminal:resize', { id, cols, rows })
  },
  terminalClose: (id: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('terminal:close', { id })
  },
  onTerminalData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) =>
      callback(payload.id, payload.data)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; exitCode: number }) =>
      callback(payload.id, payload.exitCode)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },

  // App State (session recovery)
  getAppState: (key: string): Promise<string | null> => {
    return ipcRenderer.invoke('state:get', { key })
  },
  setAppState: (key: string, value: string): Promise<boolean> => {
    return ipcRenderer.invoke('state:set', { key, value })
  },
  getAllAppState: (): Promise<Record<string, string>> => {
    return ipcRenderer.invoke('state:get-all')
  },
  getMemoryUsage: (): Promise<{
    main: { rss: number; heapUsed: number; heapTotal: number }
    claude: { conversationId: string; rss: number }[]
  }> => {
    return ipcRenderer.invoke('process:get-memory-usage')
  },
  getInterruptedProcesses: (): Promise<{ conversationId: string; pid: number; startedAt: number; alive: boolean }[]> => {
    return ipcRenderer.invoke('process:get-interrupted')
  },
  killOrphanProcess: (pid: number): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('process:kill-orphan', { pid })
  },

  // Stream listeners
  onStream: (callback: (conversationId: string, data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { conversationId: string; data: unknown }) =>
      callback(payload.conversationId, payload.data)
    ipcRenderer.on('claude:stream', handler)
    return () => ipcRenderer.removeListener('claude:stream', handler)
  },
  onError: (callback: (conversationId: string, error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { conversationId: string; error: string }) =>
      callback(payload.conversationId, payload.error)
    ipcRenderer.on('claude:error', handler)
    return () => ipcRenderer.removeListener('claude:error', handler)
  },
  onDone: (callback: (conversationId: string, cancelled: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { conversationId: string; cancelled?: boolean }) =>
      callback(payload.conversationId, !!payload.cancelled)
    ipcRenderer.on('claude:done', handler)
    return () => ipcRenderer.removeListener('claude:done', handler)
  },
  onAgentClosed: (callback: (conversationId: string, code: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { conversationId: string; code: number }) =>
      callback(payload.conversationId, payload.code)
    ipcRenderer.on('claude:agent-closed', handler)
    return () => ipcRenderer.removeListener('claude:agent-closed', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
