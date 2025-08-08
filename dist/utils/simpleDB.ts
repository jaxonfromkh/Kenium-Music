import { existsSync, mkdirSync, watchFile, unwatchFile, rmSync } from 'node:fs'
import { readFileSync, statSync, writeFileSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import { EventEmitter } from 'tseep'
import fg from 'fast-glob'
import pLimit from 'p-limit'

const fileLimit = pLimit(10)

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

const compactStringify = (obj: any): string => {
  return JSON.stringify(obj, (_, value) => {
    if (value === undefined) return
    if (Array.isArray(value) && !value.length) return
    if (typeof value === 'object' && value !== null && !Object.keys(value).length) return
    return value
  })
}

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
    this.maxFileSize = options.maxFileSize || 5242880
    this.maxDocumentsPerFile = options.maxDocumentsPerFile || 10000
    this.concurrency = options.concurrency || 10

    if (!existsSync(this.dbPath)) mkdirSync(this.dbPath, { recursive: true })
    this._init()
  }

  private _init(): void {
    const entries = fg.sync(['**/*.json', '*/'], {
      cwd: this.dbPath,
      onlyFiles: false,
      absolute: false,
      objectMode: true
    })

    for (const entry of entries) {
      if (entry.dirent.isDirectory()) {
        this.collections.set(entry.name, true)
      } else if (entry.name.endsWith('.json')) {
        const collectionName = entry.name.slice(0, -5)
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
      this._migrateLegacyCollection(name, legacyFilePath, collectionPath)
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

  private async _migrateLegacyCollection(name: string, legacyPath: string, newPath: string): Promise<void> {
    try {
      mkdirSync(newPath, { recursive: true })

      const content = await fs.readFile(legacyPath, 'utf8')
      const docs = JSON.parse(content)

      const shardPath = join(newPath, 'shard_0.json')
      await fs.writeFile(shardPath, JSON.stringify(docs, null, 2))

      const metadataPath = join(newPath, 'metadata.json')
      const metadata = {
        totalDocuments: docs.length,
        totalShards: 1,
        createdAt: new Date().toISOString(),
        lastOptimized: new Date().toISOString()
      }
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))

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
  private readonly saveDelay = 100
  private readonly watchFiles: boolean
  private readonly watchInterval: number
  private readonly compressionLevel: number
  private readonly batchSize: number
  private readonly maxFileSize: number
  private readonly maxDocumentsPerFile: number
  private readonly metadataPath: string
  private readonly concurrency: number
  private nextShardId = 0
  private bestShardForInsert = 0
  private closed = false
  private saving = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor(name: string, collectionPath: string, options: CollectionOptions = {}) {
    super()
    this.name = name
    this.collectionPath = collectionPath
    this.metadataPath = join(collectionPath, 'metadata.json')
    this.watchFiles = options.watchFiles !== false
    this.watchInterval = options.watchInterval || 500
    this.compressionLevel = options.compressionLevel || 0
    this.batchSize = options.batchSize || 1000
    this.maxFileSize = options.maxFileSize || 5242880
    this.maxDocumentsPerFile = options.maxDocumentsPerFile || 10000
    this.concurrency = options.concurrency || 10

    this.ensureIndex('_id')
    this._loadMetadataSync()
    this._loadAllShardsSync()

    this.bestShardForInsert = this.shards.size > 0
      ? Math.max(...Array.from(this.shards.keys()))
      : this._createNewShard()

    if (this.watchFiles) this._startWatching()
  }

  private _loadMetadataSync(): void {
    if (!existsSync(this.metadataPath)) return;

    try {
      const content = readFileSync(this.metadataPath, 'utf8')
      const metadata = JSON.parse(content)
      this.nextShardId = metadata.totalShards || 0
    } catch (error) {
      console.error(`Metadata load error for ${this.name}:`, error)
    }
  }

  private async _saveMetadata(): Promise<void> {
    const metadata = {
      totalDocuments: this.data.size,
      totalShards: this.shards.size,
      createdAt: new Date().toISOString(),
      lastOptimized: new Date().toISOString(),
      shards: Array.from(this.shards.entries()).map(([id, info]) => ({
        id,
        documentCount: info.documentCount,
        fileSize: info.fileSize,
        lastModified: info.lastModified.toISOString()
      }))
    }

    await fileLimit(() => fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2)))
  }

  private _loadAllShardsSync(): void {
    try {
      const shardFiles = fg.sync('shard_*.json', {
        cwd: this.collectionPath,
        absolute: false,
        onlyFiles: true
      })

      if (!shardFiles.length) {
        this._createNewShard()
        return;
      }

      const shardIdPattern = /^shard_(\d+)\.json$/
      for (const file of shardFiles) {
        const match = file.match(shardIdPattern)
        if (match) {
          const shardId = parseInt(match[1], 10)
          this._loadShardSync(shardId)
        }
      }

      this.nextShardId = Math.max(...Array.from(this.shards.keys()), -1) + 1
    } catch (error) {
      console.error(`Shard load error for ${this.name}:`, error)
      this._createNewShard()
    }
  }

  private _loadShardSync(shardId: number): void {
    const shardPath = join(this.collectionPath, `shard_${shardId}.json`)
    if (!existsSync(shardPath)) return;

    try {
      const content = readFileSync(shardPath, 'utf8')
      const stats = statSync(shardPath)
      const docs = JSON.parse(content)

      this.shards.set(shardId, {
        id: shardId,
        filePath: shardPath,
        documentCount: docs.length,
        fileSize: stats.size,
        lastModified: stats.mtime
      })

      const shardDataMap = new Map<string, any>()
      for (const doc of docs) {
        if (!doc._id) continue

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

      this.shardData.set(shardId, shardDataMap)
    } catch (error) {
      console.error(`Shard ${shardId} load error:`, error)
    }
  }

  private _createNewShard(): number {
    const shardId = this.nextShardId++
    const shardPath = join(this.collectionPath, `shard_${shardId}.json`)

    writeFileSync(shardPath, '[]')

    this.shards.set(shardId, {
      id: shardId,
      filePath: shardPath,
      documentCount: 0,
      fileSize: 2,
      lastModified: new Date()
    })

    this.shardData.set(shardId, new Map())

    return shardId
  }

  private _findBestShardForInsert(): number {
    const candidate = this.bestShardForInsert
    const shardInfo = this.shards.get(candidate)

    if (shardInfo &&
      shardInfo.documentCount < this.maxDocumentsPerFile &&
      shardInfo.fileSize < this.maxFileSize) {
      return candidate
    }

    for (const [shardId, info] of this.shards) {
      if (info.documentCount < this.maxDocumentsPerFile && info.fileSize < this.maxFileSize) {
        this.bestShardForInsert = shardId
        return shardId
      }
    }

    const newShardId = this._createNewShard()
    this.bestShardForInsert = newShardId
    return newShardId
  }

  private async _saveShardAsync(shardId: number): Promise<void> {
    const shardInfo = this.shards.get(shardId)
    const shardDataMap = this.shardData.get(shardId)
    if (!shardInfo || !shardDataMap) return;

    const docs = Array.from(shardDataMap.values())
    const content = this.compressionLevel > 0
      ? compactStringify(docs)
      : JSON.stringify(docs, null, 2)

    await fileLimit(() => fs.writeFile(shardInfo.filePath, content))

    shardInfo.documentCount = docs.length
    shardInfo.fileSize = Buffer.byteLength(content, 'utf8')
    shardInfo.lastModified = new Date()
  }

  private _saveShardSync(shardId: number): void {
    const shardInfo = this.shards.get(shardId)
    const shardDataMap = this.shardData.get(shardId)
    if (!shardInfo || !shardDataMap) return;

    const docs = Array.from(shardDataMap.values())
    const content = this.compressionLevel > 0
      ? compactStringify(docs)
      : JSON.stringify(docs, null, 2)

    writeFileSync(shardInfo.filePath, content)

    shardInfo.documentCount = docs.length
    shardInfo.fileSize = Buffer.byteLength(content, 'utf8')
    shardInfo.lastModified = new Date()
  }

  private _queueSaveOperation(): void {
    if (this.closed || this.saving) return;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(async () => {
      if (!this.dirtyShards.size) return;

      this.saving = true
      const dirtyShards = new Set(this.dirtyShards)
      this.dirtyShards.clear()
      this.saveTimer = null

      try {
        const limit = pLimit(this.concurrency)
        await Promise.all(
          Array.from(dirtyShards).map(shardId =>
            limit(() => this._saveShardAsync(shardId))
          ))
        await this._saveMetadata()
      } catch (error) {
        console.error('Save error:', error)
        dirtyShards.forEach(shardId => this.dirtyShards.add(shardId))
      } finally {
        this.saving = false

        if (this.dirtyShards.size) {
          this._queueSaveOperation()
        }
      }
    }, this.saveDelay)
  }

  private _startWatching(): void {
    for (const shardInfo of this.shards.values()) {
      watchFile(shardInfo.filePath, { interval: this.watchInterval }, (curr, prev) => {
        if (curr.mtime > shardInfo.lastModified && !this.dirtyShards.has(shardInfo.id)) {
          this._reloadShard(shardInfo.id)
        }
      })
    }
  }

  private _stopWatching(): void {
    for (const shardInfo of this.shards.values()) {
      unwatchFile(shardInfo.filePath)
    }
  }

  private _reloadShard(shardId: number): void {
    const shardDataMap = this.shardData.get(shardId)
    if (!shardDataMap) return;

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
    if (this.indices.has(field)) return;

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

    return items.length === 1 ? items[0] : items
  }

  find(query: any = {}): any[] {
    const queryKeys = Object.keys(query)
    if (!queryKeys.length) return Array.from(this.data.values())

    if (queryKeys.length === 1) {
      const [field, value] = Object.entries(query)[0]
      if (typeof value !== 'object' || value === null) {
        return this._findByIndex(field, value)
      }
    }

    return Array.from(this.data.values()).filter(doc => this._matchDocument(doc, query))
  }

  private _findByIndex(field: string, value: any): any[] {
    this.ensureIndex(field)
    const indexMap = this.indices.get(field)
    if (!indexMap?.has(value)) return []

    const ids = indexMap.get(value)!
    return Array.from(ids, id => this.data.get(id)!).filter(Boolean)
  }

  findOne(query: any = {}): any {
    const queryKeys = Object.keys(query)
    if (!queryKeys.length) return this.data.values().next().value || null

    if (queryKeys.length === 1) {
      const [field, value] = Object.entries(query)[0]
      if (typeof value !== 'object' || value === null) {
        const results = this._findByIndex(field, value)
        return results[0] || null
      }
    }

    for (const doc of this.data.values()) {
      if (this._matchDocument(doc, query)) return doc
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

  private _matchDocument(doc: any, query: any): boolean {
    for (const key in query) {
      const docValue = doc[key]
      const queryValue = query[key]

      if (typeof queryValue !== 'object' || queryValue === null) {
        if (docValue !== queryValue) return false
      } else {
        for (const op in queryValue) {
          const val = queryValue[op]
          switch (op) {
            case '$gt': if (docValue <= val) return false; break
            case '$gte': if (docValue < val) return false; break
            case '$lt': if (docValue >= val) return false; break
            case '$lte': if (docValue > val) return false; break
            case '$ne': if (docValue === val) return false; break
            case '$in': if (!Array.isArray(val) || !val.includes(docValue)) return false; break
            case '$nin': if (Array.isArray(val) && val.includes(docValue)) return false; break
            case '$regex':
              if (typeof docValue !== 'string') return false
              if (!new RegExp(val, queryValue.$options || '').test(docValue)) return false
              break
            default: return false
          }
        }
      }
    }
    return true
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
    const optimalShardSize = Math.ceil(allDocs.length / Math.max(1, Math.ceil(allDocs.length / this.maxDocumentsPerFile)))

    for (const shardId of this.shards.keys()) {
      this.shardData.get(shardId)?.clear()
    }
    this.documentToShard.clear()

    let currentShardId = 0
    let currentShardSize = 0

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

    for (const [shardId, shardInfo] of this.shards) {
      if (!this.shardData.get(shardId)?.size) {
        rmSync(shardInfo.filePath, { force: true })
        this.shards.delete(shardId)
        this.shardData.delete(shardId)
      }
    }

    for (const shardId of this.shardData.keys()) {
      this.dirtyShards.add(shardId)
    }
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