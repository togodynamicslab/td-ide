import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and } from 'drizzle-orm'
import * as schema from './schema'

let db: ReturnType<typeof drizzle>
let sqlite: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'td-ide.db')
  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      session_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      tools TEXT NOT NULL DEFAULT '[]',
      reasoning TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      duration INTEGER,
      created_at INTEGER NOT NULL
    );
  `)

  // Migration: add duration column for existing databases
  try {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN duration INTEGER`)
  } catch {
    // Column already exists
  }

  // Migration: add archived column to conversations
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // Column already exists
  }

  // Migration: add title_edited column to conversations
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN title_edited INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // Column already exists
  }

  // Migration: add worktree_path column to conversations
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN worktree_path TEXT`)
  } catch {
    // Column already exists
  }

  // Migration: add content_blocks column to messages for chronological rendering
  try {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN content_blocks TEXT NOT NULL DEFAULT '[]'`)
  } catch {
    // Column already exists
  }

  // Session recovery tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS active_processes (
      conversation_id TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      started_at INTEGER NOT NULL
    );
  `)
}

export function closeDatabase(): void {
  if (sqlite) sqlite.close()
}

// --- Projects ---

export function getAllProjects() {
  return db.select().from(schema.projects).all()
}

export function insertProject(id: string, name: string, path: string) {
  return db.insert(schema.projects).values({ id, name, path, createdAt: new Date() }).run()
}

export function updateProjectName(id: string, name: string) {
  return db.update(schema.projects).set({ name }).where(eq(schema.projects.id, id)).run()
}

export function deleteProject(id: string) {
  return db.delete(schema.projects).where(eq(schema.projects.id, id)).run()
}

// --- Conversations ---

export function getConversationsByProject(projectId: string) {
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.projectId, projectId))
    .all()
}

export function insertConversation(id: string, projectId: string, title: string) {
  return db
    .insert(schema.conversations)
    .values({ id, projectId, title, createdAt: new Date() })
    .run()
}

export function updateConversationTitle(id: string, title: string, titleEdited = false) {
  return db
    .update(schema.conversations)
    .set({ title, ...(titleEdited ? { titleEdited: true } : {}) })
    .where(eq(schema.conversations.id, id))
    .run()
}

export function isConversationTitleEdited(id: string): boolean {
  const row = db
    .select({ titleEdited: schema.conversations.titleEdited })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get()
  return !!row?.titleEdited
}

export function updateConversationSessionId(id: string, sessionId: string) {
  return db
    .update(schema.conversations)
    .set({ sessionId })
    .where(eq(schema.conversations.id, id))
    .run()
}

export function getConversationSessionId(id: string): string | null {
  const row = db
    .select({ sessionId: schema.conversations.sessionId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get()
  return row?.sessionId ?? null
}

export function setConversationArchived(id: string, archived: boolean) {
  return db
    .update(schema.conversations)
    .set({ archived })
    .where(eq(schema.conversations.id, id))
    .run()
}

export function setConversationWorktreePath(id: string, worktreePath: string | null) {
  return db
    .update(schema.conversations)
    .set({ worktreePath })
    .where(eq(schema.conversations.id, id))
    .run()
}

export function getConversationWorktreePath(id: string): string | null {
  const row = db
    .select({ worktreePath: schema.conversations.worktreePath })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get()
  return row?.worktreePath ?? null
}

export function deleteConversation(id: string) {
  return db.delete(schema.conversations).where(eq(schema.conversations.id, id)).run()
}

export function deleteArchivedConversations(projectId: string) {
  return db
    .delete(schema.conversations)
    .where(
      and(
        eq(schema.conversations.projectId, projectId),
        eq(schema.conversations.archived, true)
      )
    )
    .run()
}

// --- Messages ---

export function getMessagesByConversation(conversationId: string) {
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .all()
}

export function insertMessage(
  id: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  tools: string,
  reasoning: string,
  images: string,
  contentBlocks = '[]'
) {
  return db
    .insert(schema.messages)
    .values({ id, conversationId, role, content, tools, reasoning, images, contentBlocks, createdAt: new Date() })
    .run()
}

export function updateMessage(
  id: string,
  content: string,
  tools: string,
  reasoning: string,
  duration?: number,
  contentBlocks = '[]'
) {
  return db
    .update(schema.messages)
    .set({ content, tools, reasoning, contentBlocks, ...(duration != null ? { duration } : {}) })
    .where(eq(schema.messages.id, id))
    .run()
}

// --- App State (key-value persistence) ---

export function getAppState(key: string): string | null {
  const row = db
    .select({ value: schema.appState.value })
    .from(schema.appState)
    .where(eq(schema.appState.key, key))
    .get()
  return row?.value ?? null
}

export function setAppState(key: string, value: string) {
  db.insert(schema.appState)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value } })
    .run()
}

export function getAllAppState(): Record<string, string> {
  const rows = db.select().from(schema.appState).all()
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

export function deleteAppState(key: string) {
  return db.delete(schema.appState).where(eq(schema.appState.key, key)).run()
}

// --- Active Processes (track running Claude PIDs) ---

export function registerActiveProcess(conversationId: string, pid: number) {
  db.insert(schema.activeProcesses)
    .values({ conversationId, pid, startedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.activeProcesses.conversationId,
      set: { pid, startedAt: new Date() }
    })
    .run()
}

export function removeActiveProcess(conversationId: string) {
  return db.delete(schema.activeProcesses).where(eq(schema.activeProcesses.conversationId, conversationId)).run()
}

export function getAllActiveProcesses() {
  return db.select().from(schema.activeProcesses).all()
}

export function clearAllActiveProcesses() {
  return db.delete(schema.activeProcesses).run()
}
