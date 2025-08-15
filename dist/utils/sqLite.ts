// @ts-nocheck
/*
import Database from 'better-sqlite3'
import { EventEmitter } from 'tseep'
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

interface SQLiteDBOptions {
  dbPath?: string
  options?: Database.Options
  pragma?: Record<string, string | number>
  backup?: {
    enabled: boolean
    interval: number // minutes
    keepCount: number
    cleanupOnStart?: boolean
  }
}

interface CollectionOptions {
  tableName: string
}

interface QueryBuilder {
  where: string[]
  params: any[]
}

// Safe name validation for SQL identifiers
const SAFE_NAME_REGEX = /^[a-zA-Z0-9_]+$/
const MAX_REGEX_LENGTH = 100

function validateSQLName(name: string): string {
  if (!SAFE_NAME_REGEX.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}. Only alphanumeric and underscore allowed.`)
  }
  return name
}

function sanitizeRegexPattern(pattern: string): string {
  if (pattern.length > MAX_REGEX_LENGTH) {
    throw new Error('Regex pattern too long (max 100 chars)')
  }
  // Basic ReDoS protection - reject patterns with excessive quantifiers
  if (/(\*\+|\+\*|\{\d*,\d*\}[\*\+]|\*\{|\+\{)/.test(pattern)) {
    throw new Error('Potentially unsafe regex pattern detected')
  }
  return pattern
}

class SQLiteDB extends EventEmitter {
  private readonly db: Database.Database
  private readonly collections = new Map<string, Collection>()
  private readonly dbPath: string
  private backupInterval?: NodeJS.Timeout
  private readonly backupConfig?: SQLiteDBOptions['backup']

  constructor(options: SQLiteDBOptions = {}) {
    super()

    this.dbPath = options.dbPath || join(process.cwd(), 'db', 'database.db')
    this.backupConfig = options.backup

    // Ensure directory exists
    const dbDir = dirname(this.dbPath)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    // Initialize database with proper constructor
    const dbOptions: Database.Options = {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      fileMustExist: false,
      timeout: 5000,
      ...options.options
    }

    this.db = new Database(this.dbPath, dbOptions)

    // Set WAL mode first (most important pragma)
    this.db.pragma('journal_mode = WAL')

    // Apply other performance pragmas
    const defaultPragma = {
      synchronous: 'NORMAL',
      cache_size: -32000, // 32MB cache
      temp_store: 'MEMORY',
      mmap_size: 134217728, // 128MB
      foreign_keys: 'ON',
      ...options.pragma
    }

    // Apply pragma settings
    Object.entries(defaultPragma).forEach(([key, value]) => {
      this.db.pragma(`${key} = ${value}`)
    })

    // Run ANALYZE for query optimization
    this.db.pragma('optimize')

    // Setup backup if enabled
    if (options.backup?.enabled) {
      if (options.backup.cleanupOnStart) {
        this.cleanupOldBackups()
      }
      this.setupBackup(options.backup)
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => this.close())
    process.on('SIGTERM', () => this.close())
  }

  collection(name: string): Collection {
    const cached = this.collections.get(name)
    if (cached) return cached

    const collection = new Collection(this.db, { tableName: validateSQLName(name) })
    this.collections.set(name, collection)

    collection.on('change', (eventType, data) => {
      this.emit('collectionChange', { collection: name, eventType, data })
    })

    return collection
  }

  private setupBackup(config: { interval: number; keepCount: number }): void {
    this.backupInterval = setInterval(() => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupPath = this.dbPath.replace('.db', `_backup_${timestamp}.db`)

        this.db.backup(backupPath)
        console.log(`Database backed up to: ${backupPath}`)

        // Clean up old backups
        this.cleanupOldBackups()
      } catch (error) {
        console.error('Backup failed:', error)
      }
    }, config.interval * 60 * 1000)
  }

  private cleanupOldBackups(): void {
    if (!this.backupConfig?.keepCount) return

    try {
      const backupDir = dirname(this.dbPath)
      const backupPrefix = this.dbPath.replace('.db', '_backup_')

      const backupFiles = readdirSync(backupDir)
        .filter(file => file.startsWith(backupPrefix.split('/').pop()!) && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: join(backupDir, file),
          mtime: statSync(join(backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

      // Remove old backups beyond keepCount
      const toDelete = backupFiles.slice(this.backupConfig.keepCount)
      for (const backup of toDelete) {
        try {
          unlinkSync(backup.path)
          console.log(`Cleaned up old backup: ${backup.name}`)
        } catch (err) {
          console.error(`Failed to delete backup ${backup.name}:`, err)
        }
      }
    } catch (error) {
      console.error('Backup cleanup failed:', error)
    }
  }

  close(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval)
    }

    this.collections.clear()
    this.db.close()
    this.removeAllListeners()
  }

  // Transaction wrapper using better-sqlite3's transaction method
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // Get database info
  getInfo(): any {
    return {
      inTransaction: this.db.inTransaction,
      open: this.db.open,
      readonly: this.db.readonly,
      memory: this.db.memory,
      name: this.db.name
    }
  }
}

class Collection extends EventEmitter {
  private readonly db: Database.Database
  private readonly tableName: string

  // Prepared statements for better performance
  private readonly insertStmt: Database.Statement<[string, string]>
  private readonly updateStmt: Database.Statement<[string, string]>
  private readonly deleteStmt: Database.Statement<[string]>
  private readonly findByIdStmt: Database.Statement<[string]>
  private readonly countAllStmt: Database.Statement<[]>

  constructor(db: Database.Database, options: CollectionOptions) {
    super()
    this.db = db
    this.tableName = validateSQLName(options.tableName)

    this.createTable()
    this.prepareStatements()
  }

  private createTable(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        _id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
    this.db.exec(sql)
  }

  private prepareStatements(): void {
    this.insertStmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (_id, data, createdAt, updatedAt)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)

    this.updateStmt = this.db.prepare(`
      UPDATE ${this.tableName}
      SET data = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE _id = ?
    `)

    this.deleteStmt = this.db.prepare(`
      DELETE FROM ${this.tableName} WHERE _id = ?
    `)

    this.findByIdStmt = this.db.prepare(`
      SELECT _id, data FROM ${this.tableName} WHERE _id = ?
    `)

    this.countAllStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM ${this.tableName}
    `)
  }

  private buildWhereClause(query: any): QueryBuilder {
    const where: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(query)) {
      const safeKey = validateSQLName(key)

      if (typeof value !== 'object' || value === null) {
        // Simple equality
        where.push(`json_extract(data, '$.${safeKey}') = ?`)
        params.push(value)
      } else {
        // Handle operators
        for (const [op, val] of Object.entries(value as any)) {
          switch (op) {
            case '$gt':
              where.push(`json_extract(data, '$.${safeKey}') > ?`)
              params.push(val)
              break
            case '$gte':
              where.push(`json_extract(data, '$.${safeKey}') >= ?`)
              params.push(val)
              break
            case '$lt':
              where.push(`json_extract(data, '$.${safeKey}') < ?`)
              params.push(val)
              break
            case '$lte':
              where.push(`json_extract(data, '$.${safeKey}') <= ?`)
              params.push(val)
              break
            case '$ne':
              where.push(`json_extract(data, '$.${safeKey}') != ?`)
              params.push(val)
              break
            case '$in':
              if (Array.isArray(val) && val.length > 0) {
                const placeholders = val.map(() => '?').join(',')
                where.push(`json_extract(data, '$.${safeKey}') IN (${placeholders})`)
                params.push(...val)
              }
              break
            case '$nin':
              if (Array.isArray(val) && val.length > 0) {
                const placeholders = val.map(() => '?').join(',')
                where.push(`json_extract(data, '$.${safeKey}') NOT IN (${placeholders})`)
                params.push(...val)
              }
              break
            case '$regex':
              // Use SQLite's REGEXP function (safer than JS RegExp)
              const pattern = sanitizeRegexPattern(val as string)
              where.push(`json_extract(data, '$.${safeKey}') REGEXP ?`)
              params.push(pattern)
              break
            default:
              throw new Error(`Unsupported operator: ${op}`)
          }
        }
      }
    }

    return { where, params }
  }

  insert(docs: any | any[]): any {
    const items = Array.isArray(docs) ? docs : [docs]
    const insertedItems: any[] = []

    // Use transaction for multiple inserts
    const insertTransaction = this.db.transaction(() => {
      for (const doc of items) {
        if (!doc._id) {
          doc._id = randomBytes(6).toString('hex')
        }

        try {
          this.insertStmt.run(doc._id, JSON.stringify(doc))
          insertedItems.push(doc)
        } catch (error) {
          console.error(`Insert failed for doc ${doc._id}:`, error)
          if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            throw new Error(`Duplicate _id: ${doc._id}`)
          }
          throw error
        }
      }
    })

    try {
      insertTransaction()
      this.emit('change', 'insert', { docs: insertedItems })
      return items.length === 1 ? items[0] : items
    } catch (error) {
      console.error('Transaction failed during insert:', error)
      throw error
    }
  }

  find(query: any = {}, options: { limit?: number; offset?: number } = {}): any[] {
    try {
      if (Object.keys(query).length === 0) {
        // No filtering - but still respect limit/offset
        let sql = `SELECT _id, data FROM ${this.tableName}`
        const params: any[] = []

        if (options.limit) {
          sql += ` LIMIT ?`
          params.push(options.limit)

          if (options.offset) {
            sql += ` OFFSET ?`
            params.push(options.offset)
          }
        }

        const stmt = this.db.prepare(sql)
        const rows = stmt.all(...params)
        return rows.map(row => JSON.parse(row.data))
      }

      // Build WHERE clause from query
      const { where, params } = this.buildWhereClause(query)
      let sql = `SELECT _id, data FROM ${this.tableName} WHERE ${where.join(' AND ')}`

      if (options.limit) {
        sql += ` LIMIT ?`
        params.push(options.limit)

        if (options.offset) {
          sql += ` OFFSET ?`
          params.push(options.offset)
        }
      }

      const stmt = this.db.prepare(sql)
      const rows = stmt.all(...params)
      return rows.map(row => JSON.parse(row.data))
    } catch (error) {
      console.error('Find query failed:', error)
      throw error
    }
  }

  findOne(query: any = {}): any {
    const results = this.find(query, { limit: 1 })
    return results.length > 0 ? results[0] : null
  }

  findById(id: string): any {
    const row = this.findByIdStmt.get(id)
    return row ? JSON.parse(row.data) : null
  }

  update(query: any, updates: any): number {
    try {
      // First find matching documents
      const matchingDocs = this.find(query)
      if (!matchingDocs.length) return 0

      // Use transaction for multiple updates
      const updateTransaction = this.db.transaction(() => {
        for (const doc of matchingDocs) {
          const updatedDoc = { ...doc, ...updates }
          this.updateStmt.run(JSON.stringify(updatedDoc), doc._id)
        }
      })

      updateTransaction()
      this.emit('change', 'update', { count: matchingDocs.length })
      return matchingDocs.length
    } catch (error) {
      console.error('Update transaction failed:', error)
      throw error
    }
  }

  delete(query: any): number {
    try {
      // First find matching documents
      const matchingDocs = this.find(query)
      if (!matchingDocs.length) return 0

      // Use transaction for multiple deletes
      const deleteTransaction = this.db.transaction(() => {
        for (const doc of matchingDocs) {
          this.deleteStmt.run(doc._id)
        }
      })

      deleteTransaction()
      this.emit('change', 'delete', { count: matchingDocs.length })
      return matchingDocs.length
    } catch (error) {
      console.error('Delete transaction failed:', error)
      throw error
    }
  }

  count(query: any = {}): number {
    try {
      if (Object.keys(query).length === 0) {
        const result = this.countAllStmt.get()
        return result.count
      }

      const { where, params } = this.buildWhereClause(query)
      const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${where.join(' AND ')}`
      const stmt = this.db.prepare(sql)
      const result = stmt.get(...params)
      return result.count
    } catch (error) {
      console.error('Count query failed:', error)
      throw error
    }
  }

  // Execute raw SQL queries with validation
  raw(sql: string, params: any[] = []): any[] {
    // Basic SQL injection protection - only allow SELECT statements
    const trimmedSQL = sql.trim().toLowerCase()
    if (!trimmedSQL.startsWith('select')) {
      throw new Error('Raw queries only support SELECT statements')
    }

    const stmt = this.db.prepare(sql)
    return stmt.all(...params)
  }

  rawGet(sql: string, params: any[] = []): any {
    const trimmedSQL = sql.trim().toLowerCase()
    if (!trimmedSQL.startsWith('select')) {
      throw new Error('Raw queries only support SELECT statements')
    }

    const stmt = this.db.prepare(sql)
    return stmt.get(...params)
  }

  // Create JSON index for specific field
  createIndex(field: string): void {
    try {
      const safeField = validateSQLName(field)
      const indexName = `idx_${this.tableName}_${safeField}`
      const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${this.tableName}(json_extract(data, '$.${safeField}'))`
      this.db.exec(sql)
    } catch (error) {
      console.error(`Failed to create index for ${field}:`, error)
      throw error
    }
  }

  // Create composite index for multiple fields
  createCompositeIndex(fields: string[], indexName?: string): void {
    try {
      const safeFields = fields.map(validateSQLName)
      const name = indexName ? validateSQLName(indexName) : `idx_${this.tableName}_${safeFields.join('_')}`
      const extracts = safeFields.map(f => `json_extract(data, '$.${f}')`).join(', ')
      const sql = `CREATE INDEX IF NOT EXISTS ${name} ON ${this.tableName}(${extracts})`
      this.db.exec(sql)
    } catch (error) {
      console.error(`Failed to create composite index:`, error)
      throw error
    }
  }

  // Get collection statistics
  getStats(): any {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as totalDocs,
        AVG(LENGTH(data)) as avgDocSize,
        MAX(LENGTH(data)) as maxDocSize,
        MIN(LENGTH(data)) as minDocSize
      FROM ${this.tableName}
    `).get()

    return {
      tableName: this.tableName,
      ...stats
    }
  }

  // Optimize collection (rebuild indexes, vacuum if needed)
  optimize(): void {
    this.db.pragma('optimize')
  }

  // Vacuum the table to reclaim space
  vacuum(): void {
    this.db.exec('VACUUM')
  }
}

export { SQLiteDB, Collection }
*/