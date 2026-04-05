import { useState, useEffect, useCallback } from 'react'
import { Webhook, Plus, Trash2, Loader2, Save, Check, ChevronDown, Play, GripVertical } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'

interface HooksSettingsProps {
  homedir: string
}

const EVENT_TYPES = [
  { id: 'PreToolUse', label: 'Pre Tool Use', description: 'Before a tool executes' },
  { id: 'PostToolUse', label: 'Post Tool Use', description: 'After a tool executes' },
  { id: 'Notification', label: 'Notification', description: 'When a notification fires' },
  { id: 'Stop', label: 'Stop', description: 'When Claude stops responding' },
  { id: 'SubagentStop', label: 'Subagent Stop', description: 'When a subagent finishes' },
  { id: 'UserPromptSubmit', label: 'User Prompt Submit', description: 'Before a user prompt is sent' },
] as const

type EventType = (typeof EVENT_TYPES)[number]['id']

interface HookCommand {
  type: 'command'
  command: string
}

interface HookGroup {
  matcher?: string
  hooks: HookCommand[]
}

type HooksConfig = Partial<Record<EventType, HookGroup[]>>

export default function HooksSettings({ homedir }: HooksSettingsProps) {
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dirty, setDirty] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState<EventType | null>(null)
  const [addingTo, setAddingTo] = useState<EventType | null>(null)
  const [newCommand, setNewCommand] = useState('')
  const [newMatcher, setNewMatcher] = useState('')
  const [testingHook, setTestingHook] = useState<string | null>(null)

  const settingsPath = `${homedir}/.claude/settings.json`

  const loadHooks = useCallback(async () => {
    setLoading(true)
    const result = await window.api.readFileContent(settingsPath)
    if (result.exists) {
      try {
        const json = JSON.parse(result.content)
        setHooks(json.hooks || {})
      } catch {
        setHooks({})
      }
    }
    setLoading(false)
  }, [settingsPath])

  useEffect(() => {
    loadHooks()
  }, [loadHooks])

  const saveHooks = async (updated: HooksConfig) => {
    setSaving('saving')
    const result = await window.api.readFileContent(settingsPath)
    let settings: Record<string, unknown> = {}
    if (result.exists) {
      try {
        settings = JSON.parse(result.content)
      } catch { /* start fresh */ }
    }

    // Clean out empty event arrays
    const cleaned: HooksConfig = {}
    for (const [event, groups] of Object.entries(updated)) {
      const filtered = (groups as HookGroup[]).filter((g) => g.hooks.length > 0)
      if (filtered.length > 0) {
        cleaned[event as EventType] = filtered
      }
    }

    settings.hooks = cleaned
    const writeResult = await window.api.writeFileContent(settingsPath, JSON.stringify(settings, null, 4))
    if (writeResult.success) {
      setHooks(cleaned)
      setDirty(false)
      setSaving('saved')
      setTimeout(() => setSaving('idle'), 2000)
    } else {
      setSaving('idle')
    }
  }

  const addHook = (event: EventType) => {
    const cmd = newCommand.trim()
    if (!cmd) return

    const updated = { ...hooks }
    const groups = [...(updated[event] || [])]
    const matcher = newMatcher.trim()

    // Find existing group with same matcher or create new one
    const existingIdx = groups.findIndex((g) =>
      matcher ? g.matcher === matcher : !g.matcher
    )

    if (existingIdx >= 0) {
      groups[existingIdx] = {
        ...groups[existingIdx],
        hooks: [...groups[existingIdx].hooks, { type: 'command', command: cmd }],
      }
    } else {
      const newGroup: HookGroup = {
        hooks: [{ type: 'command', command: cmd }],
      }
      if (matcher) newGroup.matcher = matcher
      groups.push(newGroup)
    }

    updated[event] = groups
    setHooks(updated)
    setDirty(true)
    setNewCommand('')
    setNewMatcher('')
    setAddingTo(null)
  }

  const removeHook = (event: EventType, groupIdx: number, hookIdx: number) => {
    const updated = { ...hooks }
    const groups = [...(updated[event] || [])]
    const group = { ...groups[groupIdx] }
    group.hooks = group.hooks.filter((_, i) => i !== hookIdx)

    if (group.hooks.length === 0) {
      groups.splice(groupIdx, 1)
    } else {
      groups[groupIdx] = group
    }

    updated[event] = groups
    setHooks(updated)
    setDirty(true)
  }

  const removeGroup = (event: EventType, groupIdx: number) => {
    const updated = { ...hooks }
    const groups = [...(updated[event] || [])]
    groups.splice(groupIdx, 1)
    updated[event] = groups
    setHooks(updated)
    setDirty(true)
  }

  const testHook = async (command: string) => {
    const key = command
    setTestingHook(key)
    try {
      await window.api.executeCommand(command, homedir)
    } catch { /* ignore test errors */ }
    setTimeout(() => setTestingHook(null), 1500)
  }

  const eventHasHooks = (event: EventType) => {
    const groups = hooks[event]
    return groups && groups.length > 0 && groups.some((g) => g.hooks.length > 0)
  }

  const totalHookCount = Object.values(hooks).reduce(
    (sum, groups) => sum + (groups?.reduce((gs, g) => gs + g.hooks.length, 0) || 0),
    0
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Webhook className="h-4 w-4 text-td-muted" />
        <h2 className="text-lg font-semibold text-td-text tracking-tight">Hooks</h2>
      </div>
      <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
        Shell commands that run automatically in response to Claude Code events.
        Hooks execute locally and can automate notifications, linting, logging, and more.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-4 w-4 animate-spin text-td-muted" />
        </div>
      ) : (
        <div className="space-y-2">
          {EVENT_TYPES.map((evt) => {
            const groups = hooks[evt.id] || []
            const isExpanded = expandedEvent === evt.id
            const hasHooks = eventHasHooks(evt.id)
            const hookCount = groups.reduce((s, g) => s + g.hooks.length, 0)

            return (
              <div
                key={evt.id}
                className="rounded-lg border border-td-border bg-td-surface/50 overflow-hidden"
              >
                {/* Event header */}
                <button
                  onClick={() => setExpandedEvent(isExpanded ? null : evt.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-td-hover/30 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-td-muted transition-transform shrink-0',
                      isExpanded && 'rotate-0',
                      !isExpanded && '-rotate-90'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-td-text">{evt.label}</span>
                      {hasHooks && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-td-accent/10 text-td-accent border border-td-accent/20">
                          {hookCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-td-muted mt-0.5">{evt.description}</p>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-td-border">
                    {/* Existing hook groups */}
                    {groups.map((group, gi) => (
                      <div key={gi} className="border-b border-td-border/50 last:border-b-0">
                        {/* Group header with matcher */}
                        {group.matcher && (
                          <div className="px-4 py-2 bg-td-bg/30 flex items-center gap-2">
                            <GripVertical className="h-3 w-3 text-td-muted/40" />
                            <span className="text-[10px] text-td-muted uppercase tracking-wider">Matcher</span>
                            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {group.matcher}
                            </span>
                            <button
                              onClick={() => removeGroup(evt.id, gi)}
                              className="ml-auto p-1 rounded text-td-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Remove entire group"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Hook commands */}
                        {group.hooks.map((hook, hi) => (
                          <div
                            key={hi}
                            className="flex items-center gap-2 px-4 py-2.5 hover:bg-td-hover/20 group/hook"
                          >
                            <code className="flex-1 text-xs font-mono text-td-text truncate">
                              {hook.command}
                            </code>
                            <div className="flex items-center gap-1 opacity-0 group-hover/hook:opacity-100 transition-opacity">
                              <button
                                onClick={() => testHook(hook.command)}
                                className={cn(
                                  'p-1 rounded transition-colors',
                                  testingHook === hook.command
                                    ? 'text-emerald-400 bg-emerald-500/10'
                                    : 'text-td-muted hover:text-emerald-400 hover:bg-emerald-500/10'
                                )}
                                title="Test run this hook"
                              >
                                {testingHook === hook.command ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                              </button>
                              <button
                                onClick={() => removeHook(evt.id, gi, hi)}
                                className="p-1 rounded text-td-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Remove hook"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* Empty state */}
                    {groups.length === 0 && addingTo !== evt.id && (
                      <div className="px-4 py-6 text-center text-[11px] text-td-muted">
                        No hooks configured for this event
                      </div>
                    )}

                    {/* Add hook form */}
                    {addingTo === evt.id ? (
                      <div className="px-4 py-3 bg-td-bg/30 space-y-2">
                        {(evt.id === 'PreToolUse' || evt.id === 'PostToolUse') && (
                          <div>
                            <label className="text-[10px] text-td-muted uppercase tracking-wider mb-1 block">
                              Tool matcher <span className="normal-case text-td-muted/60">(optional)</span>
                            </label>
                            <input
                              value={newMatcher}
                              onChange={(e) => setNewMatcher(e.target.value)}
                              placeholder="e.g. Bash, Edit, Write..."
                              className="w-full bg-td-bg border border-td-border rounded px-2.5 py-1.5 text-xs text-td-text placeholder-td-muted/50 outline-none focus:border-td-accent font-mono"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] text-td-muted uppercase tracking-wider mb-1 block">
                            Command
                          </label>
                          <input
                            autoFocus
                            value={newCommand}
                            onChange={(e) => setNewCommand(e.target.value)}
                            placeholder="e.g. afplay /System/Library/Sounds/Funk.aiff"
                            className="w-full bg-td-bg border border-td-border rounded px-2.5 py-1.5 text-xs text-td-text placeholder-td-muted/50 outline-none focus:border-td-accent font-mono"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addHook(evt.id)
                              if (e.key === 'Escape') {
                                setAddingTo(null)
                                setNewCommand('')
                                setNewMatcher('')
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={() => addHook(evt.id)}
                            disabled={!newCommand.trim()}
                            className="h-7 text-xs"
                          >
                            <Plus className="h-3 w-3 mr-1.5" />
                            Add Hook
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAddingTo(null)
                              setNewCommand('')
                              setNewMatcher('')
                            }}
                            className="h-7 text-xs text-td-muted"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingTo(evt.id)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-td-muted hover:text-td-text hover:bg-td-hover/30 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Add hook
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Save bar */}
          <div className="flex items-center justify-between pt-4">
            <span className="text-[11px] text-td-muted font-mono">{settingsPath}</span>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-[11px] text-orange-400">Unsaved changes</span>}
              <span className="text-[11px] text-td-muted">
                {totalHookCount} hook{totalHookCount !== 1 ? 's' : ''} configured
              </span>
              <Button
                size="sm"
                onClick={() => saveHooks(hooks)}
                disabled={!dirty || saving === 'saving'}
                className="h-7 text-xs"
              >
                {saving === 'saving' ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : saving === 'saved' ? (
                  <Check className="h-3 w-3 mr-1.5 text-emerald-400" />
                ) : (
                  <Save className="h-3 w-3 mr-1.5" />
                )}
                {saving === 'saved' ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
