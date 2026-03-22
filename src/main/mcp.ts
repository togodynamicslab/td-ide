import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: string
  url?: string
  headers?: Record<string, string>
}

export interface MarketplacePlugin {
  id: string
  name: string
  description: string
  author: string
  marketplace: string
  config: McpServerConfig
}

// --- File I/O helpers ---

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function settingsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json')
}

function readProjectSettings(projectPath: string): Record<string, unknown> {
  return readJsonFile(settingsPath(projectPath))
}

function writeProjectSettings(projectPath: string, settings: Record<string, unknown>): void {
  const dirPath = join(projectPath, '.claude')
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
  writeFileSync(settingsPath(projectPath), JSON.stringify(settings, null, 2), 'utf-8')
}

// --- Read MCPs from various sources ---

export function getMcpServers(projectPath: string): Record<string, McpServerConfig> {
  const settings = readProjectSettings(projectPath)
  return (settings.mcpServers as Record<string, McpServerConfig>) || {}
}

export function getGlobalMcpServers(): Record<string, McpServerConfig> {
  const filePath = join(homedir(), '.claude', 'settings.json')
  const settings = readJsonFile(filePath)
  return (settings.mcpServers as Record<string, McpServerConfig>) || {}
}

export function getMarketplacePlugins(): MarketplacePlugin[] {
  const plugins: MarketplacePlugin[] = []
  const marketplacesDir = join(homedir(), '.claude', 'plugins', 'marketplaces')
  if (!existsSync(marketplacesDir)) return plugins

  try {
    const marketplaces = readdirSync(marketplacesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const marketplace of marketplaces) {
      const externalDir = join(marketplacesDir, marketplace.name, 'external_plugins')
      if (!existsSync(externalDir)) continue

      const pluginDirs = readdirSync(externalDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())

      for (const pluginDir of pluginDirs) {
        const mcpJsonPath = join(externalDir, pluginDir.name, '.mcp.json')
        const pluginJsonPath = join(externalDir, pluginDir.name, '.claude-plugin', 'plugin.json')

        if (!existsSync(mcpJsonPath)) continue

        const mcpJson = readJsonFile(mcpJsonPath) as Record<string, McpServerConfig>
        const pluginJson = readJsonFile(pluginJsonPath) as {
          name?: string
          description?: string
          author?: { name?: string }
        }

        // .mcp.json contains { "server-name": { config } }
        const serverEntries = Object.entries(mcpJson)
        if (serverEntries.length === 0) continue

        const [_serverName, config] = serverEntries[0]

        plugins.push({
          id: pluginDir.name,
          name: pluginJson.name || pluginDir.name,
          description: pluginJson.description || '',
          author: pluginJson.author?.name || '',
          marketplace: marketplace.name,
          config
        })
      }
    }
  } catch {
    // Silently fail if we can't read the directory
  }

  return plugins
}

// --- Write MCPs ---

export function setMcpServer(projectPath: string, name: string, config: McpServerConfig): void {
  const settings = readProjectSettings(projectPath)
  const servers = (settings.mcpServers as Record<string, McpServerConfig>) || {}
  servers[name] = config
  settings.mcpServers = servers
  writeProjectSettings(projectPath, settings)
}

export function removeMcpServer(projectPath: string, name: string): void {
  const settings = readProjectSettings(projectPath)
  const servers = (settings.mcpServers as Record<string, McpServerConfig>) || {}
  delete servers[name]
  settings.mcpServers = servers
  writeProjectSettings(projectPath, settings)
}
