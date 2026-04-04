import { useEffect, useRef, useMemo } from 'react'

export interface ShortcutModifiers {
  meta: boolean   // Cmd on Mac, Ctrl on Windows
  shift: boolean
  ctrl: boolean
  alt: boolean
}

export interface ShortcutBinding {
  id: string
  label: string
  category: 'navigation' | 'general'
  key: string
  modifiers: ShortcutModifiers
}

const META_ONLY: ShortcutModifiers = { meta: true, shift: false, ctrl: false, alt: false }
const META_SHIFT: ShortcutModifiers = { meta: true, shift: true, ctrl: false, alt: false }

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  ...Array.from({ length: 9 }, (_, i): ShortcutBinding => ({
    id: `switchTab${i + 1}`, label: `Switch to tab ${i + 1}`, category: 'navigation',
    key: `${i + 1}`, modifiers: META_ONLY,
  })),
  ...Array.from({ length: 9 }, (_, i): ShortcutBinding => ({
    id: `switchProject${i + 1}`, label: `Switch to project ${i + 1}`, category: 'navigation',
    key: `${i + 1}`, modifiers: META_SHIFT,
  })),
  { id: 'newChat', label: 'New chat', category: 'general', key: 'n', modifiers: META_ONLY },
  { id: 'toggleSidebar', label: 'Toggle sidebar', category: 'general', key: 'b', modifiers: META_ONLY },
  { id: 'toggleTerminal', label: 'Toggle terminal', category: 'general', key: '`', modifiers: { meta: false, shift: false, ctrl: true, alt: false } },
  { id: 'openSettings', label: 'Settings', category: 'general', key: ',', modifiers: META_ONLY },
  { id: 'openProjectSettings', label: 'Project settings', category: 'general', key: ',', modifiers: META_SHIFT },
]

const DEFAULT_MAP = new Map(DEFAULT_SHORTCUTS.map((s) => [s.id, s]))

function matchesShortcut(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (e.key !== binding.key) return false
  if (binding.modifiers.shift !== e.shiftKey) return false
  if (binding.modifiers.alt !== e.altKey) return false

  if (binding.modifiers.meta) {
    return e.metaKey || e.ctrlKey
  }
  if (binding.modifiers.ctrl) {
    return e.ctrlKey || e.metaKey
  }
  return !e.metaKey && !e.ctrlKey
}

export function mergeShortcuts(defaults: ShortcutBinding[], overrides: ShortcutBinding[] | null): ShortcutBinding[] {
  if (!overrides) return defaults
  const overrideMap = new Map(overrides.map((o) => [o.id, o]))
  return defaults.map((d) => overrideMap.get(d.id) ?? d)
}

export function modifiersEqual(a: ShortcutModifiers, b: ShortcutModifiers): boolean {
  return a.meta === b.meta && a.shift === b.shift && a.ctrl === b.ctrl && a.alt === b.alt
}

export function getDefault(id: string): ShortcutBinding | undefined {
  return DEFAULT_MAP.get(id)
}

export function useKeyboardShortcuts(
  actions: Record<string, () => void>,
  overrides: ShortcutBinding[] | null
): void {
  const shortcuts = useMemo(() => mergeShortcuts(DEFAULT_SHORTCUTS, overrides), [overrides])
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      const isEditable = tag === 'input' || tag === 'textarea' || document.activeElement?.getAttribute('contenteditable') === 'true'

      for (const binding of shortcuts) {
        if (!matchesShortcut(e, binding)) continue
        if (isEditable && !binding.modifiers.meta && !binding.modifiers.ctrl) continue

        const action = actionsRef.current[binding.id]
        if (action) {
          e.preventDefault()
          action()
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}

export function formatShortcut(binding: ShortcutBinding): string {
  const isMac = navigator.platform.includes('Mac')
  const parts: string[] = []
  if (binding.modifiers.ctrl) parts.push(isMac ? '⌃' : 'Ctrl')
  if (binding.modifiers.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (binding.modifiers.shift) parts.push(isMac ? '⇧' : 'Shift')
  if (binding.modifiers.meta) parts.push(isMac ? '⌘' : 'Ctrl')
  parts.push(binding.key === '`' ? '`' : binding.key.length === 1 ? binding.key.toUpperCase() : binding.key)
  return parts.join(isMac ? '' : '+')
}
