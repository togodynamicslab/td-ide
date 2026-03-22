import { useState, useEffect, useCallback } from 'react'
import { Switch } from './ui/switch'
import { Plus, Trash2, Eye, EyeOff, Search, Globe, ChevronDown, ChevronRight, X, Info } from 'lucide-react'
import type { Project } from '../App'

interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: string
  url?: string
  headers?: Record<string, string>
}

interface MarketplacePlugin {
  id: string
  name: string
  description: string
  author: string
  marketplace: string
  config: McpServerConfig
}

function McpSettings({ project }: { project: Project | undefined }): JSX.Element {
  const [installed, setInstalled] = useState<Record<string, McpServerConfig>>({})
  const [globalServers, setGlobalServers] = useState<Record<string, McpServerConfig>>({})
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCommand, setCustomCommand] = useState('')
  const [customArgs, setCustomArgs] = useState('')
  const [customEnvPairs, setCustomEnvPairs] = useState<{ key: string; value: string }[]>([])
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['marketplace']))
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const loadServers = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const result = await window.api.getMcpServers(project.path)
      setInstalled(result.installed as Record<string, McpServerConfig>)
      setGlobalServers((result.global || {}) as Record<string, McpServerConfig>)
      setMarketplace(result.marketplace as MarketplacePlugin[])
    } catch (err) {
      console.error('Failed to load MCP servers:', err)
    } finally {
      setLoading(false)
    }
  }, [project?.path])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  // --- No project state ---
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-2xl bg-td-surface flex items-center justify-center mb-4">
          <Globe className="h-6 w-6 text-td-muted" />
        </div>
        <p className="text-sm font-medium text-td-text">No project selected</p>
        <p className="text-xs text-td-muted mt-1">Open a project to manage MCP servers</p>
      </div>
    )
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 border-2 border-td-accent/30 border-t-td-accent rounded-full animate-spin" />
      </div>
    )
  }

  // --- Computed ---
  const marketplaceIds = new Set(marketplace.map((p) => p.id))
  const globalIds = new Set(Object.keys(globalServers))
  const customServers = Object.entries(installed).filter(
    ([name]) => !marketplaceIds.has(name) && !globalIds.has(name)
  )

  const matchesSearch = (text: string) =>
    !search || text.toLowerCase().includes(search.toLowerCase())

  const formatConfig = (config: McpServerConfig): string => {
    if (config.type === 'http' && config.url) return config.url
    if (config.command) return `${config.command} ${(config.args || []).join(' ')}`
    return JSON.stringify(config)
  }

  const filteredMarketplace = marketplace.filter(
    (p) => matchesSearch(p.name) || matchesSearch(p.description) || matchesSearch(p.author)
  )
  const filteredGlobal = Object.entries(globalServers).filter(
    ([name]) => matchesSearch(name)
  )
  const filteredCustom = customServers.filter(
    ([name]) => matchesSearch(name)
  )

  // --- Handlers ---
  const toggleSetItem = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleMarketplace = async (plugin: MarketplacePlugin) => {
    const isInstalled = plugin.id in installed
    if (isInstalled) {
      await window.api.removeMcpServer(project.path, plugin.id)
      setInstalled((prev) => {
        const next = { ...prev }
        delete next[plugin.id]
        return next
      })
    } else {
      await window.api.addMcpServer(project.path, plugin.id, plugin.config)
      setInstalled((prev) => ({ ...prev, [plugin.id]: plugin.config }))
    }
  }

  const handleToggleGlobal = async (name: string, config: McpServerConfig) => {
    const isInstalled = name in installed
    if (isInstalled) {
      await window.api.removeMcpServer(project.path, name)
      setInstalled((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    } else {
      await window.api.addMcpServer(project.path, name, config)
      setInstalled((prev) => ({ ...prev, [name]: config }))
    }
  }

  const handleRemoveCustom = async (name: string) => {
    await window.api.removeMcpServer(project.path, name)
    setInstalled((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const handleAddCustom = async () => {
    const name = customName.trim()
    if (!name || !customCommand.trim()) return
    const config: McpServerConfig = {
      command: customCommand.trim(),
      args: customArgs.trim() ? customArgs.trim().split(/\s+/) : [],
      env: Object.fromEntries(customEnvPairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]))
    }
    await window.api.addMcpServer(project.path, name, config)
    setInstalled((prev) => ({ ...prev, [name]: config }))
    resetCustomForm()
  }

  const resetCustomForm = () => {
    setCustomName('')
    setCustomCommand('')
    setCustomArgs('')
    setCustomEnvPairs([])
    setShowCustomForm(false)
  }

  const marketplaceActiveCount = filteredMarketplace.filter(p => p.id in installed).length
  const globalActiveCount = filteredGlobal.filter(([name]) => name in installed).length

  const CompactServerRow = ({ id, name, icon, isInstalled, isExpanded, onToggle, onToggleDetails, details }: {
    id: string
    name: string
    icon: React.ReactNode
    isInstalled: boolean
    isExpanded: boolean
    onToggle: () => void
    onToggleDetails: () => void
    details: React.ReactNode
  }) => (
    <div
      key={id}
      className={`transition-colors duration-150 ${
        isInstalled ? 'bg-td-accent/[0.03]' : 'bg-td-surface/10 hover:bg-td-surface/20'
      }`}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-td-text truncate">{name}</span>
            {isInstalled && (
              <span className="text-[9px] px-1.5 py-px rounded-full bg-emerald-500/10 text-emerald-400 font-medium leading-tight">
                Active
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onToggleDetails}
          className="h-6 w-6 rounded-md flex items-center justify-center text-td-muted/50 hover:text-td-muted hover:bg-td-surface transition-colors shrink-0"
          title="Show details"
        >
          <Info className="h-3 w-3" />
        </button>
        <Switch checked={isInstalled} onCheckedChange={onToggle} className="shrink-0" />
      </div>
      {isExpanded && (
        <div className="px-3.5 pb-2.5 pl-[3.25rem]">{details}</div>
      )}
    </div>
  )

  // --- Section header component ---
  const SectionHeader = ({ id, title, count, activeCount, subtitle }: { id: string; title: string; count: number; activeCount?: number; subtitle?: string }) => (
    <button
      onClick={() => toggleSetItem(setCollapsedSections, id)}
      className="flex items-center gap-2.5 w-full mb-3 group"
    >
      {collapsedSections.has(id) ? (
        <ChevronRight className="h-3.5 w-3.5 text-td-muted" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-td-muted" />
      )}
      <span className="text-[11px] font-semibold text-td-muted uppercase tracking-wider">{title}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-td-surface text-td-muted font-medium tabular-nums">
        {activeCount !== undefined ? `${activeCount} / ${count}` : count}
      </span>
      <div className="flex-1 h-px bg-td-border/40" />
      {subtitle && (
        <span className="text-[10px] text-td-muted/50 group-hover:text-td-muted/70 transition-colors font-mono">
          {subtitle}
        </span>
      )}
    </button>
  )

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-td-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-10 rounded-xl bg-td-surface border border-td-border text-sm text-td-text placeholder:text-td-muted/50 outline-none focus:ring-2 focus:ring-td-accent/20 focus:border-td-accent/50 transition-all"
          placeholder="Search servers..."
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-td-muted hover:text-td-text transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ───── Marketplace Plugins ───── */}
      {filteredMarketplace.length > 0 && (
        <section>
          <SectionHeader id="marketplace" title="Marketplace" count={filteredMarketplace.length} activeCount={marketplaceActiveCount} subtitle="Claude plugins" />

          {!collapsedSections.has('marketplace') && (
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-td-border/30">
              <div className="divide-y divide-td-border/30">
                {filteredMarketplace.map((plugin) => (
                  <CompactServerRow
                    key={plugin.id}
                    id={plugin.id}
                    name={plugin.name}
                    icon={<div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0"><span className="text-[10px] font-bold text-violet-400">{plugin.name[0]?.toUpperCase()}</span></div>}
                    isInstalled={plugin.id in installed}
                    isExpanded={expandedCards.has(`mp-${plugin.id}`)}
                    onToggle={() => handleToggleMarketplace(plugin)}
                    onToggleDetails={() => toggleSetItem(setExpandedCards, `mp-${plugin.id}`)}
                    details={
                      <>
                        <p className="text-[11px] text-td-muted leading-relaxed">{plugin.description}</p>
                        {plugin.author && (
                          <p className="text-[10px] text-td-muted/60 mt-1">
                            by <span className="text-td-muted/80">{plugin.author}</span>
                          </p>
                        )}
                        <p className="text-[10px] text-td-muted/40 mt-1 font-mono truncate">
                          {formatConfig(plugin.config)}
                        </p>
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ───── Global MCPs ───── */}
      {filteredGlobal.length > 0 && (
        <section>
          <SectionHeader id="global" title="Global" count={filteredGlobal.length} activeCount={globalActiveCount} subtitle="~/.claude/settings.json" />

          {!collapsedSections.has('global') && (
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-td-border/30">
              <div className="divide-y divide-td-border/30">
                {filteredGlobal.map(([name, config]) => (
                  <CompactServerRow
                    key={name}
                    id={name}
                    name={name}
                    icon={<div className="h-7 w-7 rounded-md bg-td-surface flex items-center justify-center shrink-0"><Globe className="h-3.5 w-3.5 text-td-muted" /></div>}
                    isInstalled={name in installed}
                    isExpanded={expandedCards.has(`gl-${name}`)}
                    onToggle={() => handleToggleGlobal(name, config)}
                    onToggleDetails={() => toggleSetItem(setExpandedCards, `gl-${name}`)}
                    details={
                      <p className="text-[10px] text-td-muted/60 font-mono truncate">
                        {formatConfig(config)}
                      </p>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ───── Custom MCPs ───── */}
      <section>
        <SectionHeader id="custom" title="Custom" count={customServers.length} />

        {!collapsedSections.has('custom') && (
          <div className="space-y-2">
            {filteredCustom.map(([name, config]) => (
              <div
                key={name}
                className="rounded-xl border border-td-border/50 bg-td-surface/20 hover:bg-td-surface/30 transition-colors p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-td-surface flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-td-muted">{name[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-td-text">{name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-td-muted mt-1 font-mono truncate">
                      {formatConfig(config)}
                    </p>
                    {Object.keys(config.env || {}).length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {Object.keys(config.env!).map((envKey) => (
                          <span key={envKey} className="text-[10px] px-1.5 py-0.5 rounded-md bg-td-bg border border-td-border/50 text-td-muted font-mono">
                            {envKey}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveCustom(name)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-td-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add custom server */}
            {!showCustomForm ? (
              <button
                onClick={() => setShowCustomForm(true)}
                className="w-full rounded-xl border border-dashed border-td-border/60 p-4 text-sm text-td-muted hover:text-td-text hover:border-td-accent/40 hover:bg-td-accent/[0.02] transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add custom MCP server
              </button>
            ) : (
              <div className="rounded-xl border border-td-accent/20 bg-td-accent/[0.02] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-td-text">New custom server</span>
                  <button onClick={resetCustomForm} className="text-td-muted hover:text-td-text transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-td-muted mb-1.5">Server name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-td-bg border border-td-border text-xs text-td-text placeholder:text-td-muted/50 outline-none focus:ring-2 focus:ring-td-accent/20 focus:border-td-accent/50 transition-all"
                    placeholder="my-mcp-server"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-td-muted mb-1.5">Command</label>
                  <input
                    type="text"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-td-bg border border-td-border text-xs text-td-text font-mono placeholder:text-td-muted/50 outline-none focus:ring-2 focus:ring-td-accent/20 focus:border-td-accent/50 transition-all"
                    placeholder="npx"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-td-muted mb-1.5">Arguments</label>
                  <input
                    type="text"
                    value={customArgs}
                    onChange={(e) => setCustomArgs(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-td-bg border border-td-border text-xs text-td-text font-mono placeholder:text-td-muted/50 outline-none focus:ring-2 focus:ring-td-accent/20 focus:border-td-accent/50 transition-all"
                    placeholder="-y @some/mcp-package"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-td-muted">Environment variables</label>
                    <button
                      onClick={() => setCustomEnvPairs((prev) => [...prev, { key: '', value: '' }])}
                      className="text-[10px] text-td-accent hover:text-td-accent/80 font-medium transition-colors"
                    >
                      + Add variable
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {customEnvPairs.map((pair, i) => (
                      <div key={i} className="flex gap-1.5">
                        <input
                          type="text"
                          value={pair.key}
                          onChange={(e) => {
                            const next = [...customEnvPairs]
                            next[i] = { ...next[i], key: e.target.value }
                            setCustomEnvPairs(next)
                          }}
                          className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-td-bg border border-td-border text-xs text-td-text font-mono placeholder:text-td-muted/50 outline-none focus:ring-2 focus:ring-td-accent/20 focus:border-td-accent/50 transition-all"
                          placeholder="KEY"
                        />
                        <input
                          type="text"
                          value={pair.value}
                          onChange={(e) => {
                            const next = [...customEnvPairs]
                            next[i] = { ...next[i], value: e.target.value }
                            setCustomEnvPairs(next)
                          }}
                          className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-td-bg border border-td-border text-xs text-td-text font-mono placeholder:text-td-muted/50 outline-none focus:ring-2 focus:ring-td-accent/20 focus:border-td-accent/50 transition-all"
                          placeholder="value"
                        />
                        <button
                          onClick={() => setCustomEnvPairs((prev) => prev.filter((_, j) => j !== i))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-td-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAddCustom}
                    disabled={!customName.trim() || !customCommand.trim()}
                    className="h-8 px-4 rounded-lg bg-td-accent hover:bg-td-accent/90 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add server
                  </button>
                  <button
                    onClick={resetCustomForm}
                    className="h-8 px-4 rounded-lg border border-td-border text-td-muted text-xs font-medium hover:bg-td-hover transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default McpSettings
