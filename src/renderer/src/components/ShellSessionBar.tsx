import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, ChevronDown, ChevronUp, Square, X, Circle, Globe, MessageSquare } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

function getThemeColors(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const toHex = (name: string): string => {
    const val = style.getPropertyValue(name).trim()
    if (!val) return '#0f0f17'
    const [r, g, b] = val.split(' ').map(Number)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  return {
    background: toHex('--td-bg'),
    foreground: toHex('--td-text'),
    cursor: toHex('--td-accent'),
    cursorAccent: toHex('--td-bg'),
    selectionBackground: toHex('--td-hover'),
    selectionForeground: toHex('--td-text')
  }
}

interface ShellSessionBarProps {
  sessionId: string
  command: string
  cwd: string
  scope: 'conversation' | 'global'
  onScopeToggle: () => void
  onClose: () => void
  onExit: (exitCode: number) => void
}

export default function ShellSessionBar({ sessionId, command, cwd, scope, onScopeToggle, onClose, onExit }: ShellSessionBarProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [status, setStatus] = useState<'running' | 'exited'>('running')
  const [exitCode, setExitCode] = useState<number | null>(null)

  // Use refs for cwd/command so the effect only depends on sessionId
  // This prevents PTY re-creation when projectPath changes during conversation switches
  const cwdRef = useRef(cwd)
  const commandRef = useRef(command)
  cwdRef.current = cwd
  commandRef.current = command

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: getThemeColors(),
      allowProposedApi: true,
      scrollback: 5000,
      disableStdin: false
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminal.open(containerRef.current)
    fitAddon.fit()
    terminal.focus()

    termRef.current = terminal
    fitRef.current = fitAddon

    // Spawn PTY with command (use refs to avoid re-creation on prop changes)
    window.api.terminalCreateWithCommand(sessionId, cwdRef.current, commandRef.current).then((result) => {
      if (disposed) return
      if (!result.success) {
        terminal.write(`\r\n\x1b[31mFailed to run command: ${result.error}\x1b[0m\r\n`)
        setStatus('exited')
        setExitCode(-1)
        onExit(-1)
      }
    })

    // Allow keyboard input when terminal is focused (interactive)
    const inputDisposable = terminal.onData((data) => {
      if (!disposed) window.api.terminalInput(sessionId, data)
    })

    // PTY output -> terminal
    const unsubData = window.api.onTerminalData((termId, data) => {
      if (termId === sessionId && !disposed) terminal.write(data)
    })

    const unsubExit = window.api.onTerminalExit((termId, code) => {
      if (termId === sessionId && !disposed) {
        const label = code === 0 ? '\x1b[32mdone\x1b[0m' : `\x1b[31mexit ${code}\x1b[0m`
        terminal.write(`\r\n\x1b[90m[${label}\x1b[90m]\x1b[0m\r\n`)
        setStatus('exited')
        setExitCode(code)
        onExit(code)
      }
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitRef.current && !disposed) {
        try {
          fitRef.current.fit()
          if (termRef.current) {
            const { cols, rows } = termRef.current
            window.api.terminalResize(sessionId, cols, rows)
          }
        } catch {
          // ignore fit errors during teardown
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    // Theme observer
    const themeObserver = new MutationObserver(() => {
      if (termRef.current) {
        termRef.current.options.theme = getThemeColors()
      }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      disposed = true
      inputDisposable.dispose()
      unsubData()
      unsubExit()
      resizeObserver.disconnect()
      themeObserver.disconnect()
      terminal.dispose()
      window.api.terminalClose(sessionId)
      termRef.current = null
      fitRef.current = null
    }
  }, [sessionId])

  // Re-fit when expanded changes
  useEffect(() => {
    if (expanded && fitRef.current) {
      const timer = setTimeout(() => {
        try {
          fitRef.current?.fit()
          if (termRef.current) {
            const { cols, rows } = termRef.current
            window.api.terminalResize(sessionId, cols, rows)
          }
        } catch {
          // ignore
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [expanded, sessionId])

  // Re-focus terminal after expand or status change
  useEffect(() => {
    if (expanded && termRef.current) {
      setTimeout(() => termRef.current?.focus(), 100)
    }
  }, [expanded, status])

  const handleStop = () => {
    window.api.terminalInput(sessionId, '\x03')
  }

  const handleClose = () => {
    if (status === 'running') {
      window.api.terminalClose(sessionId)
    }
    onClose()
  }

  const statusColor = status === 'running'
    ? 'text-yellow-400'
    : exitCode === 0
      ? 'text-emerald-400'
      : 'text-red-400'

  const statusLabel = status === 'running'
    ? 'running'
    : exitCode === 0
      ? 'done'
      : `exit ${exitCode}`

  return (
    <div
      className="border-b border-td-border/30 bg-td-bg"
      data-terminal="shell-session"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
          <span className="text-xs font-mono text-td-text truncate">{command}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
            status === 'running'
              ? 'bg-yellow-500/15 text-yellow-400'
              : exitCode === 0
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
          }`}>
            {status === 'running' && <Circle className="h-2 w-2 fill-current animate-pulse" />}
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onScopeToggle}
            className={`h-5 w-5 flex items-center justify-center rounded transition-colors ${
              scope === 'global'
                ? 'text-td-accent bg-td-accent/10'
                : 'text-td-muted hover:text-td-text hover:bg-td-hover'
            }`}
            title={scope === 'global' ? 'Visible in all tabs (click for this tab only)' : 'This tab only (click to show in all tabs)'}
          >
            <Globe className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-td-hover text-td-muted hover:text-td-text transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
          {status === 'running' && (
            <button
              type="button"
              onClick={handleStop}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-td-hover text-yellow-400 hover:text-yellow-300 transition-colors"
              title="Stop (Ctrl+C)"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-td-hover text-td-muted hover:text-td-text transition-colors"
            title="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Terminal body — wrapper isolates events, inner div is xterm mount point */}
      <div
        className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[200px]' : 'max-h-0'}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); termRef.current?.focus() }}
      >
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: '200px', padding: '2px 6px' }}
        />
      </div>
    </div>
  )
}
