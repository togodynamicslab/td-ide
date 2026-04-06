import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const activeProcesses = sqliteTable('active_processes', {
  conversationId: text('conversation_id').primaryKey(),
  pid: integer('pid').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull()
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  additionalPaths: text('additional_paths').notNull().default('[]'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sessionId: text('session_id'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  titleEdited: integer('title_edited', { mode: 'boolean' }).notNull().default(false),
  worktreePath: text('worktree_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull().default(''),
  tools: text('tools').notNull().default('[]'),
  reasoning: text('reasoning').notNull().default(''),
  images: text('images').notNull().default('[]'),
  contentBlocks: text('content_blocks').notNull().default('[]'),
  duration: integer('duration'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})
