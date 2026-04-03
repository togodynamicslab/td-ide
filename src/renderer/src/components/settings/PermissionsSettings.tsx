import { useState, useEffect, useCallback } from 'react'
import { Shield, Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface PermissionsSettingsProps {
  homedir: string
  projectPath?: string
  fixedScope: 'global' | 'project'
}

interface PermissionData {
  allow?: string[]
  deny?: string[]
  defaultMode?: string
}

function PermissionSection({ title, data }: { title: string; data: PermissionData | null }) {
  if (!data) {
    return (
      <div className="rounded-lg border border-td-border bg-td-surface/50 p-4">
        <h3 className="text-sm font-medium text-td-text mb-2">{title}</h3>
        <p className="text-xs text-td-muted">File not found</p>
      </div>
    )
  }

  const hasContent = (data.allow && data.allow.length > 0) || (data.deny && data.deny.length > 0) || data.defaultMode

  return (
    <div className="rounded-lg border border-td-border bg-td-surface/50 p-4 space-y-3">
      <h3 className="text-sm font-medium text-td-text">{title}</h3>

      {data.defaultMode && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-td-muted uppercase tracking-wider">Default mode</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-td-bg border border-td-border text-td-text">
            {data.defaultMode}
          </span>
        </div>
      )}

      {!hasContent && (
        <p className="text-xs text-td-muted">No permissions configured</p>
      )}

      {data.allow && data.allow.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Allow</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.allow.map((rule, i) => (
              <span key={i} className="text-[11px] font-mono px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {rule}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.deny && data.deny.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <XCircle className="h-3 w-3 text-red-400" />
            <span className="text-[10px] text-red-400 uppercase tracking-wider font-medium">Deny</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.deny.map((rule, i) => (
              <span key={i} className="text-[11px] font-mono px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                {rule}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PermissionsSettings({ homedir, projectPath, fixedScope }: PermissionsSettingsProps) {
  const [settings, setSettings] = useState<PermissionData | null>(null)
  const [localSettings, setLocalSettings] = useState<PermissionData | null>(null)
  const [loading, setLoading] = useState(false)

  const loadPermissions = useCallback(async () => {
    if (!homedir) return
    if (fixedScope === 'project' && !projectPath) return
    setLoading(true)

    const basePath = fixedScope === 'global' ? `${homedir}/.claude` : `${projectPath}/.claude`

    const [settingsResult, localResult] = await Promise.all([
      window.api.readFileContent(`${basePath}/settings.json`),
      window.api.readFileContent(`${basePath}/settings.local.json`)
    ])

    const parsePerms = (raw: { content: string; exists: boolean }): PermissionData | null => {
      if (!raw.exists) return null
      try {
        const json = JSON.parse(raw.content)
        const perms = json.permissions || {}
        return {
          allow: perms.allow || [],
          deny: perms.deny || [],
          defaultMode: perms.defaultMode
        }
      } catch {
        return null
      }
    }

    setSettings(parsePerms(settingsResult))
    setLocalSettings(parsePerms(localResult))
    setLoading(false)
  }, [homedir, projectPath, fixedScope])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Shield className="h-4 w-4 text-td-muted" />
        <h2 className="text-lg font-semibold text-td-text tracking-tight">Permissions</h2>
      </div>
      <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
        {fixedScope === 'global'
          ? 'Global tool permission rules that apply across all projects.'
          : 'Project-specific permission overrides.'}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-4 w-4 animate-spin text-td-muted" />
        </div>
      ) : (
        <div className="space-y-4">
          <PermissionSection title="settings.json" data={settings} />
          <PermissionSection title="settings.local.json" data={localSettings} />
        </div>
      )}
    </div>
  )
}
