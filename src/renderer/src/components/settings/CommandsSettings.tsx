import { useState, useEffect, useCallback, useMemo } from 'react'
import { Terminal, Plus, Save, Loader2, Check, Trash2, FileText, ChevronRight, Pencil, Eye, Sparkles, Shield } from 'lucide-react'
import { Button } from '../ui/button'
import Markdown from '../ai-elements/Markdown'
import { cn } from '@/lib/utils'

interface CommandsSettingsProps {
  homedir: string
  projectPath?: string
  fixedScope: 'global' | 'project'
}

interface CommandFile {
  name: string
  filename: string
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return { meta, body: match[2] }
}

export default function CommandsSettings({ homedir, projectPath, fixedScope }: CommandsSettingsProps) {
  const [commands, setCommands] = useState<CommandFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('preview')

  const dir = fixedScope === 'global' ? `${homedir}/.claude/commands` : `${projectPath}/.claude/commands`

  const { meta, body } = useMemo(() => parseFrontmatter(content), [content])

  const loadCommands = useCallback(async () => {
    if (!homedir) return
    if (fixedScope === 'project' && !projectPath) return
    setLoading(true)
    const result = await window.api.listDirectory(dir)
    const cmds = result.files
      .filter((f) => !f.isDirectory && f.name.endsWith('.md'))
      .map((f) => ({ name: f.name.replace(/\.md$/, ''), filename: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    setCommands(cmds)
    setSelectedFile(null)
    setContent('')
    setDirty(false)
    setLoading(false)
  }, [homedir, projectPath, fixedScope, dir])

  useEffect(() => { loadCommands() }, [loadCommands])

  const handleSelect = async (cmd: CommandFile) => {
    const path = `${dir}/${cmd.filename}`
    const result = await window.api.readFileContent(path)
    setSelectedFile(cmd.filename)
    setContent(result.content)
    setDirty(false)
    setShowNew(false)
    setMode('preview')
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setSaving('saving')
    const path = `${dir}/${selectedFile}`
    const result = await window.api.writeFileContent(path, content)
    if (result.success) {
      setDirty(false)
      setSaving('saved')
      setTimeout(() => setSaving('idle'), 2000)
    } else {
      setSaving('idle')
    }
  }

  const handleCreate = async () => {
    const name = newName.trim().replace(/\.md$/, '')
    if (!name) return
    const filename = `${name}.md`
    const path = `${dir}/${filename}`
    const template = `---\ndescription: Describe what this command does\n---\n\n# /${name}\n\nCommand instructions here.\n`
    const result = await window.api.writeFileContent(path, template)
    if (result.success) {
      setNewName('')
      setShowNew(false)
      await loadCommands()
      setSelectedFile(filename)
      const read = await window.api.readFileContent(path)
      setContent(read.content)
      setDirty(false)
      setMode('edit')
    }
  }

  const handleDelete = async () => {
    if (!selectedFile) return
    const path = `${dir}/${selectedFile}`
    const result = await window.api.deleteFile(path)
    if (result.success) {
      setSelectedFile(null)
      setContent('')
      setDirty(false)
      loadCommands()
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Terminal className="h-4 w-4 text-td-muted" />
        <h2 className="text-lg font-semibold text-td-text tracking-tight">Commands &amp; Skills</h2>
      </div>
      <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
        {fixedScope === 'global'
          ? 'Custom slash commands available across all projects. Use /command-name in chat.'
          : 'Project-specific slash commands. Use /command-name in chat.'}
      </p>

      <div className="rounded-lg border border-td-border bg-td-surface/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-td-muted" />
          </div>
        ) : (
          <div className="flex min-h-[400px]">
            {/* Command list */}
            <div className="w-56 shrink-0 border-r border-td-border overflow-y-auto">
              {commands.map((cmd) => (
                <button
                  key={cmd.filename}
                  onClick={() => handleSelect(cmd)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors',
                    selectedFile === cmd.filename
                      ? 'bg-td-hover text-td-text'
                      : 'text-td-muted hover:bg-td-hover/50 hover:text-td-text'
                  )}
                >
                  <Sparkles className="h-3 w-3 shrink-0 text-purple-400" />
                  <span className="truncate font-mono">/{cmd.name}</span>
                  <ChevronRight className="h-2.5 w-2.5 ml-auto shrink-0 opacity-40" />
                </button>
              ))}

              {commands.length === 0 && !showNew && (
                <div className="px-3 py-6 text-center text-[11px] text-td-muted">No commands</div>
              )}

              {showNew ? (
                <div className="px-2 py-2 border-t border-td-border">
                  <form onSubmit={(e) => { e.preventDefault(); handleCreate() }} className="space-y-1.5">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="command-name"
                      className="w-full bg-td-bg border border-td-border rounded px-2 py-1 text-xs text-td-text placeholder-td-muted outline-none focus:border-td-accent font-mono"
                      onKeyDown={(e) => { if (e.key === 'Escape') { setShowNew(false); setNewName('') } }}
                    />
                    <Button type="submit" size="sm" className="h-6 text-xs w-full" disabled={!newName.trim()}>
                      Create
                    </Button>
                  </form>
                </div>
              ) : (
                <button
                  onClick={() => setShowNew(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-td-muted hover:text-td-text hover:bg-td-hover/50 transition-colors border-t border-td-border"
                >
                  <Plus className="h-3 w-3" />
                  New command
                </button>
              )}
            </div>

            {/* Editor / Preview */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedFile ? (
                <>
                  {/* Frontmatter metadata */}
                  {Object.keys(meta).length > 0 && (
                    <div className="px-4 py-2.5 border-b border-td-border bg-td-bg/30 space-y-1.5">
                      {meta.description && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-3 w-3 text-td-muted shrink-0 mt-0.5" />
                          <span className="text-[11px] text-td-text-secondary">{meta.description}</span>
                        </div>
                      )}
                      {meta['allowed-tools'] && (
                        <div className="flex items-start gap-2">
                          <Shield className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {meta['allowed-tools'].split(',').map((tool, i) => (
                              <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {tool.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode toggle */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-td-border">
                    <div className="flex items-center gap-1 bg-td-surface rounded-md p-0.5">
                      <button
                        onClick={() => setMode('preview')}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                          mode === 'preview' ? 'bg-td-bg text-td-text shadow-sm' : 'text-td-muted hover:text-td-text'
                        )}
                      >
                        <Eye className="h-3 w-3" />
                        Preview
                      </button>
                      <button
                        onClick={() => setMode('edit')}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                          mode === 'edit' ? 'bg-td-bg text-td-text shadow-sm' : 'text-td-muted hover:text-td-text'
                        )}
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                    </div>
                    {dirty && <span className="text-[10px] text-orange-400">Unsaved changes</span>}
                  </div>

                  {mode === 'edit' ? (
                    <textarea
                      value={content}
                      onChange={(e) => { setContent(e.target.value); setDirty(true) }}
                      className="flex-1 bg-transparent text-xs font-mono text-td-text p-4 outline-none resize-none placeholder-td-muted"
                      placeholder="# Command content..."
                      spellCheck={false}
                    />
                  ) : (
                    <div className="flex-1 p-4 overflow-y-auto">
                      {body.trim() ? (
                        <Markdown content={body} fontSize={13} />
                      ) : (
                        <p className="text-xs text-td-muted italic">No content</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-td-border bg-td-bg/50">
                    <span className="text-[10px] text-td-muted font-mono truncate">{dir}/{selectedFile}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3 mr-1.5" />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!dirty || saving === 'saving'}
                        className="h-7 text-xs"
                      >
                        {saving === 'saving' ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> :
                         saving === 'saved' ? <Check className="h-3 w-3 mr-1.5 text-emerald-400" /> :
                         <Save className="h-3 w-3 mr-1.5" />}
                        {saving === 'saved' ? 'Saved' : 'Save'}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-td-muted">
                  Select a command to view
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
