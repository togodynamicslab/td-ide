import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { formatShortcut, getDefault, modifiersEqual, type ShortcutBinding, type ShortcutModifiers } from '../../hooks/useKeyboardShortcuts'

interface KeyboardSettingsProps {
  shortcuts: ShortcutBinding[]
  onUpdateShortcut: (id: string, key: string, modifiers: ShortcutModifiers) => void
  onResetAll: () => void
}

function isCustomized(binding: ShortcutBinding): boolean {
  const def = getDefault(binding.id)
  if (!def) return false
  return def.key !== binding.key || !modifiersEqual(def.modifiers, binding.modifiers)
}

function findConflict(shortcuts: ShortcutBinding[], id: string, key: string, modifiers: ShortcutModifiers): ShortcutBinding | null {
  return shortcuts.find((s) =>
    s.id !== id && s.key === key && modifiersEqual(s.modifiers, modifiers)
  ) || null
}

export default function KeyboardSettings({ shortcuts, onUpdateShortcut, onResetAll }: KeyboardSettingsProps): JSX.Element {
  const [capturingId, setCapturingId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ id: string; conflictWith: string } | null>(null)
  const conflictTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCapture = useCallback((e: KeyboardEvent) => {
    if (!capturingId) return
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return

    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      setCapturingId(null)
      return
    }

    const modifiers: ShortcutModifiers = {
      meta: e.metaKey,
      shift: e.shiftKey,
      ctrl: e.ctrlKey && !e.metaKey,
      alt: e.altKey,
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

    const existing = findConflict(shortcuts, capturingId, key, modifiers)
    if (existing) {
      setConflict({ id: capturingId, conflictWith: existing.label })
      if (conflictTimer.current) clearTimeout(conflictTimer.current)
      conflictTimer.current = setTimeout(() => setConflict(null), 2000)
      setCapturingId(null)
      return
    }

    onUpdateShortcut(capturingId, key, modifiers)
    setCapturingId(null)
  }, [capturingId, shortcuts, onUpdateShortcut])

  useEffect(() => {
    if (!capturingId) return
    window.addEventListener('keydown', handleCapture, true)
    return () => window.removeEventListener('keydown', handleCapture, true)
  }, [capturingId, handleCapture])

  useEffect(() => {
    return () => { if (conflictTimer.current) clearTimeout(conflictTimer.current) }
  }, [])

  const hasAnyCustom = shortcuts.some(isCustomized)

  const categories = [
    { key: 'general', label: 'General' },
    { key: 'navigation', label: 'Navigation' },
  ] as const

  return (
    <div className="space-y-6">
      {categories.map(({ key: cat, label }) => {
        const items = shortcuts.filter((s) => s.category === cat)
        if (items.length === 0) return null
        return (
          <div key={cat}>
            <h3 className="text-xs font-medium text-td-muted uppercase tracking-wider mb-2">{label}</h3>
            <div className="border border-td-border rounded-lg divide-y divide-td-border">
              {items.map((binding) => {
                const isCapturing = capturingId === binding.id
                const isModified = isCustomized(binding)
                const hasConflict = conflict?.id === binding.id

                return (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-td-text-secondary">{binding.label}</span>
                    <div className="flex items-center gap-2">
                      {hasConflict && (
                        <span className="text-[11px] text-amber-400">
                          Conflicts with {conflict.conflictWith}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCapturingId(isCapturing ? null : binding.id)}
                        className={cn(
                          'font-mono text-xs px-2 py-1 rounded border min-w-[80px] text-center transition-colors',
                          isCapturing
                            ? 'border-td-accent bg-td-accent/10 text-td-accent animate-pulse'
                            : isModified
                              ? 'border-td-accent/40 bg-td-surface text-td-text'
                              : 'border-td-border bg-td-surface text-td-text-secondary hover:border-td-muted'
                        )}
                      >
                        {isCapturing ? 'Press keys...' : formatShortcut(binding)}
                      </button>
                      {isModified && (
                        <button
                          type="button"
                          onClick={() => {
                            const def = getDefault(binding.id)
                            if (def) onUpdateShortcut(binding.id, def.key, def.modifiers)
                          }}
                          className="text-td-muted hover:text-td-text transition-colors"
                          title="Reset to default"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {hasAnyCustom && (
        <div className="pt-2">
          <Button variant="outline" size="sm" onClick={onResetAll} className="text-xs">
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Reset all to defaults
          </Button>
        </div>
      )}
    </div>
  )
}
