import { Type, Minus, Plus } from 'lucide-react'

interface AppearanceSettingsProps {
  contentFontSize: number
  onContentFontSizeChange: (size: number) => void
}

export default function AppearanceSettings({ contentFontSize, onContentFontSizeChange }: AppearanceSettingsProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Type className="h-4 w-4 text-td-muted" />
        <h2 className="text-lg font-semibold text-td-text tracking-tight">Appearance</h2>
      </div>
      <p className="text-[13px] text-td-muted mb-6 leading-relaxed">
        Customize how content is displayed in the chat area.
      </p>

      <div className="rounded-lg border border-td-border bg-td-surface/50 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-td-text">Content Font Size</h3>
          <p className="text-xs text-td-muted mt-1">
            Adjust the font size for assistant message content.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onContentFontSizeChange(Math.max(10, contentFontSize - 1))}
            disabled={contentFontSize <= 10}
            className="h-7 w-7 rounded-lg border border-td-border bg-td-bg flex items-center justify-center text-td-muted hover:text-td-text hover:border-td-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus className="h-3 w-3" />
          </button>

          <div className="flex-1 relative">
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={contentFontSize}
              onChange={(e) => onContentFontSizeChange(parseInt(e.target.value, 10))}
              className="w-full accent-td-accent h-1.5 rounded-full appearance-none bg-td-border cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-td-accent [&::-webkit-slider-thumb]:shadow-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => onContentFontSizeChange(Math.min(24, contentFontSize + 1))}
            disabled={contentFontSize >= 24}
            className="h-7 w-7 rounded-lg border border-td-border bg-td-bg flex items-center justify-center text-td-muted hover:text-td-text hover:border-td-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" />
          </button>

          <span className="text-xs font-mono text-td-text-secondary w-10 text-right">{contentFontSize}px</span>
        </div>

        <div className="text-xs text-td-muted rounded-lg bg-td-bg px-3 py-2" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: `${contentFontSize}px` }}>
          The quick brown fox jumps over the lazy dog.
        </div>
      </div>
    </div>
  )
}
