import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalInstanceProps {
  id: string
  cwd: string
  visible: boolean
}

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

export default function TerminalInstance({ id, cwd, visible }: TerminalInstanceProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const lastSize = useRef({ cols: 0, rows: 0 })

  // Only send resize IPC when dimensions actually change
  function syncSize(): void {
    if (!termRef.current) return
    const { cols, rows } = termRef.current
    if (cols !== lastSize.current.cols || rows !== lastSize.current.rows) {
      lastSize.current = { cols, rows }
      window.api.terminalResize(termRef.current === null ? '' : id, cols, rows)
    }
  }

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: getThemeColors(),
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminal.open(containerRef.current)
    fitAddon.fit()

    termRef.current = terminal
    fitRef.current = fitAddon

    // Create PTY in main process, then sync initial size
    window.api.terminalCreate(id, cwd).then((result) => {
      if (!result.success) {
        terminal.write(`\r\nFailed to create terminal: ${result.error}\r\n`)
      } else {
        syncSize()
      }
    })

    // User keystrokes → PTY
    const inputDisposable = terminal.onData((data) => {
      window.api.terminalInput(id, data)
    })

    // PTY output → terminal
    const unsubData = window.api.onTerminalData((termId, data) => {
      if (termId === id) terminal.write(data)
    })

    const unsubExit = window.api.onTerminalExit((termId, exitCode) => {
      if (termId === id) {
        terminal.write(`\r\n\x1b[90mProcess exited (code ${exitCode})\x1b[0m\r\n`)
      }
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitRef.current) {
        try {
          fitRef.current.fit()
          syncSize()
        } catch {
          // ignore fit errors during teardown
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    // Theme observer — update xterm colors when dark/light mode toggles
    const themeObserver = new MutationObserver(() => {
      if (termRef.current) {
        termRef.current.options.theme = getThemeColors()
      }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const cleanups = [
      () => inputDisposable.dispose(),
      unsubData,
      unsubExit,
      () => resizeObserver.disconnect(),
      () => themeObserver.disconnect(),
      () => terminal.dispose(),
      () => window.api.terminalClose(id)
    ]

    return () => {
      for (const cleanup of cleanups) cleanup()
      termRef.current = null
      fitRef.current = null
    }
  }, [id, cwd])

  // Re-fit and re-focus when visibility changes
  useEffect(() => {
    if (visible && fitRef.current) {
      const timer = setTimeout(() => {
        try {
          fitRef.current?.fit()
          syncSize()
          termRef.current?.focus()
        } catch {
          // ignore
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [visible, id])

  return (
    <div
      className="h-full w-full"
      data-terminal="panel"
      style={{ display: visible ? 'block' : 'none' }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); termRef.current?.focus() }}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ padding: '4px 8px' }}
      />
    </div>
  )
}
