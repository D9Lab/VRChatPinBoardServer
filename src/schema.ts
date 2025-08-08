// src/schema.ts
import { sql } from 'drizzle-orm'
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core'

// 留言板表
export const pinboards = sqliteTable('pinboards', {
  pinboardId: text('pinboardId').primaryKey().notNull(),
  hashKey: text('hashKey').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
})

// 留言表
export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pinboardId: text('pinboardId').notNull(),
  index: integer('index').notNull(),
  localPosition: text('localPosition').notNull(),
  angle: text('angle').notNull(),
  colorHue: text('colorHue').notNull(),
  content: text('content').notNull(),
  userHash: text('userHash').notNull(),
  timestamp: integer('timestamp').notNull()
})

export type Pinboard = typeof pinboards.$inferInsert
export type Note = typeof notes.$inferInsert