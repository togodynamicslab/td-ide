import { useState, useMemo } from 'react'
import { ArrowLeft, Puzzle, FileText, Terminal, Shield, Type, Bug, Globe, FolderOpen, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import McpSettings from './McpSettings'
import AppearanceSettings from './settings/AppearanceSettings'
import DeveloperSettings from './settings/DeveloperSettings'
import ClaudeMdSettings from './settings/ClaudeMdSettings'
import CommandsSettings from './settings/CommandsSettings'
import PermissionsSettings from './settings/PermissionsSettings'
import KeyboardSettings from './settings/KeyboardSettings'
import type { Project } from '../App'
import type { ShortcutBinding, ShortcutModifiers } from '../hooks/useKeyboardShortcuts'

interface SettingsPageProps {
  project: Project | undefined
  homedir: string
  scope: 'global' | 'project'
  onClose: () => void
  contentFontSize: number
  onContentFontSizeChange: (size: number) => void
  onTestPlanSidebar?: () => void
  shortcuts?: ShortcutBinding[]
  onUpdateShortcut?: (id: string, key: string, modifiers: ShortcutModifiers) => void
  onResetShortcuts?: () => void
}

interface NavItem {
  id: string
  label: string
  icon: typeof Puzzle
  scopes: ('global' | 'project')[]
}

const allNavItems: NavItem[] = [
  { id: 'claude-md', label: 'CLAUDE.md', icon: FileText, scopes: ['global', 'project'] },
  { id: 'commands', label: 'Commands', icon: Terminal, scopes: ['global', 'project'] },
  { id: 'permissions', label: 'Permissions', icon: Shield, scopes: ['global', 'project'] },
  { id: 'mcp', label: 'MCP Servers', icon: Puzzle, scopes: ['project'] },
  { id: 'appearance', label: 'Appearance', icon: Type, scopes: ['global'] },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard, scopes: ['global'] },
  { id: 'developer', label: 'Developer', icon: Bug, scopes: ['global'] },
]

function SettingsPage({ project, homedir, scope, onClose, contentFontSize, onContentFontSizeChange, onTestPlanSidebar, shortcuts, onUpdateShortcut, onResetShortcuts }: SettingsPageProps): JSX.Element {
  const navItems = useMemo(() => allNavItems.filter((item) => item.scopes.includes(scope)), [scope])
  const [activeSection, setActiveSection] = useState(() => navItems[0]?.id || 'claude-md')

  const fixedScope = scope === 'project' ? 'project' : 'global'

  return (
    <div className="flex flex-1 flex-col min-w-0 bg-td-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 h-12 flex items-center gap-3 px-5 border-b border-td-border bg-td-bg/80 backdrop-blur-sm shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-td-muted hover:text-td-text transition-colors rounded-lg px-2.5 py-1.5 -ml-2 hover:bg-td-surface"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-xs font-medium">Back</span>
        </button>
        <div className="h-4 w-px bg-td-border" />
        {scope === 'global' ? (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-td-muted" />
            <h1 className="text-sm font-semibold text-td-text">Global Settings</h1>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-td-muted" />
            <h1 className="text-sm font-semibold text-td-text">Project Settings</h1>
            {project && (
              <>
                <div className="h-4 w-px bg-td-border ml-1.5" />
                <span className="text-xs text-td-muted truncate">{project.name}</span>
              </>
            )}
          </div>
        )}
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation sidebar */}
        <nav className="w-48 shrink-0 border-r border-td-border overflow-y-auto py-3 px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mb-0.5',
                activeSection === item.id
                  ? 'bg-td-hover text-td-text'
                  : 'text-td-muted hover:bg-td-hover/50 hover:text-td-text'
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            {activeSection === 'mcp' && (
              <>
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-td-text tracking-tight">MCP Servers</h2>
                  <p className="text-[13px] text-td-muted mt-1.5 leading-relaxed">
                    Model Context Protocol servers extend Claude&apos;s capabilities with external tools
                    and data sources. Configure which servers are available for this project.
                  </p>
                </div>
                <McpSettings project={project} />
              </>
            )}

            {activeSection === 'claude-md' && (
              <ClaudeMdSettings homedir={homedir} projectPath={project?.path} fixedScope={fixedScope} />
            )}

            {activeSection === 'commands' && (
              <CommandsSettings homedir={homedir} projectPath={project?.path} fixedScope={fixedScope} />
            )}

            {activeSection === 'permissions' && (
              <PermissionsSettings homedir={homedir} projectPath={project?.path} fixedScope={fixedScope} />
            )}

            {activeSection === 'appearance' && (
              <AppearanceSettings contentFontSize={contentFontSize} onContentFontSizeChange={onContentFontSizeChange} />
            )}

            {activeSection === 'keyboard' && shortcuts && onUpdateShortcut && onResetShortcuts && (
              <>
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-td-text tracking-tight">Keyboard Shortcuts</h2>
                  <p className="text-[13px] text-td-muted mt-1.5">
                    Customize keyboard shortcuts. Click a binding to record a new key combination.
                  </p>
                </div>
                <KeyboardSettings shortcuts={shortcuts} onUpdateShortcut={onUpdateShortcut} onResetAll={onResetShortcuts} />
              </>
            )}

            {activeSection === 'developer' && (
              <DeveloperSettings onTestPlanSidebar={onTestPlanSidebar} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
