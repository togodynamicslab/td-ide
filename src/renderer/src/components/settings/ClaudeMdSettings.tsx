import { useState, useEffect } from 'react'
import { FileText, Save, Loader2, Check, Plus, Pencil, Eye } from 'lucide-react'
import { Button } from '../ui/button'
import Markdown from '../ai-elements/Markdown'
import { cn } from '@/lib/utils'

interface ClaudeMdSettingsProps {
  homedir: string
  projectPath?: string
  fixedScope: 'global' | 'project'
}

export default function ClaudeMdSettings({ homedir, projectPath, fixedScope }: ClaudeMdSettingsProps) {
  const [content, setContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('preview')

  const filePath = fixedScope === 'global'
    ? `${homedir}/.claude/CLAUDE.md`
    : `${projectPath}/CLAUDE.md`

  useEffect(() => {
    if (!homedir) return
    if (fixedScope === 'project' && !projectPath) { setLoading(false); return }

    setLoading(true)
    window.api.readFileContent(filePath).then((r) => {
      setContent(r.content)
      setExists(r.exists)
      setLoading(false)
    }).catch(() => {
      setContent('')
      setExists(false)
      setLoading(false)
    })
  }, [homedir, projectPath, fixedScope, filePath])

  const handleSave = async () => {
    setSaving('saving')
    const result = await window.api.writeFileContent(filePath, content)
    if (result.success) {
      setExists(true)
      setDirty(false)
      setSaving('saved')
      setTimeout(() => setSaving('idle'), 2000)
    } else {
      setSaving('idle')
    }
  }

  const handleCreate = () => {
    setContent('# Project Instructions\n\n')
    setExists(true)
    setDirty(true)
    setMode('edit')
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-4 w-4 text-td-muted" />
          <h2 className="text-lg font-semibold text-td-text tracking-tight">CLAUDE.md</h2>
        </div>
        <div className="rounded-lg border border-td-border bg-td-surface/50 flex items-center justify-center py-12">
          <Loader2 className="h-4 w-4 animate-spin text-td-muted" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <FileText className="h-4 w-4 text-td-muted" />
        <h2 className="text-lg font-semibold text-td-text tracking-tight">CLAUDE.md</h2>
      </div>
      <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
        {fixedScope === 'global'
          ? 'Global instructions that Claude follows across all projects.'
          : 'Project-specific instructions that override global settings for this project.'}
      </p>

      <div className="rounded-lg border border-td-border bg-td-surface/50 overflow-hidden">
        {!exists && !dirty ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText className="h-8 w-8 text-td-muted/40" />
            <p className="text-xs text-td-muted">
              No {fixedScope === 'global' ? 'global' : 'project'} CLAUDE.md found
            </p>
            <Button variant="outline" size="sm" onClick={handleCreate}>
              <Plus className="h-3 w-3 mr-1.5" />
              Create CLAUDE.md
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-td-border bg-td-bg/30">
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
                className="w-full min-h-[400px] bg-transparent text-xs font-mono text-td-text p-4 outline-none resize-y placeholder-td-muted"
                placeholder="# Instructions for Claude..."
                spellCheck={false}
              />
            ) : (
              <div className="p-4 min-h-[400px] overflow-y-auto max-h-[600px]">
                {content.trim() ? (
                  <Markdown content={content} fontSize={13} />
                ) : (
                  <p className="text-xs text-td-muted italic">Empty file</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-td-border bg-td-bg/50">
              <span className="text-[10px] text-td-muted font-mono truncate">{filePath}</span>
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
          </>
        )}
      </div>
    </div>
  )
}
