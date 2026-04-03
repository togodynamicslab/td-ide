import { useState } from 'react'
import { Bell, Bug, Loader2, Check, X, Map as MapIcon } from 'lucide-react'
import { Button } from '../ui/button'

interface DeveloperSettingsProps {
  onTestPlanSidebar?: () => void
}

export default function DeveloperSettings({ onTestPlanSidebar }: DeveloperSettingsProps) {
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
        window.api.showNotification('td-ide — Archive feature', result)
      } else {
        setSummaryResult('AI summary returned null — showing fallback notification instead')
        setSummaryState('error')
      }
    } catch (err) {
      setSummaryResult(String(err))
      setSummaryState('error')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Bug className="h-4 w-4 text-td-muted" />
        <h2 className="text-lg font-semibold text-td-text tracking-tight">Developer Mode</h2>
      </div>
      <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
        Debug tools for testing internal features.
      </p>

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
          <Button variant="outline" size="sm" onClick={handleTestNotification} disabled={notifState === 'loading'}>
            {notifState === 'loading' ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> :
             notifState === 'success' ? <Check className="h-3 w-3 mr-1.5 text-emerald-400" /> :
             notifState === 'error' ? <X className="h-3 w-3 mr-1.5 text-red-400" /> :
             <Bell className="h-3 w-3 mr-1.5" />}
            {notifState === 'success' ? 'Sent!' : notifState === 'error' ? 'Failed' : 'Send test notification'}
          </Button>

          <Button variant="outline" size="sm" onClick={handleTestSummary} disabled={summaryState === 'loading'}>
            {summaryState === 'loading' ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Bell className="h-3 w-3 mr-1.5" />}
            Test AI summary generation
          </Button>
        </div>

        {notifState === 'error' && notifError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{notifError}</div>
        )}

        {summaryState !== 'idle' && summaryResult && (
          <div className={`text-xs rounded px-3 py-2 border ${summaryState === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-td-text-secondary bg-td-surface border-td-border'}`}>
            <span className="text-td-muted font-medium">Result: </span>{summaryResult}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-td-border bg-td-surface/50 p-4 space-y-4 mt-4">
        <div>
          <h3 className="text-sm font-medium text-td-text flex items-center gap-2">
            <MapIcon className="h-3.5 w-3.5 text-blue-400" />
            Plan Sidebar
          </h3>
          <p className="text-xs text-td-muted mt-1">Test whether the plan mode sidebar opens with sample content.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onTestPlanSidebar} disabled={!onTestPlanSidebar}>
          <MapIcon className="h-3 w-3 mr-1.5" />
          Open test plan sidebar
        </Button>
      </div>
    </div>
  )
}
