import { useState } from 'react'
import { ArrowLeft, Bell, Bug, Loader2, Check, X, Map as MapIcon } from 'lucide-react'
import { Button } from './ui/button'
import McpSettings from './McpSettings'
import type { Project } from '../App'

interface SettingsPageProps {
  project: Project | undefined
  onClose: () => void
  onTestPlanSidebar?: () => void
}

function SettingsPage({ project, onClose, onTestPlanSidebar }: SettingsPageProps): JSX.Element {
  const [notifState, setNotifState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [notifError, setNotifError] = useState('')
  const [summaryState, setSummaryState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [summaryResult, setSummaryResult] = useState('')

  const handleTestNotification = async () => {
    setNotifState('loading')
    try {
      await window.api.showNotification(
        'td-ide — Archive feature',
        'Added archive support for conversation threads with collapsible section in sidebar.'
      )
      setNotifState('success')
      setTimeout(() => setNotifState('idle'), 3000)
    } catch (err) {
      setNotifError(String(err))
      setNotifState('error')
      setTimeout(() => setNotifState('idle'), 5000)
    }
  }

  const handleTestSummary = async () => {
    setSummaryState('loading')
    setSummaryResult('')
    try {
      const result = await window.api.generateNotificationSummary(
        'I implemented a new feature that adds archive support to conversation threads. Users can now right-click a conversation and select Archive to hide it from the main list. Archived conversations appear in a collapsible section.',
        'Archive feature'
      )
      if (result) {
        setSummaryResult(result)
        setSummaryState('success')
        // Also show it as an actual notification so you can see the end-to-end result
        window.api.showNotification('td-ide — Archive feature', result)
      } else {
        setSummaryResult('AI summary returned null — showing fallback notification instead')
        setSummaryState('error')
        window.api.showNotification(
          'td-ide — Archive feature',
          'Added archive support for conversation threads with collapsible section in sidebar.'
        )
      }
    } catch (err) {
      setSummaryResult(String(err))
      setSummaryState('error')
      // Still show a fallback notification
      window.api.showNotification(
        'td-ide — Archive feature',
        'Added archive support for conversation threads with collapsible section in sidebar.'
      )
    }
  }

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
        <h1 className="text-sm font-semibold text-td-text">Settings</h1>
        {project && (
          <>
            <div className="h-4 w-px bg-td-border" />
            <span className="text-xs text-td-muted truncate">{project.name}</span>
          </>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-td-text tracking-tight">MCP Servers</h2>
            <p className="text-[13px] text-td-muted mt-1.5 leading-relaxed">
              Model Context Protocol servers extend Claude&apos;s capabilities with external tools
              and data sources. Configure which servers are available for this project.
            </p>
          </div>

          <McpSettings project={project} />

          {/* Developer Mode */}
          <div className="mt-12 pt-8 border-t border-td-border">
            <div className="flex items-center gap-2 mb-1.5">
              <Bug className="h-4 w-4 text-td-muted" />
              <h2 className="text-lg font-semibold text-td-text tracking-tight">Developer Mode</h2>
            </div>
            <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
              Debug tools for testing internal features.
            </p>

            {/* Notifications */}
            <div className="rounded-lg border border-td-border bg-td-surface/50 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-td-text flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-td-muted" />
                  Notifications
                </h3>
                <p className="text-xs text-td-muted mt-1">
                  Test whether OS notifications are working on this system.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  disabled={notifState === 'loading'}
                >
                  {notifState === 'loading' ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : notifState === 'success' ? (
                    <Check className="h-3 w-3 mr-1.5 text-emerald-400" />
                  ) : notifState === 'error' ? (
                    <X className="h-3 w-3 mr-1.5 text-red-400" />
                  ) : (
                    <Bell className="h-3 w-3 mr-1.5" />
                  )}
                  {notifState === 'success' ? 'Sent!' : notifState === 'error' ? 'Failed' : 'Send test notification'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestSummary}
                  disabled={summaryState === 'loading'}
                >
                  {summaryState === 'loading' ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <Bell className="h-3 w-3 mr-1.5" />
                  )}
                  Test AI summary generation
                </Button>
              </div>

              {notifState === 'error' && notifError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                  {notifError}
                </div>
              )}

              {summaryState !== 'idle' && summaryResult && (
                <div className={`text-xs rounded px-3 py-2 border ${
                  summaryState === 'error'
                    ? 'text-red-400 bg-red-500/10 border-red-500/20'
                    : 'text-td-text-secondary bg-td-surface border-td-border'
                }`}>
                  <span className="text-td-muted font-medium">Result: </span>
                  {summaryResult}
                </div>
              )}
            </div>

            {/* Plan Sidebar */}
            <div className="rounded-lg border border-td-border bg-td-surface/50 p-4 space-y-4 mt-4">
              <div>
                <h3 className="text-sm font-medium text-td-text flex items-center gap-2">
                  <MapIcon className="h-3.5 w-3.5 text-blue-400" />
                  Plan Sidebar
                </h3>
                <p className="text-xs text-td-muted mt-1">
                  Test whether the plan mode sidebar opens with sample content.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onTestPlanSidebar}
                disabled={!onTestPlanSidebar}
              >
                <MapIcon className="h-3 w-3 mr-1.5" />
                Open test plan sidebar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
