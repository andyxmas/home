import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDatabase } from '../db/client'

export function createTestDatabase() {
  const { sqlite, db } = createDatabase(':memory:')
  const migrationPath = resolve(process.cwd(), 'src/data/db/migrations/0000_initial.sql')
  const migrationSql = readFileSync(migrationPath, 'utf8')
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    sqlite.exec(statement)
  }

  return {
    db,
    close() {
      sqlite.close()
    },
  }
}
