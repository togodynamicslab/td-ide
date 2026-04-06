import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { Readable, Writable } from 'stream'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import type {
  Client,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  SessionUpdate,
  PromptResponse
} from '@agentclientprotocol/sdk'

type SendToRenderer = (channel: string, ...args: unknown[]) => void

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000

interface PendingPermission {
  resolve: (response: RequestPermissionResponse) => void
  conversationId: string
  timeoutId: ReturnType<typeof setTimeout>
}

export class AcpClientManager {
  private connection: ClientSideConnection | null = null
  private agentProcess: ChildProcess | null = null
  private sendToRenderer: SendToRenderer

  private pendingPermissions = new Map<string, PendingPermission>()
  private sessionToConversation = new Map<string, string>()
  private conversationToSession = new Map<string, string>()

  // Track active prompt promises so we know when a turn completes
  private activePrompts = new Map<string, {
    resolve: (resp: PromptResponse) => void
    reject: (err: Error) => void
  }>()

  constructor(sendToRenderer: SendToRenderer) {
    this.sendToRenderer = sendToRenderer
  }

  getConversationForSession(sessionId: string): string | undefined {
    return this.sessionToConversation.get(sessionId)
  }

  async initialize(): Promise<void> {
    if (this.connection && !this.connection.signal.aborted) {
      return // Already initialized
    }

    const agentBin = join(
      app.getAppPath(),
      'node_modules',
      '.bin',
      'claude-agent-acp'
    )

    console.log('[td-ide:acp] Spawning agent:', agentBin)

    this.agentProcess = spawn(agentBin, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32'
    })

    this.agentProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (text) console.error('[td-ide:acp:stderr]', text.slice(0, 500))
    })

    this.agentProcess.on('error', (err) => {
      console.error('[td-ide:acp] Agent process error:', err.message)
    })

    this.agentProcess.on('close', (code) => {
      console.log('[td-ide:acp] Agent process closed with code:', code)
      this.connection = null
      this.agentProcess = null
      // Reject all pending permissions and clear timers
      this.pendingPermissions.forEach((pending, id) => {
        clearTimeout(pending.timeoutId)
        pending.resolve({ outcome: { outcome: 'cancelled' } })
        this.pendingPermissions.delete(id)
      })
      // Notify renderer for all active conversations
      this.conversationToSession.forEach((_sessionId, convId) => {
        this.sendToRenderer('claude:done', { conversationId: convId, cancelled: true })
      })
    })

    // Convert Node.js streams to Web Streams for ACP
    const stdout = this.agentProcess.stdout!
    const stdin = this.agentProcess.stdin!

    const webReadable = Readable.toWeb(stdout) as ReadableStream<Uint8Array>
    const webWritable = Writable.toWeb(stdin) as WritableStream<Uint8Array>

    const stream = ndJsonStream(webWritable, webReadable)

    const client = this.createClient()
    this.connection = new ClientSideConnection(() => client, stream)

    // Initialize the protocol
    await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: {
        name: 'td-ide',
        version: app.getVersion()
      },
      clientCapabilities: {
        auth: { terminal: true },
        terminal: true
      }
    })

    console.log('[td-ide:acp] Protocol initialized')
  }

  private createClient(): Client {
    return {
      requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
        const conversationId = this.sessionToConversation.get(params.sessionId)
        console.log('[td-ide:acp] requestPermission called | session:', params.sessionId, '| conv:', conversationId, '| tool:', JSON.stringify(params.toolCall).slice(0, 200))
        if (!conversationId) {
          console.warn('[td-ide:acp] No conversation for session, cancelling permission request')
          return { outcome: { outcome: 'cancelled' } }
        }

        const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2)}`

        console.log('[td-ide:acp] Sending permission-request to renderer | requestId:', requestId)
        this.sendToRenderer('claude:permission-request', {
          conversationId,
          requestId,
          toolCall: params.toolCall,
          options: params.options
        })

        return new Promise<RequestPermissionResponse>((resolve) => {
          const timeoutId = setTimeout(() => {
            if (this.pendingPermissions.has(requestId)) {
              this.pendingPermissions.delete(requestId)
              resolve({ outcome: { outcome: 'cancelled' } })
            }
          }, PERMISSION_TIMEOUT_MS)
          this.pendingPermissions.set(requestId, { resolve, conversationId, timeoutId })
        })
      },

      sessionUpdate: async (params: SessionNotification): Promise<void> => {
        const conversationId = this.sessionToConversation.get(params.sessionId)
        if (!conversationId) return

        this.sendToRenderer('claude:stream', {
          conversationId,
          data: params.update
        })
      },

      readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
        try {
          const content = readFileSync(params.path, 'utf-8')
          return { content }
        } catch {
          throw new Error(`File not found: ${params.path}`)
        }
      },

      writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
        try {
          const { writeFileSync, mkdirSync } = await import('fs')
          const dir = join(params.path, '..')
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(params.path, params.content, 'utf-8')
          return {}
        } catch (err) {
          throw new Error(`Failed to write: ${(err as Error).message}`)
        }
      },

      createTerminal: async (_params: CreateTerminalRequest): Promise<CreateTerminalResponse> => {
        // Terminal creation is handled by the agent internally for Bash tool calls
        // For now return a simple response - the agent manages its own terminals
        return { terminalId: `term-${Date.now()}` }
      },

      terminalOutput: async (_params: TerminalOutputRequest): Promise<TerminalOutputResponse> => {
        return { output: '', truncated: false }
      },

      releaseTerminal: async (_params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> => {
        return {}
      },

      waitForTerminalExit: async (_params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> => {
        return {}
      },

      killTerminal: async (_params: KillTerminalRequest): Promise<KillTerminalResponse> => {
        return {}
      }
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.connection || this.connection.signal.aborted) {
      await this.initialize()
    }
  }

  async newSession(conversationId: string, cwd: string, permissionMode?: string, additionalDirectories?: string[]): Promise<string> {
    await this.ensureInitialized()

    const response = await this.connection!.newSession({
      cwd,
      mcpServers: [],
      ...(additionalDirectories?.length ? { additionalDirectories } : {}),
      ...(permissionMode ? {
        _meta: {
          claudeCode: {
            options: {
              permissionMode
            }
          }
        }
      } : {})
    })

    const sessionId = response.sessionId
    this.sessionToConversation.set(sessionId, conversationId)
    this.conversationToSession.set(conversationId, sessionId)

    console.log('[td-ide:acp] New session:', sessionId, '| conv:', conversationId)
    return sessionId
  }

  async resumeSession(conversationId: string, sessionId: string, cwd: string, additionalDirectories?: string[]): Promise<void> {
    await this.ensureInitialized()

    // Map the session before loading so sessionUpdate callbacks can resolve
    this.sessionToConversation.set(sessionId, conversationId)
    this.conversationToSession.set(conversationId, sessionId)

    try {
      await this.connection!.unstable_resumeSession({ sessionId, cwd, ...(additionalDirectories?.length ? { additionalDirectories } : {}) })
      console.log('[td-ide:acp] Resumed session:', sessionId, '| conv:', conversationId)
    } catch (err) {
      console.warn('[td-ide:acp] Resume failed, will create new session:', (err as Error).message)
      // Clean up mapping
      this.sessionToConversation.delete(sessionId)
      this.conversationToSession.delete(conversationId)
      throw err // Caller should fall back to newSession
    }
  }

  async prompt(conversationId: string, text: string): Promise<PromptResponse> {
    await this.ensureInitialized()

    const sessionId = this.conversationToSession.get(conversationId)
    if (!sessionId) {
      throw new Error(`No session for conversation: ${conversationId}`)
    }

    console.log('[td-ide:acp] Prompt | conv:', conversationId, '| session:', sessionId, '| text:', text.slice(0, 80))

    const response = await this.connection!.prompt({
      sessionId,
      prompt: [{ type: 'text', text }]
    })

    console.log('[td-ide:acp] Prompt complete | conv:', conversationId, '| stop:', response.stopReason)

    return response
  }

  async cancel(conversationId: string): Promise<void> {
    const sessionId = this.conversationToSession.get(conversationId)
    if (!sessionId || !this.connection) return

    console.log('[td-ide:acp] Cancel | conv:', conversationId)
    await this.connection.cancel({ sessionId })
  }

  resolvePermission(requestId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) {
      console.warn('[td-ide:acp] No pending permission for:', requestId)
      return
    }

    clearTimeout(pending.timeoutId)
    this.pendingPermissions.delete(requestId)
    pending.resolve({
      outcome: {
        outcome: 'selected',
        optionId
      }
    })
  }

  async setMode(conversationId: string, modeId: string): Promise<void> {
    const sessionId = this.conversationToSession.get(conversationId)
    if (!sessionId || !this.connection) return

    console.log('[td-ide:acp] setMode | conv:', conversationId, '| session:', sessionId, '| mode:', modeId)
    await this.connection.setSessionMode({ sessionId, modeId })
    console.log('[td-ide:acp] setMode succeeded | mode:', modeId)
  }

  async setModel(conversationId: string, modelId: string): Promise<void> {
    const sessionId = this.conversationToSession.get(conversationId)
    if (!sessionId || !this.connection) return

    await this.connection.unstable_setSessionModel({ sessionId, modelId })
  }

  removeConversation(conversationId: string): void {
    const sessionId = this.conversationToSession.get(conversationId)
    if (sessionId) {
      this.sessionToConversation.delete(sessionId)
      this.conversationToSession.delete(conversationId)
    }
  }

  getProcessInfo(): { pid: number | null; sessions: number } {
    return {
      pid: this.agentProcess?.pid ?? null,
      sessions: this.conversationToSession.size
    }
  }

  getActiveSessions(): { conversationId: string; sessionId: string }[] {
    return Array.from(this.conversationToSession.entries()).map(([conversationId, sessionId]) => ({
      conversationId,
      sessionId
    }))
  }

  async shutdown(): Promise<void> {
    // Clear all pending permission timers
    this.pendingPermissions.forEach((pending) => clearTimeout(pending.timeoutId))
    this.pendingPermissions.clear()
    if (this.agentProcess) {
      this.agentProcess.kill()
      this.agentProcess = null
    }
    this.connection = null
    this.sessionToConversation.clear()
    this.conversationToSession.clear()
  }
}
