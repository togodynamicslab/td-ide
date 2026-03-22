import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription
} from './ui/dialog'
import type { ConversationUsage } from '../App'

interface UsageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  usage: ConversationUsage | null
  conversationTitle: string | null
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function UsageDialog({ open, onOpenChange, usage, conversationTitle }: UsageDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-td-surface border-td-border">
        <DialogTitle className="text-td-text">Session Usage</DialogTitle>
        <DialogDescription className="text-td-muted text-sm">
          {conversationTitle
            ? `Token usage for "${conversationTitle}"`
            : 'No active conversation'}
        </DialogDescription>

        {usage ? (
          <div className="space-y-4 mt-2">
            {/* Cost equivalent */}
            <div className="p-3 rounded-lg bg-td-bg border border-td-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-td-muted">API Equivalent</span>
                <span className="text-lg font-semibold text-td-text">{formatCost(usage.totalCostUsd)}</span>
              </div>
              <p className="text-[10px] text-td-muted mt-1">What this would cost via API — not charged on subscription plans</p>
            </div>

            {/* Token breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-td-muted uppercase tracking-wider">Tokens</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-td-bg border border-td-border">
                  <div className="text-[11px] text-td-muted">Input</div>
                  <div className="text-sm font-medium text-td-text">{formatTokens(usage.inputTokens)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-td-bg border border-td-border">
                  <div className="text-[11px] text-td-muted">Output</div>
                  <div className="text-sm font-medium text-td-text">{formatTokens(usage.outputTokens)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-td-bg border border-td-border">
                  <div className="text-[11px] text-td-muted">Cache Read</div>
                  <div className="text-sm font-medium text-td-text">{formatTokens(usage.cacheReadTokens)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-td-bg border border-td-border">
                  <div className="text-[11px] text-td-muted">Cache Write</div>
                  <div className="text-sm font-medium text-td-text">{formatTokens(usage.cacheCreationTokens)}</div>
                </div>
              </div>
            </div>

            {/* Turns */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-td-muted">Turns</span>
              <span className="text-td-text font-medium">{usage.turns}</span>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-td-muted">
            No usage data yet. Send a message to start tracking.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default UsageDialog
