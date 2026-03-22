import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  // Claude process
  sendMessage: (message: string, conversationId: string, cwd: string, model: string, effort: string, permissionMode: string, disabledTools: string[] = []) => {
    ipcRenderer.send('claude:send-message', { message, conversationId, cwd, model, effort, permissionMode, disabledTools })
  },
  cancelMessage: (conversationId: string) => {
    ipcRenderer.send('claude:cancel', { conversationId })
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
  generateTitle: (conversationId: string, userMessage: string): Promise<string | null> => {
    return ipcRenderer.invoke('db:generate-title', { conversationId, userMessage })
  },
  deleteConversation: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:delete-conversation', { id })
  },

  // DB — Messages
  getMessages: (conversationId: string): Promise<unknown[]> => {
    return ipcRenderer.invoke('db:get-messages', { conversationId })
  },
  addMessage: (id: string, conversationId: string, role: 'user' | 'assistant', content: string, tools: string, reasoning: string, images: string): Promise<boolean> => {
    return ipcRenderer.invoke('db:add-message', { id, conversationId, role, content, tools, reasoning, images })
  },
  updateMessage: (id: string, content: string, tools: string, reasoning: string, duration?: number): Promise<boolean> => {
    return ipcRenderer.invoke('db:update-message', { id, content, tools, reasoning, duration })
  },

  // Notifications
  showNotification: (title: string, body: string): Promise<boolean> => {
    return ipcRenderer.invoke('notify:show', { title, body })
  },
  generateNotificationSummary: (assistantText: string, conversationTitle: string): Promise<string | null> => {
    return ipcRenderer.invoke('notify:generate-summary', { assistantText, conversationTitle })
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
