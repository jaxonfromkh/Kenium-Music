import {
  existsSync,
  mkdirSync,
  watchFile,
  unwatchFile,
  rmSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'tseep'
import pLimit from 'p-limit'

interface SimpleDBOptions {
  dbPath?: string
  watchFiles?: boolean
  watchInterval?: number
  compressionLevel?: number
  batchSize?: number
  maxFileSize?: number
  maxDocumentsPerFile?: number
  concurrency?: number
}

interface ShardInfo {
  id: number
  filePath: string
  documentCount: number
  fileSize: number
  lastModified: Date
}

interface CollectionOptions {
  watchFiles?: boolean
  watchInterval?: number
  compressionLevel?: number
  batchSize?: number
  maxFileSize?: number
  maxDocumentsPerFile?: number
  concurrency?: number
}

const SHARD_FILE_RE = /^shard_(\d+)\.json$/

const stringifyDocs = (docs: any[], pretty: boolean) =>
  JSON.stringify(docs, null, pretty ? 2 : 0)

class SimpleDB extends EventEmitter {
  private readonly collections = new Map<string, boolean>()
  private readonly collectionInstances = new Map<string, Collection>()
  private readonly dbPath: string
  private readonly watchFiles: boolean
  private readonly watchInterval: number
  private readonly compressionLevel: number
  private readonly batchSize: number
  private readonly maxFileSize: number
  private readonly maxDocumentsPerFile: number
  private readonly concurrency: number

  constructor(options: SimpleDBOptions = {}) {
    super()
    this.dbPath = options.dbPath || join(process.cwd(), 'db')
    this.watchFiles = options.watchFiles !== false
    this.watchInterval = Math.max(options.watchInterval || 500, 100)
    this.compressionLevel = Math.max(0, Math.min(options.compressionLevel || 0, 2))
    this.batchSize = options.batchSize || 1000
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024
    this.maxDocumentsPerFile = options.maxDocumentsPerFile || 10000
    this.concurrency = options.concurrency || 10

    if (!existsSync(this.dbPath)) mkdirSync(this.dbPath, { recursive: true })
    this._init()
  }

  private _init(): void {
    const entries = readdirSync(this.dbPath, { withFileTypes: true })
    for (const dirent of entries) {
      if (dirent.isDirectory()) {
        this.collections.set(dirent.name, true)
      } else if (dirent.isFile() && dirent.name.endsWith('.json')) {
        // Legacy, top-level collection file
        const collectionName = dirent.name.slice(0, -5)
        this.collections.set(collectionName, true)
      }
    }
  }

  collection(name: string): Collection {
    const cachedCollection = this.collectionInstances.get(name)
    if (cachedCollection) return cachedCollection

    const collectionPath = join(this.dbPath, name)
    const legacyFilePath = join(this.dbPath, `${name}.json`)

    if (!this.collections.has(name) && existsSync(legacyFilePath)) {
      this._migrateLegacyCollectionSync(name, legacyFilePath, collectionPath)
    }

    if (!existsSync(collectionPath)) {
      mkdirSync(collectionPath, { recursive: true })
    }

    this.collections.set(name, true)

    const collection = new Collection(name, collectionPath, {
      watchFiles: this.watchFiles,
      watchInterval: this.watchInterval,
      compressionLevel: this.compressionLevel,
      batchSize: this.batchSize,
      maxFileSize: this.maxFileSize,
      maxDocumentsPerFile: this.maxDocumentsPerFile,
      concurrency: this.concurrency
    })

    this.collectionInstances.set(name, collection)

    collection.on('change', (eventType, data) => {
      this.emit('collectionChange', { collection: name, eventType, data })
    })

    return collection
  }

  private _migrateLegacyCollectionSync(name: string, legacyPath: string, newPath: string): void {
    try {
      mkdirSync(newPath, { recursive: true })

      const content = readFileSync(legacyPath, 'utf8')
      const docs = JSON.parse(content)

      const shardPath = join(newPath, 'shard_0.json')
      writeFileSync(shardPath, JSON.stringify(docs, null, 0))

      const metadataPath = join(newPath, 'metadata.json')
      const now = new Date().toISOString()
      const metadata = {
        totalDocuments: Array.isArray(docs) ? docs.length : 0,
        totalShards: 1,
        createdAt: now,
        lastOptimized: null as string | null
      }
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

      rmSync(legacyPath)
    } catch (error) {
      console.error(`Migration failed for ${name}:`, error)
    }
  }

  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.collectionInstances.values()).map(c => c.close())
    )
    this.collectionInstances.clear()
    this.removeAllListeners()
  }
}

class Collection extends EventEmitter {
  private readonly name: string
  private readonly collectionPath: string
  private readonly data = new Map<string, any>()
  private readonly documentToShard = new Map<string, number>()
  private readonly shards = new Map<number, ShardInfo>()
  private readonly indices = new Map<string, Map<any, Set<string>>>()
  private readonly shardData = new Map<number, Map<string, any>>()
  private readonly dirtyShards = new Set<number>()
  private readonly watchedPaths = new Set<string>()
  private readonly saveDelay = 100
  private readonly watchFiles: boolean
  private readonly watchInterval: number
  private readonly compressionLevel: number
  private readonly batchSize: number
  private readonly maxFileSize: number
  private readonly maxDocumentsPerFile: number
  private readonly metadataPath: string
  private readonly concurrency: number
  private readonly limit: <T>(fn: () => PromiseLike<T> | T) => Promise<T>
  private nextShardId = 0
  private bestShardForInsert = 0
  private closed = false
  private saving = false
  private saveTimer: NodeJS.Timeout | null = null
  private currentSavePromise: Promise<void> | null = null
  private lastOptimizedISO: string | null = null

  constructor(name: string, collectionPath: string, options: CollectionOptions = {}) {
    super()
    this.name = name
    this.collectionPath = collectionPath
    this.metadataPath = join(collectionPath, 'metadata.json')
    this.watchFiles = options.watchFiles !== false
    this.watchInterval = options.watchInterval || 500
    this.compressionLevel = options.compressionLevel || 0
    this.batchSize = options.batchSize || 1000
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024
    this.maxDocumentsPerFile = options.maxDocumentsPerFile || 10000
    this.concurrency = options.concurrency || 10
    this.limit = pLimit(this.concurrency)

    this.ensureIndex('_id')
    this._loadMetadataSync()
    this._loadAllShardsSync()

    this.bestShardForInsert = this.shards.size > 0
      ? Math.max(...Array.from(this.shards.keys()))
      : this._createNewShard()

    if (this.watchFiles) this._startWatching()
  }

  private _loadMetadataSync(): void {
    if (!existsSync(this.metadataPath)) return
    try {
      const content = readFileSync(this.metadataPath, 'utf8')
      const metadata = JSON.parse(content)
      this.nextShardId = metadata.totalShards || 0
      if (metadata?.lastOptimized) this.lastOptimizedISO = metadata.lastOptimized
    } catch (error) {
      console.error(`Metadata load error for ${this.name}:`, error)
    }
  }

  private async _saveMetadata(): Promise<void> {
    let createdAt = new Date().toISOString()
    try {
      if (existsSync(this.metadataPath)) {
        const old = JSON.parse(readFileSync(this.metadataPath, 'utf8'))
        if (old?.createdAt) createdAt = old.createdAt
      }
    } catch { /* ignore */ }

    const metadata = {
      totalDocuments: this.data.size,
      totalShards: this.shards.size,
      createdAt,
      lastOptimized: this.lastOptimizedISO,
      shards: Array.from(this.shards.values()).map(s => ({
        id: s.id,
        documentCount: s.documentCount,
        fileSize: s.fileSize,
        lastModified: s.lastModified.toISOString()
      }))
    }

    await this.atomicWrite(this.metadataPath, JSON.stringify(metadata, null, 2))
  }

  private _loadAllShardsSync(): void {
    try {
      const dirents = readdirSync(this.collectionPath, { withFileTypes: true })
      const shardFiles = dirents
        .filter(d => d.isFile() && SHARD_FILE_RE.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
          const ai = parseInt(a.match(SHARD_FILE_RE)![1], 10)
          const bi = parseInt(b.match(SHARD_FILE_RE)![1], 10)
          return ai - bi
        })

      if (!shardFiles.length) {
        this._createNewShard()
        return
      }

      for (const file of shardFiles) {
        const shardId = parseInt(file.match(SHARD_FILE_RE)![1], 10)
        this._loadShardSync(shardId)
      }

      this.nextShardId = Math.max(...Array.from(this.shards.keys()), -1) + 1
    } catch (error) {
      console.error(`Shard load error for ${this.name}:`, error)
      this._createNewShard()
    }
  }

  private _loadShardSync(shardId: number): void {
    const shardPath = join(this.collectionPath, `shard_${shardId}.json`)
    if (!existsSync(shardPath)) return

    try {
      const content = readFileSync(shardPath, 'utf8')
      const stats = statSync(shardPath)
      const docs = JSON.parse(content)

      const info: ShardInfo = {
        id: shardId,
        filePath: shardPath,
        documentCount: Array.isArray(docs) ? docs.length : 0,
        fileSize: stats.size,
        lastModified: stats.mtime
      }
      this.shards.set(shardId, info)

      const shardDataMap = new Map<string, any>()
      if (Array.isArray(docs)) {
        for (const doc of docs) {
          if (!doc || !doc._id) continue

          this.data.set(doc._id, doc)
          this.documentToShard.set(doc._id, shardId)
          shardDataMap.set(doc._id, doc)

          for (const [field, indexMap] of this.indices) {
            const value = doc[field]
            if (value === undefined) continue

            let valueSet = indexMap.get(value)
            if (!valueSet) {
              valueSet = new Set()
              indexMap.set(value, valueSet)
            }
            valueSet.add(doc._id)
          }
        }
      }

      this.shardData.set(shardId, shardDataMap)
    } catch (error) {
      console.error(`Shard ${shardId} load error:`, error)
    }
  }

  private _createNewShard(): number {
    const shardId = this.nextShardId++
    const shardPath = join(this.collectionPath, `shard_${shardId}.json`)

    writeFileSync(shardPath, '[]')

    const info: ShardInfo = {
      id: shardId,
      filePath: shardPath,
      documentCount: 0,
      fileSize: 2,
      lastModified: new Date()
    }

    this.shards.set(shardId, info)
    this.shardData.set(shardId, new Map())

    this._watchShard(info)
    return shardId
  }

  private _approxShardDocCount(shardId: number, fallback: number): number {
    const m = this.shardData.get(shardId)
    return m ? m.size : fallback
  }

  private _findBestShardForInsert(): number {
    const candidate = this.bestShardForInsert
    const shardInfo = this.shards.get(candidate)

    const fits = (info: ShardInfo) => {
      const currentCount = this._approxShardDocCount(info.id, info.documentCount)
      return currentCount < this.maxDocumentsPerFile && info.fileSize < this.maxFileSize
    }

    if (shardInfo && fits(shardInfo)) return candidate

    for (const info of this.shards.values()) {
      if (fits(info)) {
        this.bestShardForInsert = info.id
        return info.id
      }
    }

    const newShardId = this._createNewShard()
    this.bestShardForInsert = newShardId
    return newShardId
  }

  private async atomicWrite(filePath: string, data: string): Promise<void> {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await this.limit(() => fsp.writeFile(tmp, data))
    await this.limit(() => fsp.rename(tmp, filePath))
  }

  private async _saveShardAsync(shardId: number): Promise<void> {
    const shardInfo = this.shards.get(shardId)
    const shardDataMap = this.shardData.get(shardId)
    if (!shardInfo || !shardDataMap) return

    const docs = Array.from(shardDataMap.values())
    const content = stringifyDocs(docs, this.compressionLevel === 0)

    await this.atomicWrite(shardInfo.filePath, content)

    shardInfo.documentCount = docs.length
    shardInfo.fileSize = Buffer.byteLength(content, 'utf8')
    shardInfo.lastModified = new Date()
  }

  private _saveShardSync(shardId: number): void {
    const shardInfo = this.shards.get(shardId)
    const shardDataMap = this.shardData.get(shardId)
    if (!shardInfo || !shardDataMap) return

    const docs = Array.from(shardDataMap.values())
    const content = stringifyDocs(docs, this.compressionLevel === 0)

    writeFileSync(shardInfo.filePath, content)

    shardInfo.documentCount = docs.length
    shardInfo.fileSize = Buffer.byteLength(content, 'utf8')
    shardInfo.lastModified = new Date()
  }

  private _queueSaveOperation(): void {
    if (this.closed || this.saving) return

    if (this.saveTimer) clearTimeout(this.saveTimer)

    this.saveTimer = setTimeout(() => {
      if (!this.dirtyShards.size) return

      this.saving = true
      const dirty = Array.from(this.dirtyShards)
      this.dirtyShards.clear()
      this.saveTimer = null

      this.currentSavePromise = (async () => {
        try {
          await Promise.all(dirty.map(id => this.limit(() => this._saveShardAsync(id))))
          await this._saveMetadata()
        } catch (err) {
          console.error('Save error:', err)
          dirty.forEach(id => this.dirtyShards.add(id)) // retry later
        } finally {
          this.saving = false
          this.currentSavePromise = null
          if (this.dirtyShards.size) this._queueSaveOperation()
        }
      })()
    }, this.saveDelay)
  }

  private _watchShard(shardInfo: ShardInfo): void {
    if (!this.watchFiles) return
    if (this.watchedPaths.has(shardInfo.filePath)) return

    watchFile(shardInfo.filePath, { interval: this.watchInterval }, (curr) => {
      if (curr.mtime > shardInfo.lastModified && !this.dirtyShards.has(shardInfo.id)) {
        this._reloadShard(shardInfo.id)
      }
    })
    this.watchedPaths.add(shardInfo.filePath)
  }

  private _unwatchPath(path: string): void {
    if (this.watchedPaths.delete(path)) {
      unwatchFile(path)
    }
  }

  private _startWatching(): void {
    for (const shardInfo of this.shards.values()) {
      this._watchShard(shardInfo)
    }
  }

  private _stopWatching(): void {
    for (const p of Array.from(this.watchedPaths)) {
      unwatchFile(p)
    }
    this.watchedPaths.clear()
  }

  private _reloadShard(shardId: number): void {
    const shardDataMap = this.shardData.get(shardId)
    if (!shardDataMap) return

    // Remove existing docs from global maps and indices
    for (const [docId, doc] of shardDataMap) {
      this.data.delete(docId)
      this.documentToShard.delete(docId)

      for (const [field, indexMap] of this.indices) {
        const value = doc[field]
        if (value === undefined) continue

        const valueSet = indexMap.get(value)
        if (valueSet) {
          valueSet.delete(docId)
          if (!valueSet.size) indexMap.delete(value)
        }
      }
    }

    shardDataMap.clear()
    this._loadShardSync(shardId)
    this.emit('change', 'reload', { shard: shardId })
  }

  ensureIndex(field: string): void {
    if (this.indices.has(field)) return

    const indexMap = new Map<any, Set<string>>()

    for (const doc of this.data.values()) {
      const value = doc[field]
      if (value === undefined) continue

      let valueSet = indexMap.get(value)
      if (!valueSet) {
        valueSet = new Set()
        indexMap.set(value, valueSet)
      }
      valueSet.add(doc._id)
    }

    this.indices.set(field, indexMap)
  }

  insert(docs: any | any[]): any {
    const items = Array.isArray(docs) ? docs : [docs]
    const insertedItems: any[] = []

    for (const doc of items) {
      if (!doc._id) doc._id = randomBytes(6).toString('hex')
      if (this.data.has(doc._id)) throw new Error(`Duplicate _id: ${doc._id}`)

      const shardId = this._findBestShardForInsert()
      const shardDataMap = this.shardData.get(shardId)!
      this.data.set(doc._id, doc)
      this.documentToShard.set(doc._id, shardId)
      shardDataMap.set(doc._id, doc)

      for (const [field, indexMap] of this.indices) {
        const value = doc[field]
        if (value === undefined) continue

        let valueSet = indexMap.get(value)
        if (!valueSet) {
          valueSet = new Set()
          indexMap.set(value, valueSet)
        }
        valueSet.add(doc._id)
      }

      insertedItems.push(doc)
      this.dirtyShards.add(shardId)
    }

    this._queueSaveOperation()
    this.emit('change', 'insert', { docs: insertedItems })

    return items.length === 1 ? insertedItems[0] : insertedItems
  }

  private _normalizeQuery(query: any): any {
    const q: any = {}
    for (const [k, v] of Object.entries(query)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const nv: any = {}
        for (const [op, val] of Object.entries(v as any)) {
          if (op === '$regex') {
            const opts = (v as any).$options || ''
            nv.$regex = val instanceof RegExp ? val : new RegExp(val as any, opts)
          } else if (op === '$in' || op === '$nin') {
            const arr = Array.isArray(val) ? val : []
            nv[op] = arr
            nv[op + 'Set'] = new Set(arr)
          } else if (op === '$options') {
            // handled via $regex
          } else {
            nv[op] = val
          }
        }
        q[k] = nv
      } else {
        q[k] = v
      }
    }
    return q
  }

  private _matchDocument(doc: any, query: any): boolean {
    for (const key in query) {
      const docValue = doc[key]
      const queryValue = query[key]

      if (typeof queryValue !== 'object' || queryValue === null || queryValue instanceof RegExp) {
        if (docValue !== queryValue) return false
        continue
      }

      for (const op in queryValue) {
        const val = (queryValue as any)[op]
        switch (op) {
          case '$gt': if (!(docValue >  val)) return false; break
          case '$gte': if (!(docValue >= val)) return false; break
          case '$lt': if (!(docValue <  val)) return false; break
          case '$lte': if (!(docValue <= val)) return false; break
          case '$ne': if (docValue === val) return false; break
          case '$in': {
            const s: Set<any> = (queryValue as any).$inSet || new Set(val)
            if (!s.has(docValue)) return false
            break
          }
          case '$nin': {
            const s: Set<any> = (queryValue as any).$ninSet || new Set(val)
            if (s.has(docValue)) return false
            break
          }
          case '$regex': {
            const re: RegExp = (queryValue as any).$regex
            if (typeof docValue !== 'string' || !re.test(docValue)) return false
            break
          }
          case '$options': break
          default: return false
        }
      }
    }
    return true
  }

  private _findByIndex(field: string, value: any): any[] {
    this.ensureIndex(field)
    const indexMap = this.indices.get(field)
    if (!indexMap?.has(value)) return []
    const ids = indexMap.get(value)!
    return Array.from(ids, id => this.data.get(id)!).filter(Boolean)
  }

  find(query: any = {}): any[] {
    const keys = Object.keys(query)
    if (!keys.length) return Array.from(this.data.values())

    // Single-field equality
    if (keys.length === 1) {
      const [field, value] = Object.entries(query)[0]
      if (typeof value !== 'object' || value === null) {
        return this._findByIndex(field, value)
      }
      // Single-field $in -> union of index sets
      if (value && typeof value === 'object' && '$in' in (value as any) && Array.isArray((value as any).$in)) {
        this.ensureIndex(field)
        const indexMap = this.indices.get(field)
        if (!indexMap) return []
        const resultIds = new Set<string>()
        for (const val of (value as any).$in) {
          const s = indexMap.get(val)
          if (s) for (const id of s) resultIds.add(id)
        }
        return Array.from(resultIds, id => this.data.get(id)!).filter(Boolean)
      }
    }

    const normalized = this._normalizeQuery(query)
    const out: any[] = []
    for (const doc of this.data.values()) {
      if (this._matchDocument(doc, normalized)) out.push(doc)
    }
    return out
  }

  findOne(query: any = {}): any {
    const keys = Object.keys(query)
    if (!keys.length) return this.data.values().next().value || null

    if (keys.length === 1) {
      const [field, value] = Object.entries(query)[0]
      if (typeof value !== 'object' || value === null) {
        const results = this._findByIndex(field, value)
        return results[0] || null
      }
    }

    const normalized = this._normalizeQuery(query)
    for (const doc of this.data.values()) {
      if (this._matchDocument(doc, normalized)) return doc
    }
    return null
  }

  findById(id: string): any {
    return this.data.get(id) || null
  }

  update(query: any, updates: any): number {
    const matchingDocs = this.find(query)
    if (!matchingDocs.length) return 0

    const updatedDocs: any[] = []
    const updatedShards = new Set<number>()

    for (const doc of matchingDocs) {
      if ('_id' in updates && updates._id !== doc._id) {
        throw new Error('Cannot update _id of an existing document.')
      }

      const oldDoc = { ...doc }
      Object.assign(doc, updates)

      const shardId = this.documentToShard.get(doc._id)!
      const shardDataMap = this.shardData.get(shardId)!
      shardDataMap.set(doc._id, doc)

      updatedDocs.push({ old: oldDoc, new: doc })
      updatedShards.add(shardId)

      const updateKeys = Object.keys(updates)
      for (const field of updateKeys) {
        const indexMap = this.indices.get(field)
        if (!indexMap) continue

        const oldVal = oldDoc[field]
        const newVal = doc[field]

        if (oldVal !== newVal) {
          if (oldVal !== undefined) {
            const oldSet = indexMap.get(oldVal)
            if (oldSet) {
              oldSet.delete(doc._id)
              if (!oldSet.size) indexMap.delete(oldVal)
            }
          }

          if (newVal !== undefined) {
            let newSet = indexMap.get(newVal)
            if (!newSet) {
              newSet = new Set()
              indexMap.set(newVal, newSet)
            }
            newSet.add(doc._id)
          }
        }
      }
    }

    updatedShards.forEach(shardId => this.dirtyShards.add(shardId))
    this._queueSaveOperation()
    this.emit('change', 'update', { docs: updatedDocs, count: matchingDocs.length })

    return matchingDocs.length
  }

  delete(query: any): number {
    const matchingDocs = this.find(query)
    if (!matchingDocs.length) return 0

    const deletedDocs: any[] = []
    const deletedShards = new Set<number>()

    for (const doc of matchingDocs) {
      const shardId = this.documentToShard.get(doc._id)!
      const shardDataMap = this.shardData.get(shardId)!

      this.data.delete(doc._id)
      this.documentToShard.delete(doc._id)
      shardDataMap.delete(doc._id)

      deletedDocs.push(doc)
      deletedShards.add(shardId)

      for (const [field, indexMap] of this.indices) {
        const value = doc[field]
        if (value === undefined) continue

        const valueSet = indexMap.get(value)
        if (valueSet) {
          valueSet.delete(doc._id)
          if (!valueSet.size) indexMap.delete(value)
        }
      }
    }

    deletedShards.forEach(shardId => this.dirtyShards.add(shardId))
    this._queueSaveOperation()
    this.emit('change', 'delete', { docs: deletedDocs, count: matchingDocs.length })

    return matchingDocs.length
  }

  count(query: any = {}): number {
    return Object.keys(query).length
      ? this.find(query).length
      : this.data.size
  }

  createIndex(field: string): void {
    this.ensureIndex(field)
  }

  async optimize(): Promise<void> {
    const allDocs = Array.from(this.data.values())
    const shardsNeeded = Math.max(1, Math.ceil(allDocs.length / this.maxDocumentsPerFile))
    const optimalShardSize = Math.ceil(allDocs.length / shardsNeeded)

    for (const shardId of this.shards.keys()) {
      this.shardData.get(shardId)?.clear()
    }
    this.documentToShard.clear()

    let currentShardId = 0
    let currentShardSize = 0
    if (!this.shards.has(0)) this._createNewShard()

    for (const doc of allDocs) {
      if (currentShardSize >= optimalShardSize) {
        currentShardId++
        currentShardSize = 0
        if (!this.shards.has(currentShardId)) this._createNewShard()
      }

      const shardDataMap = this.shardData.get(currentShardId)!
      shardDataMap.set(doc._id, doc)
      this.documentToShard.set(doc._id, currentShardId)
      currentShardSize++
    }

    // Remove empty shards and unwatch them
    for (const [shardId, info] of Array.from(this.shards.entries())) {
      if (!this.shardData.get(shardId)?.size) {
        this._unwatchPath(info.filePath)
        rmSync(info.filePath, { force: true })
        this.shards.delete(shardId)
        this.shardData.delete(shardId)
      }
    }

    for (const shardId of this.shardData.keys()) {
      this.dirtyShards.add(shardId)
    }

    this.bestShardForInsert = Math.max(...Array.from(this.shards.keys()))
    this.lastOptimizedISO = new Date().toISOString()
    this._queueSaveOperation()
  }

  getStats(): any {
    return {
      documents: this.data.size,
      shards: this.shards.size,
      indices: this.indices.size,
      shardsInfo: Array.from(this.shards.values()).map(shard => ({
        id: shard.id,
        documents: shard.documentCount,
        fileSize: shard.fileSize,
        filePath: shard.filePath
      })),
      isDirty: !!this.dirtyShards.size
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this._stopWatching()

    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }

    if (this.currentSavePromise) {
      try { await this.currentSavePromise } catch { /* ignore */ }
    }

    if (this.dirtyShards.size) {
      for (const shardId of this.dirtyShards) {
        this._saveShardSync(shardId)
      }
      await this._saveMetadata()
      this.dirtyShards.clear()
    }

    this.removeAllListeners()
  }
}

export { SimpleDB, Collection }