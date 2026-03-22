import { ShieldAlert, X, ArrowRight, ExternalLink } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface PermissionBannerProps {
  visible: boolean
  deniedCount: number
  conversationTitle?: string
  onNavigate?: () => void
  onSwitchToFull: () => void
  onDismiss: () => void
}

export default function PermissionBanner({
  visible,
  deniedCount,
  conversationTitle,
  onNavigate,
  onSwitchToFull,
  onDismiss
}: PermissionBannerProps): JSX.Element | null {
  if (!visible) return null

  return (
    <div className={cn(
      'mx-6 mb-2 max-w-3xl mx-auto',
      'rounded-lg border border-orange-500/30 bg-orange-500/5 px-4 py-3',
      'flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300'
    )}>
      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-orange-500/10 shrink-0">
        <ShieldAlert className="h-4 w-4 text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
          Permission{deniedCount > 1 ? 's' : ''} denied
          {conversationTitle && (
            <span className="font-normal text-orange-600 dark:text-orange-300/70">
              {' '}in &quot;{conversationTitle}&quot;
            </span>
          )}
        </p>
        <p className="text-xs text-orange-600 dark:text-orange-300/70 mt-0.5">
          Claude needs write access. Switch to <span className="font-medium text-orange-800 dark:text-orange-200">Full access</span> to allow it.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onNavigate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigate}
            className="text-xs text-orange-800 dark:text-orange-200 hover:bg-orange-500/10 gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Go to chat
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onSwitchToFull}
          className="text-xs border-orange-500/30 text-orange-800 dark:text-orange-200 hover:bg-orange-500/10 hover:text-orange-900 dark:hover:text-orange-100 gap-1"
        >
          Enable
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <button
        onClick={onDismiss}
        className="text-orange-500 dark:text-orange-400/50 hover:text-orange-700 dark:hover:text-orange-300 transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
