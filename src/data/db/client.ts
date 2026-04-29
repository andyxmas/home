import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type HomeDb = ReturnType<typeof drizzle<typeof schema>>

export type HomeDatabase = {
  sqlite: Database.Database
  db: HomeDb
}

export function createDatabase(databasePath: string): HomeDatabase {
  const sqlite = new Database(databasePath)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

export function runMigrations(db: HomeDb, migrationsFolder: string): void {
  migrate(db, { migrationsFolder })
}
