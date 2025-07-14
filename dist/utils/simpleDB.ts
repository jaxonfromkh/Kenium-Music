import { existsSync, mkdirSync, writeFileSync, readFileSync, watchFile, unwatchFile, Stats, readdirSync, statSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import fg from 'fast-glob';
import { EventEmitter } from 'tseep';

interface SimpleDBOptions {
  dbPath?: string;
  watchFiles?: boolean;
  watchInterval?: number;
  compressionLevel?: number;
  batchSize?: number;
  maxFileSize?: number; // Max file size in bytes
  maxDocumentsPerFile?: number; // Max documents per file
}

// Object pool for reusing objects
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 10) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  get(): T {
    return this.pool.pop() || this.createFn();
  }

  release(obj: T) {
    this.resetFn(obj);
    if (this.pool.length < 100) {
      this.pool.push(obj);
    }
  }
}

// Shard information
interface ShardInfo {
  id: number;
  filePath: string;
  documentCount: number;
  fileSize: number;
  lastModified: Date;
}

// Compact JSON serialization
const compactStringify = (obj: any): string => {
  return JSON.stringify(obj, (key, value) => {
    if (value === undefined) return;
    if (Array.isArray(value) && value.length === 0) return;
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return;
    return value;
  });
};

// Calculate file size estimation
const estimateSize = (obj: any): number => {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
};

class SimpleDB extends EventEmitter {
  private collections = new Map<string, boolean>();
  private collectionInstances = new Map<string, Collection>();
  private dbPath: string;
  private initPromise: Promise<SimpleDB>;
  private watchFiles: boolean;
  private watchInterval: number;
  private compressionLevel: number;
  private batchSize: number;
  private maxFileSize: number;
  private maxDocumentsPerFile: number;

  constructor(options: SimpleDBOptions = {}) {
    super();
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.watchFiles = options.watchFiles !== false;
    this.watchInterval = Math.max(options.watchInterval || 500, 100);
    this.compressionLevel = Math.max(0, Math.min(options.compressionLevel || 0, 2));
    this.batchSize = options.batchSize || 1000;
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB default
    this.maxDocumentsPerFile = options.maxDocumentsPerFile || 10000; // 10k docs default
    
    !existsSync(this.dbPath) && mkdirSync(this.dbPath, { recursive: true });
    this.initPromise = this.init();
  }

  async init(): Promise<SimpleDB> {
    const entries = readdirSync(this.dbPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Collection folder
        this.collections.set(entry.name, true);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // Legacy single file collection
        const collectionName = entry.name.replace(/\.json$/, '');
        this.collections.set(collectionName, true);
      }
    }
    
    return this;
  }

  collection(name: string): Collection {
    let collection = this.collectionInstances.get(name);
    if (collection) return collection;

    const collectionPath = join(this.dbPath, name);
    const legacyFilePath = join(this.dbPath, `${name}.json`);
    
    // Check for legacy file and migrate if needed
    if (!this.collections.has(name) && existsSync(legacyFilePath)) {
      this.migrateLegacyCollection(name, legacyFilePath, collectionPath);
    }
    
    // Ensure collection directory exists
    if (!existsSync(collectionPath)) {
      mkdirSync(collectionPath, { recursive: true });
    }
    
    this.collections.set(name, true);

    collection = new Collection(name, collectionPath, {
      watchFiles: this.watchFiles,
      watchInterval: this.watchInterval,
      compressionLevel: this.compressionLevel,
      batchSize: this.batchSize,
      maxFileSize: this.maxFileSize,
      maxDocumentsPerFile: this.maxDocumentsPerFile
    });
    
    this.collectionInstances.set(name, collection);
    
    // Forward collection events with debouncing
    let changeTimeout: NodeJS.Timeout;
    collection.on('change', (eventType, data) => {
      clearTimeout(changeTimeout);
      changeTimeout = setTimeout(() => {
        this.emit('collectionChange', { collection: name, eventType, data });
      }, 10);
    });
    
    return collection;
  }

  private migrateLegacyCollection(name: string, legacyPath: string, newPath: string): void {
    try {
      console.log(`Migrating legacy collection: ${name}`);
      mkdirSync(newPath, { recursive: true });
      
      const content = readFileSync(legacyPath, 'utf8');
      const docs = JSON.parse(content);
      
      // Create initial shard
      const shardPath = join(newPath, 'shard_0.json');
      writeFileSync(shardPath, JSON.stringify(docs, null, 2), 'utf8');
      
      // Create metadata
      const metadataPath = join(newPath, 'metadata.json');
      const metadata = {
        totalDocuments: docs.length,
        totalShards: 1,
        createdAt: new Date().toISOString(),
        lastOptimized: new Date().toISOString()
      };
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      
      // Remove legacy file
      rmSync(legacyPath);
      console.log(`Migration completed for: ${name}`);
    } catch (error) {
      console.error(`Failed to migrate collection ${name}:`, error);
    }
  }

  close(): void {
    this.collectionInstances.forEach(collection => collection.close());
    this.collectionInstances.clear();
    this.removeAllListeners();
  }
}

interface CollectionOptions {
  watchFiles?: boolean;
  watchInterval?: number;
  compressionLevel?: number;
  batchSize?: number;
  maxFileSize?: number;
  maxDocumentsPerFile?: number;
}

class Collection extends EventEmitter {
  private readonly name: string;
  private readonly collectionPath: string;
  private readonly data = new Map<string, any>();
  private readonly documentToShard = new Map<string, number>(); // Track which shard each document is in
  private readonly shards = new Map<number, ShardInfo>();
  private readonly indices = new Map<string, Map<any, Set<string>>>();
  private readonly shardData = new Map<number, Map<string, any>>(); // In-memory shard data
  private readonly watchedFiles = new Set<string>();
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly saveDelay = 100;
  private readonly watchFiles: boolean;
  private readonly watchInterval: number;
  private readonly compressionLevel: number;
  private readonly batchSize: number;
  private readonly maxFileSize: number;
  private readonly maxDocumentsPerFile: number;
  private readonly metadataPath: string;
  private nextShardId = 0;

  constructor(name: string, collectionPath: string, options: CollectionOptions = {}) {
    super();
    this.name = name;
    this.collectionPath = collectionPath;
    this.metadataPath = join(collectionPath, 'metadata.json');
    this.watchFiles = options.watchFiles !== false;
    this.watchInterval = options.watchInterval || 500;
    this.compressionLevel = options.compressionLevel || 0;
    this.batchSize = options.batchSize || 1000;
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024;
    this.maxDocumentsPerFile = options.maxDocumentsPerFile || 10000;
    
    this.ensureIndex('_id');
    this.loadMetadata();
    this.loadAllShards();
    
    if (this.watchFiles) {
      this.startWatching();
    }
  }

  private loadMetadata(): void {
    try {
      if (existsSync(this.metadataPath)) {
        const content = readFileSync(this.metadataPath, 'utf8');
        const metadata = JSON.parse(content);
        this.nextShardId = metadata.totalShards || 0;
      }
    } catch (error) {
      console.error(`Error loading metadata for ${this.name}:`, error);
    }
  }

  private saveMetadata(): void {
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
    };
    
    writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  private loadAllShards(): void {
    try {
      const files = readdirSync(this.collectionPath);
      const shardFiles = files.filter(f => f.startsWith('shard_') && f.endsWith('.json'))
        .sort((a, b) => {
          const aNum = parseInt(a.replace('shard_', '').replace('.json', ''));
          const bNum = parseInt(b.replace('shard_', '').replace('.json', ''));
          return aNum - bNum;
        });

      for (const file of shardFiles) {
        const shardId = parseInt(file.replace('shard_', '').replace('.json', ''));
        this.loadShard(shardId);
      }

      if (this.shards.size === 0) {
        // Create initial shard
        this.createNewShard();
      }

      this.nextShardId = Math.max(...Array.from(this.shards.keys()), -1) + 1;
    } catch (error) {
      console.error(`Error loading shards for ${this.name}:`, error);
      this.createNewShard();
    }
  }

  private loadShard(shardId: number): void {
    const shardPath = join(this.collectionPath, `shard_${shardId}.json`);
    
    if (!existsSync(shardPath)) return;

    try {
      const content = readFileSync(shardPath, 'utf8');
      const stats = statSync(shardPath);
      const docs = JSON.parse(content);
      
      // Store shard info
      this.shards.set(shardId, {
        id: shardId,
        filePath: shardPath,
        documentCount: docs.length,
        fileSize: stats.size,
        lastModified: stats.mtime
      });

      // Load documents into memory
      const shardDataMap = new Map<string, any>();
      for (const doc of docs) {
        if (doc._id) {
          this.data.set(doc._id, doc);
          this.documentToShard.set(doc._id, shardId);
          shardDataMap.set(doc._id, doc);
          
          // Update indices
          for (const [field, indexMap] of this.indices) {
            const value = doc[field];
            if (value !== undefined) {
              let valueSet = indexMap.get(value);
              if (!valueSet) {
                valueSet = new Set();
                indexMap.set(value, valueSet);
              }
              valueSet.add(doc._id);
            }
          }
        }
      }
      
      this.shardData.set(shardId, shardDataMap);
      
    } catch (error) {
      console.error(`Error loading shard ${shardId}:`, error);
    }
  }

  private createNewShard(): number {
    const shardId = this.nextShardId++;
    const shardPath = join(this.collectionPath, `shard_${shardId}.json`);
    
    // Create empty shard file
    writeFileSync(shardPath, '[]', 'utf8');
    
    // Add to shards map
    this.shards.set(shardId, {
      id: shardId,
      filePath: shardPath,
      documentCount: 0,
      fileSize: 2, // "[]"
      lastModified: new Date()
    });
    
    // Initialize shard data
    this.shardData.set(shardId, new Map());
    
    return shardId;
  }

  private findBestShardForInsert(): number {
    // Find shard with room for more documents
    for (const [shardId, shardInfo] of this.shards) {
      if (shardInfo.documentCount < this.maxDocumentsPerFile && 
          shardInfo.fileSize < this.maxFileSize) {
        return shardId;
      }
    }
    
    // Create new shard if none have space
    return this.createNewShard();
  }

  private saveShard(shardId: number): void {
    const shardInfo = this.shards.get(shardId);
    const shardDataMap = this.shardData.get(shardId);
    
    if (!shardInfo || !shardDataMap) return;

    const docs = Array.from(shardDataMap.values());
    const content = this.compressionLevel > 0 ? 
      compactStringify(docs) : 
      JSON.stringify(docs, null, this.compressionLevel);
    
    writeFileSync(shardInfo.filePath, content, 'utf8');
    
    // Update shard info
    shardInfo.documentCount = docs.length;
    shardInfo.fileSize = Buffer.byteLength(content, 'utf8');
    shardInfo.lastModified = new Date();
  }

  private saveAllDirtyShards(): void {
    if (!this.dirty) return;
    
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => {
      // Save all shards (in real implementation, track dirty shards)
      for (const shardId of this.shards.keys()) {
        this.saveShard(shardId);
      }
      
      this.saveMetadata();
      this.dirty = false;
      this.saveTimer = null;
    }, this.saveDelay);
  }

  private startWatching(): void {
    // Watch all shard files
    for (const shardInfo of this.shards.values()) {
      if (!this.watchedFiles.has(shardInfo.filePath)) {
        this.watchedFiles.add(shardInfo.filePath);
        watchFile(shardInfo.filePath, { interval: this.watchInterval }, (curr: Stats, prev: Stats) => {
          if (curr.mtime > shardInfo.lastModified && !this.dirty) {
            this.reloadShard(shardInfo.id);
          }
        });
      }
    }
  }

  private stopWatching(): void {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles.clear();
  }

  private reloadShard(shardId: number): void {
    const shardDataMap = this.shardData.get(shardId);
    if (!shardDataMap) return;

    // Remove documents from this shard from global data
    for (const [docId, doc] of shardDataMap) {
      this.data.delete(docId);
      this.documentToShard.delete(docId);
      
      // Remove from indices
      for (const [field, indexMap] of this.indices) {
        const value = doc[field];
        if (value !== undefined) {
          const valueSet = indexMap.get(value);
          if (valueSet) {
            valueSet.delete(docId);
            if (valueSet.size === 0) {
              indexMap.delete(value);
            }
          }
        }
      }
    }
    
    // Clear shard data
    shardDataMap.clear();
    
    // Reload shard
    this.loadShard(shardId);
    
    this.emit('change', 'reload', { shard: shardId });
  }

  ensureIndex(field: string): void {
    if (this.indices.has(field)) return;
    
    const indexMap = new Map<any, Set<string>>();
    
    for (const [_id, doc] of this.data) {
      const value = doc[field];
      if (value === undefined) continue;
      
      let valueSet = indexMap.get(value);
      if (!valueSet) {
        valueSet = new Set();
        indexMap.set(value, valueSet);
      }
      valueSet.add(_id);
    }
    
    this.indices.set(field, indexMap);
  }

  insert(docs: any | any[]): any {
    const items = Array.isArray(docs) ? docs : [docs];
    const insertedItems: any[] = [];
    
    for (const doc of items) {
      if (!doc._id) {
        doc._id = randomBytes(6).toString('hex');
      }
      
      if (this.data.has(doc._id)) {
        throw new Error(`Duplicate _id: ${doc._id}`);
      }
      
      // Find best shard for this document
      const shardId = this.findBestShardForInsert();
      const shardDataMap = this.shardData.get(shardId)!;
      
      // Add to global data
      this.data.set(doc._id, doc);
      this.documentToShard.set(doc._id, shardId);
      
      // Add to shard data
      shardDataMap.set(doc._id, doc);
      
      // Update indices
      for (const [field, indexMap] of this.indices) {
        const value = doc[field];
        if (value !== undefined) {
          let valueSet = indexMap.get(value);
          if (!valueSet) {
            valueSet = new Set();
            indexMap.set(value, valueSet);
          }
          valueSet.add(doc._id);
        }
      }
      
      insertedItems.push(doc);
    }
    
    this.dirty = true;
    this.saveAllDirtyShards();
    
    this.emit('change', 'insert', { docs: insertedItems });
    
    return items.length === 1 ? items[0] : items;
  }

  find(query: any = {}): any[] {
    const queryKeys = Object.keys(query);
    if (queryKeys.length === 0) {
      return Array.from(this.data.values());
    }

    // Use existing optimized query logic
    if (queryKeys.length === 1) {
      const field = queryKeys[0];
      const value = query[field];
      
      if (typeof value !== 'object' || value === null) {
        return this.findByIndex(field, value);
      }
    }

    // For complex queries, use full scan
    return Array.from(this.data.values()).filter(doc => this.matchDocument(doc, query));
  }

  private findByIndex(field: string, value: any): any[] {
    this.ensureIndex(field);
    const indexMap = this.indices.get(field);
    
    if (!indexMap?.has(value)) {
      return [];
    }
    
    const ids = indexMap.get(value)!;
    return Array.from(ids, id => this.data.get(id)!);
  }

  findOne(query: any = {}): any {
    const results = this.find(query);
    return results.length > 0 ? results[0] : null;
  }

  findById(id: string): any {
    return this.data.get(id) || null;
  }

  update(query: any, updates: any): number {
    const matchingDocs = this.find(query);
    if (matchingDocs.length === 0) return 0;
    
    const updatedDocs: any[] = [];
    
    for (const doc of matchingDocs) {
      const oldDoc = { ...doc };
      Object.assign(doc, updates);
      
      // Update in shard data
      const shardId = this.documentToShard.get(doc._id)!;
      const shardDataMap = this.shardData.get(shardId)!;
      shardDataMap.set(doc._id, doc);
      
      updatedDocs.push({ old: oldDoc, new: doc });
      
      // Update indices
      const updateKeys = Object.keys(updates);
      for (const field of updateKeys) {
        const indexMap = this.indices.get(field);
        if (!indexMap) continue;
        
        const oldVal = oldDoc[field];
        const newVal = doc[field];
        
        if (oldVal !== newVal) {
          // Remove from old value
          if (oldVal !== undefined) {
            const oldSet = indexMap.get(oldVal);
            if (oldSet) {
              oldSet.delete(doc._id);
              if (oldSet.size === 0) {
                indexMap.delete(oldVal);
              }
            }
          }
          
          // Add to new value
          if (newVal !== undefined) {
            let newSet = indexMap.get(newVal);
            if (!newSet) {
              newSet = new Set();
              indexMap.set(newVal, newSet);
            }
            newSet.add(doc._id);
          }
        }
      }
    }

    this.dirty = true;
    this.saveAllDirtyShards();
    
    this.emit('change', 'update', { docs: updatedDocs, count: matchingDocs.length });
    
    return matchingDocs.length;
  }

  delete(query: any): number {
    const matchingDocs = this.find(query);
    if (matchingDocs.length === 0) return 0;
    
    const deletedDocs: any[] = [];
    
    for (const doc of matchingDocs) {
      const shardId = this.documentToShard.get(doc._id)!;
      const shardDataMap = this.shardData.get(shardId)!;
      
      // Remove from global data
      this.data.delete(doc._id);
      this.documentToShard.delete(doc._id);
      
      // Remove from shard data
      shardDataMap.delete(doc._id);
      
      // Remove from indices
      for (const [field, indexMap] of this.indices) {
        const value = doc[field];
        if (value !== undefined) {
          const valueSet = indexMap.get(value);
          if (valueSet) {
            valueSet.delete(doc._id);
            if (valueSet.size === 0) {
              indexMap.delete(value);
            }
          }
        }
      }
      
      deletedDocs.push(doc);
    }

    this.dirty = true;
    this.saveAllDirtyShards();
    
    this.emit('change', 'delete', { docs: deletedDocs, count: matchingDocs.length });
    
    return matchingDocs.length;
  }

  private matchDocument(doc: any, query: any): boolean {
    for (const key in query) {
      const docValue = doc[key];
      const queryValue = query[key];
      
      if (typeof queryValue !== 'object' || queryValue === null) {
        if (docValue !== queryValue) return false;
      } else {
        for (const op in queryValue) {
          const val = queryValue[op];
          switch (op) {
            case '$gt': if (!(docValue > val)) return false; break;
            case '$gte': if (!(docValue >= val)) return false; break;
            case '$lt': if (!(docValue < val)) return false; break;
            case '$lte': if (!(docValue <= val)) return false; break;
            case '$ne': if (docValue === val) return false; break;
            case '$in': if (!Array.isArray(val) || !val.includes(docValue)) return false; break;
            case '$nin': if (Array.isArray(val) && val.includes(docValue)) return false; break;
            case '$regex': 
              if (typeof docValue !== 'string') return false;
              const flags = queryValue.$options || '';
              if (!new RegExp(val, flags).test(docValue)) return false;
              break;
            default: return false;
          }
        }
      }
    }
    return true;
  }

  count(query: any = {}): number {
    if (Object.keys(query).length === 0) return this.data.size;
    return this.find(query).length;
  }

  createIndex(field: string): void {
    this.ensureIndex(field);
  }

  // Optimize shards by redistributing documents
  optimize(): void {
    console.log(`Optimizing collection: ${this.name}`);
    
    const allDocs = Array.from(this.data.values());
    const optimalShardSize = Math.ceil(allDocs.length / Math.max(1, Math.ceil(allDocs.length / this.maxDocumentsPerFile)));
    
    // Clear existing shards
    for (const shardId of this.shards.keys()) {
      this.shardData.get(shardId)?.clear();
    }
    this.documentToShard.clear();
    
    // Redistribute documents
    let currentShardId = 0;
    let currentShardSize = 0;
    
    for (const doc of allDocs) {
      // Create new shard if needed
      if (currentShardSize >= optimalShardSize) {
        currentShardId++;
        currentShardSize = 0;
        
        if (!this.shards.has(currentShardId)) {
          this.createNewShard();
        }
      }
      
      // Add document to current shard
      const shardDataMap = this.shardData.get(currentShardId)!;
      shardDataMap.set(doc._id, doc);
      this.documentToShard.set(doc._id, currentShardId);
      currentShardSize++;
    }
    
    // Remove unused shards
    for (const [shardId, shardInfo] of this.shards) {
      if (!this.shardData.get(shardId)?.size) {
        rmSync(shardInfo.filePath, { force: true });
        this.shards.delete(shardId);
        this.shardData.delete(shardId);
      }
    }
    
    this.dirty = true;
    this.saveAllDirtyShards();
    
    console.log(`Optimization complete: ${this.name}, ${this.shards.size} shards`);
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
      memoryUsage: process.memoryUsage(),
      isDirty: this.dirty
    };
  }

  close(): void {
    this.stopWatching();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.removeAllListeners();
  }
}

export { SimpleDB, Collection };