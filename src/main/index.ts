import { app, shell, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess, execSync } from 'child_process'
import * as pty from 'node-pty'
import { getMcpServers, getGlobalMcpServers, getMarketplacePlugins, setMcpServer, removeMcpServer } from './mcp'
import { AcpClientManager } from './acp-client'
import {
  initDatabase,
  closeDatabase,
  getAllProjects,
  insertProject,
  updateProjectName,
  updateProjectAdditionalPaths,
  updateProjectOrder,
  deleteProject,
  getConversationsByProject,
  insertConversation,
  updateConversationTitle,
  getConversationSessionId,
  updateConversationSessionId,
  setConversationArchived,
  isConversationTitleEdited,
  setConversationWorktreePath,
  getConversationWorktreePath,
  deleteConversation,
  deleteArchivedConversations,
  getMessagesByConversation,
  insertMessage,
  updateMessage,
  getAppState,
  setAppState,
  getAllAppState,
  registerActiveProcess,
  removeActiveProcess,
  getAllActiveProcesses,
  clearAllActiveProcesses
} from './db'

// Enable GPU rasterization and performance optimizations
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization')

let mainWindow: BrowserWindow | null = null

// ACP client manager — single long-lived connection multiplexing all conversations
let acpManager: AcpClientManager

// Terminal PTY processes — one per terminal tab
const ptyProcesses = new Map<string, pty.IPty>()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'td-ide',
    backgroundColor: '#0f0f17',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false,
      v8CacheOptions: 'bypassHeatCheck'
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

// --- Dialog / Image handlers ---

ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:openFolders', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths
})

ipcMain.handle('image:save', async (_event, { dataUrl, filename }: { dataUrl: string; filename: string }) => {
  const tmpDir = join(app.getPath('temp'), 'td-ide-images')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const filePath = join(tmpDir, `${Date.now()}-${filename}`)
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return filePath
})

// --- File operations ---

ipcMain.handle('fs:read-file', async (_event, { filePath }: { filePath: string }) => {
  try {
    if (!existsSync(filePath)) return { content: '', exists: false }
    const content = readFileSync(filePath, 'utf-8')
    return { content, exists: true }
  } catch {
    return { content: '', exists: false }
  }
})

ipcMain.handle('fs:write-file', async (_event, { filePath, content }: { filePath: string; content: string }) => {
  try {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('fs:find-files', async (_event, { rootDir, filename, maxDepth = 1 }: { rootDir: string; filename: string; maxDepth?: number }) => {
  const results: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return
    try {
      for (const entry of readdirSync(dir)) {
        if (entry === filename) results.push(join(dir, entry))
        if (depth < maxDepth && !entry.startsWith('.') && entry !== 'node_modules') {
          const full = join(dir, entry)
          try { if (statSync(full).isDirectory()) walk(full, depth + 1) } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(rootDir, 0)
  return { files: results }
})

ipcMain.handle('fs:find-latest-plan-file', async () => {
  const plansDir = join(homedir(), '.claude', 'plans')
  if (!existsSync(plansDir)) return null
  try {
    const files = readdirSync(plansDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ path: join(plansDir, f), mtime: statSync(join(plansDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    return files.length > 0 ? files[0].path : null
  } catch {
    return null
  }
})

ipcMain.handle('fs:list-directory', async (_event, { dirPath }: { dirPath: string }) => {
  try {
    if (!existsSync(dirPath)) return { files: [] }
    const entries = readdirSync(dirPath)
    const files = entries.map((name) => {
      try {
        return { name, isDirectory: statSync(join(dirPath, name)).isDirectory() }
      } catch {
        return { name, isDirectory: false }
      }
    })
    return { files }
  } catch {
    return { files: [] }
  }
})

ipcMain.handle('fs:delete-file', async (_event, { filePath }: { filePath: string }) => {
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('app:get-homedir', () => homedir())

// --- DB IPC handlers ---

ipcMain.handle('db:get-projects', () => {
  return getAllProjects()
})

ipcMain.handle('db:add-project', (_event, { id, name, path, additionalPaths }: { id: string; name: string; path: string; additionalPaths?: string[] }) => {
  insertProject(id, name, path, additionalPaths)
  return true
})

ipcMain.handle('db:update-project-additional-paths', (_event, { id, additionalPaths }: { id: string; additionalPaths: string[] }) => {
  updateProjectAdditionalPaths(id, additionalPaths)
  return true
})

ipcMain.handle('db:rename-project', (_event, { id, name }: { id: string; name: string }) => {
  updateProjectName(id, name)
  return true
})

ipcMain.handle('db:delete-project', (_event, { id }: { id: string }) => {
  deleteProject(id)
  return true
})

ipcMain.handle('db:reorder-projects', (_event, { orderedIds }: { orderedIds: string[] }) => {
  updateProjectOrder(orderedIds)
  return true
})

ipcMain.handle('db:get-conversations', (_event, { projectId }: { projectId: string }) => {
  return getConversationsByProject(projectId)
})

ipcMain.handle('db:add-conversation', (_event, { id, projectId, title }: { id: string; projectId: string; title: string }) => {
  insertConversation(id, projectId, title)
  return true
})

ipcMain.handle('db:rename-conversation', (_event, { id, title, titleEdited }: { id: string; title: string; titleEdited?: boolean }) => {
  updateConversationTitle(id, title, !!titleEdited)
  return true
})

ipcMain.handle('db:archive-conversation', (_event, { id, archived }: { id: string; archived: boolean }) => {
  setConversationArchived(id, archived)
  return true
})

ipcMain.handle('db:set-conversation-worktree', (_event, { id, worktreePath }: { id: string; worktreePath: string | null }) => {
  setConversationWorktreePath(id, worktreePath)
  return true
})

ipcMain.handle('db:get-conversation-worktree', (_event, { id }: { id: string }) => {
  return getConversationWorktreePath(id)
})

ipcMain.handle('db:delete-conversation', (_event, { id }: { id: string }) => {
  deleteConversation(id)
  return true
})

ipcMain.handle('db:delete-archived-conversations', (_event, { projectId }: { projectId: string }) => {
  deleteArchivedConversations(projectId)
  return true
})

ipcMain.handle('db:generate-title', async (_event, { conversationId, userMessage, assistantMessage }: { conversationId: string; userMessage: string; assistantMessage?: string }) => {
  console.log('[td-ide] generate-title called | conv:', conversationId, '| userMsg:', userMessage?.slice(0, 80), '| assistantMsg:', assistantMessage?.slice(0, 80))
  if (isConversationTitleEdited(conversationId)) {
    console.log('[td-ide] generate-title SKIPPED — title was manually edited')
    return null
  }

  try {
    let context = `User: ${userMessage.slice(0, 400)}`
    if (assistantMessage) {
      context += `\n\nAssistant: ${assistantMessage.slice(0, 400)}`
    }
    const prompt = `Generate a very short title (2-4 words, no quotes, no punctuation) for this coding conversation. Examples: "Stream Fix", "Auth Refactor", "API Provider Setup". Reply with ONLY the title, nothing else.\n\n${context}`
    const raw = await new Promise<string>((resolve, reject) => {
      let output = ''
      const proc = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'text'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()
      proc.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString() })
      proc.on('close', () => resolve(output.trim()))
      proc.on('error', reject)
      const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')) }, 30000)
      proc.on('close', () => clearTimeout(timer))
    })

    // Handle JSON output
    let title = raw
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw)
        title = parsed.result || parsed.text || raw
      } catch { /* not JSON, use raw */ }
    }
    // Strip ANSI codes and quotes
    title = title.replace(/\x1B\[[0-9;]*m/g, '').replace(/^["']|["']$/g, '').trim()
    console.log('[td-ide] generate-title raw:', JSON.stringify(raw).slice(0, 200), '| cleaned:', title)
    if (title && title.length > 0 && title.length < 100) {
      updateConversationTitle(conversationId, title)
      console.log('[td-ide] generate-title SUCCESS:', title)
      return title
    }
    console.log('[td-ide] generate-title REJECTED — empty or too long')
  } catch (err) {
    console.log('[td-ide] generate-title ERROR:', err)
  }
  return null
})

// --- Notifications ---

ipcMain.handle('notify:show', (_event, { title, body, conversationId }: { title: string; body: string; conversationId?: string }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, silent: false })
    notif.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
        if (conversationId) {
          win.webContents.send('notify:navigate', { conversationId })
        }
      }
    })
    notif.show()
  }
  return true
})

ipcMain.handle('notify:generate-summary', async (_event, { assistantText, conversationTitle }: { assistantText: string; conversationTitle: string }) => {
  try {
    const snippet = assistantText.slice(0, 800).replace(/\n+/g, ' ').trim()
    const prompt = `Write a 1-sentence summary (max 80 chars, no quotes, no markdown) of what this coding assistant accomplished: ${snippet}`
    const raw = await new Promise<string>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      const proc = spawn('claude', ['-p', '--model', 'haiku'], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()
      proc.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      proc.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim())
        } else {
          reject(new Error(stderr.trim() || `exit code ${code}`))
        }
      })
      proc.on('error', reject)
      const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')) }, 20000)
      proc.on('close', () => clearTimeout(timer))
    })

    // Strip ANSI codes and take first line only
    const summary = raw.replace(/\x1B\[[0-9;]*m/g, '').split('\n')[0].trim()
    return summary && summary.length > 0 ? summary.slice(0, 200) : null
  } catch {
    return null
  }
})

// --- Shell execution ---

ipcMain.handle('shell:execute', async (_event, { command, cwd }: { command: string; cwd: string }) => {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(command, {
      cwd: cwd || app.getPath('home'),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })
    proc.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code }))
    proc.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: -1 }))
    const timer = setTimeout(() => { proc.kill(); resolve({ stdout, stderr: stderr + '\n[Timed out after 60s]', exitCode: -1 }) }, 60000)
    proc.on('close', () => clearTimeout(timer))
  })
})

// --- Messages ---

ipcMain.handle('db:get-messages', (_event, { conversationId }: { conversationId: string }) => {
  return getMessagesByConversation(conversationId)
})

ipcMain.handle('db:add-message', (_event, { id, conversationId, role, content, tools, reasoning, images, contentBlocks }: {
  id: string; conversationId: string; role: 'user' | 'assistant'; content: string; tools: string; reasoning: string; images: string; contentBlocks?: string
}) => {
  insertMessage(id, conversationId, role, content, tools, reasoning, images, contentBlocks)
  return true
})

ipcMain.handle('db:update-message', (_event, { id, content, tools, reasoning, duration, contentBlocks }: {
  id: string; content: string; tools: string; reasoning: string; duration?: number; contentBlocks?: string
}) => {
  updateMessage(id, content, tools, reasoning, duration, contentBlocks)
  return true
})

// --- MCP handlers ---

ipcMain.handle('mcp:get-servers', (_event, { projectPath }: { projectPath: string }) => {
  return {
    installed: getMcpServers(projectPath),
    global: getGlobalMcpServers(),
    marketplace: getMarketplacePlugins()
  }
})

ipcMain.handle('mcp:add-server', (_event, { projectPath, name, config }: { projectPath: string; name: string; config: { command: string; args: string[]; env: Record<string, string> } }) => {
  try {
    setMcpServer(projectPath, name, config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('mcp:remove-server', (_event, { projectPath, name }: { projectPath: string; name: string }) => {
  try {
    removeMcpServer(projectPath, name)
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('mcp:update-server', (_event, { projectPath, name, config }: { projectPath: string; name: string; config: { command: string; args: string[]; env: Record<string, string> } }) => {
  try {
    setMcpServer(projectPath, name, config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

// --- Git handlers ---

function getGitBranch(cwd: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    try {
      return execSync('git symbolic-ref --short HEAD', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    } catch {
      return null
    }
  }
}

ipcMain.handle('git:status', (_event, { cwd }: { cwd: string }) => {
  const branch = getGitBranch(cwd)
  if (branch) return { isRepo: true, branch }
  try {
    execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { isRepo: true, branch: 'main' }
  } catch {
    return { isRepo: false, branch: null }
  }
})

ipcMain.handle('git:init', async (_event, { cwd }: { cwd: string }) => {
  try {
    execSync('git init', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    console.error('[td-ide] git init failed:', err)
    return { success: false, error: String((err as Error).message || err) }
  }
  const branch = getGitBranch(cwd) || 'main'
  return { success: true, branch }
})

ipcMain.handle('git:diff-stats', (_event, { cwd }: { cwd: string }) => {
  try {
    const raw = execSync('git diff --stat HEAD 2>/dev/null || git diff --stat', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
    let additions = 0
    let deletions = 0
    for (const line of raw.split('\n')) {
      const match = line.match(/(\d+) insertions?\(\+\)/)
      if (match) additions += Number(match[1])
      const delMatch = line.match(/(\d+) deletions?\(-\)/)
      if (delMatch) deletions += Number(delMatch[1])
    }
    return { additions, deletions }
  } catch {
    return { additions: 0, deletions: 0 }
  }
})

ipcMain.handle('git:diff-files', (_event, { cwd }: { cwd: string }) => {
  try {
    const raw = execSync('git diff --numstat HEAD 2>/dev/null || git diff --numstat', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
    const files: { file: string; additions: number; deletions: number }[] = []
    for (const line of raw.trim().split('\n')) {
      if (!line) continue
      const parts = line.split('\t')
      if (parts.length < 3) continue
      const additions = parts[0] === '-' ? 0 : Number(parts[0])
      const deletions = parts[1] === '-' ? 0 : Number(parts[1])
      files.push({ file: parts[2], additions, deletions })
    }
    return files
  } catch {
    return []
  }
})

ipcMain.handle('git:branches', (_event, { cwd }: { cwd: string }) => {
  try {
    const raw = execSync('git --no-pager branch --no-color', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
    const branches = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        name: line.replace(/^\*\s*/, ''),
        current: line.startsWith('*')
      }))
    return { success: true, branches }
  } catch {
    return { success: false, branches: [] }
  }
})

ipcMain.handle('git:checkout', (_event, { cwd, branch }: { cwd: string; branch: string }) => {
  try {
    execSync(`git checkout "${branch}"`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('git:create-branch', (_event, { cwd, branch }: { cwd: string; branch: string }) => {
  try {
    execSync(`git checkout -b "${branch}"`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('git:delete-branch', (_event, { cwd, branch }: { cwd: string; branch: string }) => {
  try {
    execSync(`git branch -d "${branch}"`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('git:worktree-list', (_event, { cwd }: { cwd: string }) => {
  try {
    const raw = execSync('git --no-pager worktree list --porcelain', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
    const worktrees: { path: string; branch: string; bare: boolean; current: boolean }[] = []
    let current: { path: string; branch: string; bare: boolean } | null = null
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current) worktrees.push({ ...current, current: false })
        current = { path: line.slice(9).trim(), branch: '', bare: false }
      } else if (line.startsWith('HEAD ')) {
        // skip
      } else if (line.startsWith('branch ')) {
        if (current) current.branch = line.slice(7).trim().replace(/^refs\/heads\//, '')
      } else if (line === 'bare') {
        if (current) current.bare = true
      } else if (line === '' && current) {
        worktrees.push({ ...current, current: false })
        current = null
      }
    }
    if (current) worktrees.push({ ...current, current: false })
    // Mark the main worktree (first one) or the one matching cwd
    const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase()
    for (const wt of worktrees) {
      if (wt.path.replace(/\\/g, '/').toLowerCase() === normalizedCwd) {
        wt.current = true
        break
      }
    }
    return { success: true, worktrees }
  } catch {
    return { success: false, worktrees: [] }
  }
})

ipcMain.handle('git:worktree-add', (_event, { cwd, path, branch, newBranch }: { cwd: string; path: string; branch?: string; newBranch?: string }) => {
  try {
    if (newBranch) {
      execSync(`git worktree add -b "${newBranch}" "${path}"`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    } else if (branch) {
      execSync(`git worktree add "${path}" "${branch}"`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    } else {
      return { success: false, error: 'branch or newBranch required' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('git:worktree-remove', (_event, { cwd, path }: { cwd: string; path: string }) => {
  try {
    execSync(`git worktree remove "${path}"`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

// --- Shell handlers ---

ipcMain.handle('shell:openInExplorer', (_event, { cwd }: { cwd: string }) => {
  shell.openPath(cwd)
  return true
})

ipcMain.handle('shell:openInTerminal', (_event, { cwd }: { cwd: string }) => {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], { cwd, shell: true, detached: true, stdio: 'ignore' })
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', cwd], { detached: true, stdio: 'ignore' })
  } else {
    spawn('x-terminal-emulator', [], { cwd, detached: true, stdio: 'ignore' })
  }
  return true
})

// --- Window controls ---

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// --- File picker ---

ipcMain.handle('dialog:openFile', async (_event, { cwd }: { cwd: string }) => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: cwd,
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths
})

// --- App State persistence ---

ipcMain.handle('state:get', (_event, { key }: { key: string }) => {
  return getAppState(key)
})

ipcMain.handle('state:set', (_event, { key, value }: { key: string; value: string }) => {
  setAppState(key, value)
  return true
})

ipcMain.handle('state:get-all', () => {
  return getAllAppState()
})

// --- Active process tracking ---

ipcMain.handle('process:get-interrupted', () => {
  // Return conversations that were running when the app last closed
  const processes = getAllActiveProcesses()
  // Check if any PIDs are still alive
  const results: { conversationId: string; pid: number; startedAt: number; alive: boolean }[] = []
  for (const proc of processes) {
    let alive = false
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(proc.pid, 0)
      alive = true
    } catch {
      alive = false
    }
    results.push({
      conversationId: proc.conversationId,
      pid: proc.pid,
      startedAt: proc.startedAt instanceof Date ? proc.startedAt.getTime() : Number(proc.startedAt),
      alive
    })
    // Clear stale session ID — can never be resumed after app restart
    updateConversationSessionId(proc.conversationId, null)
  }
  // Clear the table — these are from a previous session
  clearAllActiveProcesses()
  return results
})

ipcMain.handle('process:kill-orphan', (_event, { pid }: { pid: number }) => {
  try {
    process.kill(pid, 'SIGTERM')
    return { success: true }
  } catch {
    return { success: false }
  }
})

ipcMain.handle('agent:restart', async () => {
  try {
    if (acpManager) {
      await acpManager.shutdown()
      await acpManager.initialize()
    }
    return { success: true }
  } catch (err) {
    console.error('[td-ide] Agent restart error:', (err as Error).message)
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('process:get-memory-usage', () => {
  const mainMemory = process.memoryUsage()
  const agentInfo = acpManager?.getProcessInfo() || { pid: null, sessions: 0 }
  let agentRss = 0
  if (agentInfo.pid) {
    try {
      // Get memory for the agent process and all its child processes
      const pids = execSync(
        `echo ${agentInfo.pid} && pgrep -P ${agentInfo.pid} 2>/dev/null`,
        { encoding: 'utf-8', timeout: 2000 }
      ).trim().split('\n').filter(Boolean)
      const raw = execSync(
        `ps -o rss= -p ${pids.join(',')}`,
        { encoding: 'utf-8', timeout: 2000 }
      ).trim()
      agentRss = raw.split('\n').reduce((sum, line) => sum + (parseInt(line.trim(), 10) || 0), 0) * 1024
    } catch { /* process may have exited */ }
  }
  const activeSessions = acpManager?.getActiveSessions() || []
  return {
    main: { rss: mainMemory.rss, heapUsed: mainMemory.heapUsed, heapTotal: mainMemory.heapTotal },
    agent: { pid: agentInfo.pid, rss: agentRss, sessions: agentInfo.sessions },
    activeSessions
  }
})

// --- Claude ACP process management ---

// Format prior conversation messages as a context preamble for session recovery
function formatConversationHistory(messages: ReturnType<typeof getMessagesByConversation>): string {
  const MAX_REPLAY = 50
  const truncated = messages.length > MAX_REPLAY
  const recent = truncated ? messages.slice(-MAX_REPLAY) : messages
  const prefix = truncated
    ? `[Note: showing last ${MAX_REPLAY} of ${messages.length} messages from prior session]\n\n`
    : ''

  const lines = recent.map((msg) => {
    const role = msg.role === 'user' ? 'Human' : 'Assistant'
    let text = msg.content || ''

    if (msg.role === 'assistant' && msg.tools && msg.tools !== '[]') {
      try {
        const tools = JSON.parse(msg.tools) as Array<{ name?: string; tool?: string; status?: string }>
        if (tools.length > 0) {
          const toolSummary = tools
            .map((t) => `${t.name || t.tool || 'tool'}${t.status ? ` (${t.status})` : ''}`)
            .join(', ')
          text += (text ? '\n' : '') + `[Tools used: ${toolSummary}]`
        }
      } catch { /* ignore malformed tools JSON */ }
    }

    return `${role}: ${text}`
  })

  return `<conversation_history>\nThe following is the conversation history from a previous session that was interrupted. Continue from where you left off.\n\n${prefix}${lines.join('\n\n')}\n</conversation_history>`
}

// Map UI permission modes to ACP session mode IDs
const ACP_MODE_MAP: Record<string, string> = {
  full: 'bypassPermissions',
  default: 'acceptEdits',
  plan: 'plan',
  approve: 'default'
}

ipcMain.on('claude:send-message', async (_event, { message, conversationId, cwd, permissionMode, additionalDirectories }) => {
  try {
    const existingSessionId = conversationId ? getConversationSessionId(conversationId) : null
    const effectiveCwd = cwd || app.getPath('home')

    const acpModeId = ACP_MODE_MAP[permissionMode] || 'default'
    console.log('[td-ide] Permission mode:', permissionMode, '-> ACP mode:', acpModeId)

    let sessionId: string
    let needsHistoryReplay = false
    if (existingSessionId) {
      try {
        await acpManager.resumeSession(conversationId, existingSessionId, effectiveCwd, additionalDirectories)
        sessionId = existingSessionId
      } catch {
        // Resume failed — create new session with permission mode baked in
        sessionId = await acpManager.newSession(conversationId, effectiveCwd, acpModeId, additionalDirectories)
        updateConversationSessionId(conversationId, sessionId)
        needsHistoryReplay = true
      }
    } else {
      sessionId = await acpManager.newSession(conversationId, effectiveCwd, acpModeId, additionalDirectories)
      updateConversationSessionId(conversationId, sessionId)
    }

    // Also set mode after session creation/resume to ensure it's applied
    try {
      await acpManager.setMode(conversationId, acpModeId)
      console.log('[td-ide] setMode succeeded for', acpModeId)
    } catch (err) {
      console.warn('[td-ide:acp] setMode failed:', (err as Error).message)
    }

    // When session resume failed, replay conversation history so Claude has context
    let promptText = message
    if (needsHistoryReplay) {
      const priorMessages = getMessagesByConversation(conversationId)
      // Exclude the last user message (the one we're about to send)
      // It was already inserted into DB by the renderer before this IPC call
      const history = priorMessages.slice(0, -1)
      if (history.length > 0) {
        const historyBlock = formatConversationHistory(history)
        promptText = historyBlock + '\n\n' + message
        console.log('[td-ide] Replaying', history.length, 'messages as context for recovered session')
      }
    }

    const response = await acpManager.prompt(conversationId, promptText)

    // Send the prompt response (stop reason, usage) as a final stream event
    sendToRenderer('claude:stream', {
      conversationId,
      data: {
        sessionUpdate: 'prompt_complete',
        stopReason: response.stopReason,
        usage: response.usage
      }
    })

    sendToRenderer('claude:done', { conversationId })
  } catch (err) {
    const errMsg = (err as Error).message || String(err)
    console.error('[td-ide:acp] Error in send-message:', errMsg)
    sendToRenderer('claude:error', { conversationId, error: errMsg })
    sendToRenderer('claude:done', { conversationId, code: 1 })
  }
})

ipcMain.on('claude:cancel', async (_event, { conversationId }) => {
  try {
    await acpManager.cancel(conversationId)
  } catch (err) {
    console.error('[td-ide:acp] Cancel error:', (err as Error).message)
  }
  sendToRenderer('claude:done', { conversationId, code: -1, cancelled: true })
})

// Permission response from renderer
ipcMain.on('claude:permission-response', (_event, { requestId, optionId }: { requestId: string; optionId: string }) => {
  acpManager.resolvePermission(requestId, optionId)
})

// --- Terminal PTY handlers ---

function getDefaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  return process.env.SHELL || '/bin/zsh'
}

ipcMain.handle('terminal:create', (_event, { id, cwd, shell: shellPath }: { id: string; cwd: string; shell?: string }) => {
  try {
    const ptyProcess = pty.spawn(shellPath || getDefaultShell(), [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || app.getPath('home'),
      env: { ...process.env } as Record<string, string>
    })

    ptyProcesses.set(id, ptyProcess)

    ptyProcess.onData((data) => {
      sendToRenderer('terminal:data', { id, data })
    })

    ptyProcess.onExit(({ exitCode }) => {
      sendToRenderer('terminal:exit', { id, exitCode })
      ptyProcesses.delete(id)
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.handle('terminal:createWithCommand', (_event, { id, cwd, command }: { id: string; cwd: string; command: string }) => {
  try {
    const ptyProcess = pty.spawn(getDefaultShell(), [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 10,
      cwd: cwd || app.getPath('home'),
      env: { ...process.env } as Record<string, string>
    })

    ptyProcesses.set(id, ptyProcess)

    ptyProcess.onData((data) => {
      sendToRenderer('terminal:data', { id, data })
    })

    // Write command to the interactive shell so it stays open after execution
    ptyProcess.write(command + '\n')

    ptyProcess.onExit(({ exitCode }) => {
      sendToRenderer('terminal:exit', { id, exitCode })
      ptyProcesses.delete(id)
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: String((err as Error).message || err) }
  }
})

ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) => {
  const ptyProcess = ptyProcesses.get(id)
  if (ptyProcess) ptyProcess.write(data)
})

ipcMain.handle('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  const ptyProcess = ptyProcesses.get(id)
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows)
    } catch {
      // ignore resize errors (e.g. process already exited)
    }
  }
  return { success: true }
})

ipcMain.handle('terminal:close', (_event, { id }: { id: string }) => {
  const ptyProcess = ptyProcesses.get(id)
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcesses.delete(id)
  }
  return { success: true }
})

// --- App lifecycle ---

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.td-ide')
  initDatabase()

  // Initialize ACP client manager
  acpManager = new AcpClientManager(sendToRenderer)
  try {
    await acpManager.initialize()
    console.log('[td-ide] ACP client initialized')
  } catch (err) {
    console.error('[td-ide] ACP init failed, will retry on first message:', (err as Error).message)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)

    // Intercept Cmd+W to close tab instead of window
    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'w' && input.meta && !input.shift && !input.alt && !input.control) {
        event.preventDefault()
        window.webContents.send('close-tab')
      }
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Shutdown ACP agent
  acpManager?.shutdown()
  // Kill all terminal PTY processes
  ptyProcesses.forEach((proc) => proc.kill())
  ptyProcesses.clear()
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
