import { useState, useCallback, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import TerminalInstance from './TerminalInstance'

interface TerminalTab {
  id: string
  title: string
}

interface TerminalPanelProps {
  cwd: string
  height: number
  onClose: () => void
}

export default function TerminalPanel({ cwd, height, onClose }: TerminalPanelProps): JSX.Element {
  const tabCounter = useRef(0)
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    tabCounter.current++
    return [{ id: `term-${Date.now()}`, title: `Terminal ${tabCounter.current}` }]
  })
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id)

  const addTab = useCallback(() => {
    tabCounter.current++
    const newTab: TerminalTab = {
      id: `term-${Date.now()}`,
      title: `Terminal ${tabCounter.current}`
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }, [])

  const closeTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId)
        if (next.length === 0) {
          onClose()
          return prev
        }
        if (activeTabId === tabId) {
          const idx = prev.findIndex((t) => t.id === tabId)
          const newActive = next[Math.min(idx, next.length - 1)]
          setActiveTabId(newActive.id)
        }
        return next
      })
    },
    [activeTabId, onClose]
  )

  return (
    <div className="flex flex-col bg-td-bg shrink-0" style={{ height }}>
      {/* Tab bar */}
      <div className="flex items-center h-8 bg-td-surface border-b border-td-border px-1 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-1 px-3 h-7 text-xs rounded-t transition-colors ${
              tab.id === activeTabId
                ? 'bg-td-bg text-td-text'
                : 'text-td-muted hover:text-td-text hover:bg-td-hover'
            }`}
          >
            <span>{tab.title}</span>
            <span
              onClick={(e) => closeTab(tab.id, e)}
              className="ml-1 p-0.5 rounded hover:bg-td-border opacity-50 hover:opacity-100"
            >
              <X size={10} />
            </span>
          </button>
        ))}
        <button
          onClick={addTab}
          className="p-1 ml-1 rounded text-td-muted hover:text-td-text hover:bg-td-hover transition-colors"
          title="New Terminal"
        >
          <Plus size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="p-1 rounded text-td-muted hover:text-td-text hover:bg-td-hover transition-colors"
          title="Hide Terminal"
        >
          <X size={14} />
        </button>
      </div>

      {/* Terminal instances */}
      <div className="flex-1 min-h-0">
        {tabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            id={tab.id}
            cwd={cwd}
            visible={tab.id === activeTabId}
          />
        ))}
      </div>
    </div>
  )
}
