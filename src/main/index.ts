import { app, shell, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess, execSync } from 'child_process'
import * as pty from 'node-pty'
import { getMcpServers, getGlobalMcpServers, getMarketplacePlugins, setMcpServer, removeMcpServer } from './mcp'
import {
  initDatabase,
  closeDatabase,
  getAllProjects,
  insertProject,
  updateProjectName,
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

let mainWindow: BrowserWindow | null = null

// Parallel claude processes — one per conversation
const claudeProcesses = new Map<string, ChildProcess>()

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
      sandbox: false
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

// --- DB IPC handlers ---

ipcMain.handle('db:get-projects', () => {
  return getAllProjects()
})

ipcMain.handle('db:add-project', (_event, { id, name, path }: { id: string; name: string; path: string }) => {
  insertProject(id, name, path)
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

ipcMain.handle('db:generate-title', async (_event, { conversationId, userMessage }: { conversationId: string; userMessage: string }) => {
  if (isConversationTitleEdited(conversationId)) return null

  try {
    const prompt = `Generate a very short title (max 6 words, no quotes) for a conversation that starts with this message:\n\n${userMessage.slice(0, 500)}`
    const raw = await new Promise<string>((resolve, reject) => {
      let output = ''
      const proc = spawn('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'text'], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      })
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
    if (title && title.length > 0 && title.length < 100) {
      updateConversationTitle(conversationId, title)
      return title
    }
  } catch {
    // Title generation failed — not critical
  }
  return null
})

// --- Notifications ---

ipcMain.handle('notify:show', (_event, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
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
      const proc = spawn('claude', ['-p', prompt, '--model', 'haiku'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
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

ipcMain.handle('process:get-memory-usage', () => {
  const mainMemory = process.memoryUsage()
  const claudeProcs: { conversationId: string; rss: number }[] = []
  for (const [convId, proc] of claudeProcesses) {
    if (proc.pid) {
      try {
        const rss = parseInt(
          require('child_process').execSync(`ps -o rss= -p ${proc.pid}`, { encoding: 'utf8' }).trim(),
          10
        ) * 1024 // ps reports in KB
        claudeProcs.push({ conversationId: convId, rss })
      } catch {
        // Process may have exited
      }
    }
  }
  return {
    main: { rss: mainMemory.rss, heapUsed: mainMemory.heapUsed, heapTotal: mainMemory.heapTotal },
    claude: claudeProcs
  }
})

// --- Claude process management (parallel) ---

const PERMISSION_MAP: Record<string, string> = {
  full: 'bypassPermissions',
  default: 'default',
  plan: 'plan',
  approve: 'default'
}

function launchClaude(message: string, conversationId: string, cwd: string, model: string, effort: string, permissionMode: string, disabledTools: string[] = [], apiKey = '', apiProvider = 'anthropic'): void {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']

  if (model && model !== 'opus') args.push('--model', model)
  if (effort && effort !== 'high') args.push('--effort', effort)

  const cliPermission = PERMISSION_MAP[permissionMode] || 'default'
  args.push('--permission-mode', cliPermission)

  if (disabledTools.length > 0) {
    args.push('--disallowedTools', ...disabledTools)
  }

  // Look up session ID from DB for conversation resumption
  const existingSessionId = conversationId ? getConversationSessionId(conversationId) : null
  if (existingSessionId) {
    args.push('--resume', existingSessionId)
  }

  console.log('[td-ide] conv:', conversationId, '| resume:', existingSessionId || 'new', '| provider:', apiProvider)

  // Build env with API key if using API key mode
  const env = { ...process.env }
  if (apiKey) {
    if (apiProvider === 'openrouter') {
      env.OPENROUTER_API_KEY = apiKey
    } else {
      env.ANTHROPIC_API_KEY = apiKey
    }
  }

  const proc = spawn('claude', args, {
    cwd: cwd || app.getPath('home'),
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  })

  claudeProcesses.set(conversationId, proc)

  // Track PID for session recovery
  if (proc.pid) {
    registerActiveProcess(conversationId, proc.pid)
  }

  proc.stdin?.write(message)
  proc.stdin?.end()

  let buffer = ''

  proc.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line)

          if (parsed.type === 'system' && parsed.subtype === 'init' && parsed.session_id) {
            if (conversationId) {
              updateConversationSessionId(conversationId, parsed.session_id)
              console.log('[td-ide] session stored:', parsed.session_id)
            }
          }

          if (parsed.type === 'result') {
            console.log('[td-ide] RESULT event | conv:', conversationId, '| is_error:', parsed.is_error, '| subtype:', parsed.subtype, '| num_turns:', parsed.num_turns)
          } else {
            console.log('[td-ide] stream |', parsed.type, parsed.subtype || '')
          }
          sendToRenderer('claude:stream', { conversationId, data: parsed })
        } catch {
          // non-JSON output, ignore
        }
      }
    }
  })

  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (!text) return
    // Filter out ANSI escape sequences and common non-error stderr output
    const cleaned = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (!cleaned) return
    // Only forward actual errors, not progress/status chatter
    const isNoise = /^(Compiling|Bundling|Building|Watching|Done in|✓|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|\s*$)/.test(cleaned)
    if (isNoise) return
    console.log('[td-ide] stderr:', cleaned.slice(0, 200))
    sendToRenderer('claude:error', { conversationId, error: cleaned })
  })

  proc.on('close', (code) => {
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer)
        sendToRenderer('claude:stream', { conversationId, data: parsed })
      } catch {
        // ignore
      }
    }
    console.log('[td-ide] closed | conv:', conversationId, '| code:', code)
    sendToRenderer('claude:done', { conversationId, code })
    claudeProcesses.delete(conversationId)
    removeActiveProcess(conversationId)
  })

  proc.on('error', (err) => {
    sendToRenderer('claude:error', { conversationId, error: `Failed to start claude: ${err.message}` })
    sendToRenderer('claude:done', { conversationId, code: 1 })
    claudeProcesses.delete(conversationId)
    removeActiveProcess(conversationId)
  })
}

ipcMain.on('claude:send-message', (_event, { message, conversationId, cwd, model, effort, permissionMode, disabledTools, apiKey, apiProvider }) => {
  const existing = claudeProcesses.get(conversationId)
  if (existing && !existing.killed) {
    existing.once('close', () => {
      launchClaude(message, conversationId, cwd, model, effort, permissionMode, disabledTools, apiKey, apiProvider)
    })
    existing.kill()
  } else {
    launchClaude(message, conversationId, cwd, model, effort, permissionMode, disabledTools, apiKey, apiProvider)
  }
})

ipcMain.on('claude:cancel', (_event, { conversationId }) => {
  const proc = claudeProcesses.get(conversationId)
  if (proc) {
    proc.kill()
    claudeProcesses.delete(conversationId)
    removeActiveProcess(conversationId)
    sendToRenderer('claude:done', { conversationId, code: -1, cancelled: true })
  }
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.td-ide')
  initDatabase()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Kill all running claude processes
  for (const [, proc] of claudeProcesses) {
    proc.kill()
  }
  claudeProcesses.clear()
  // Kill all terminal PTY processes
  for (const [, proc] of ptyProcesses) {
    proc.kill()
  }
  ptyProcesses.clear()
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
