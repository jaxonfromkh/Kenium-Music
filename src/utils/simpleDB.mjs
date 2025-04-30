import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import tinyGlob from 'tiny-glob';

class SimpleDB {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.collections = new Map();
    this.collectionInstances = new Map();
    
    // Create DB directory if it doesn't exist
    !existsSync(this.dbPath) && mkdirSync(this.dbPath, { recursive: true });
    
    // Initialize collections asynchronously
    this.initPromise = this.init();
  }

  async init() {
    const files = await tinyGlob('*.json', { cwd: this.dbPath });
    files.forEach(file => this.collections.set(file.replace('.json', ''), true));
    return this;
  }

  collection(name) {
    if (this.collectionInstances.has(name)) return this.collectionInstances.get(name);

    const filePath = join(this.dbPath, `${name}.json`);
    
    if (!this.collections.has(name) && !existsSync(filePath)) {
      writeFileSync(filePath, '[]');
      this.collections.set(name, true);
    }

    const collection = new Collection(name, filePath);
    this.collectionInstances.set(name, collection);
    return collection;
  }
}

class Collection {
  constructor(name, filePath) {
    this.name = name;
    this.filePath = filePath;
    this.data = [];
    this.indices = new Map();
    this.dirty = false;
    this._saveTimer = null;
    this._saveDelay = 50; // Reduced save delay for better performance
    
    // Add default _id index
    this.indices.set('_id', new Map());
    
    // Load data immediately (not async for simplicity)
    this.load();
  }

  load() {
    try {
      if (existsSync(this.filePath)) {
        const fileData = readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(fileData);
        // Rebuild only _id index for now - other indices built on demand
        this.data.forEach((doc, idx) => {
          if (doc._id) this.indices.get('_id').set(doc._id, idx);
        });
      }
    } catch {
      this.data = [];
    }
    return this;
  }

  save() {
    if (!this.dirty) return true;
    
    this._saveTimer && clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      writeFileSync(this.filePath, JSON.stringify(this.data));
      this.dirty = false;
      this._saveTimer = null;
    }, this._saveDelay);

    return true;
  }

  // Lazily create index for a field only when needed
  ensureIndex(field) {
    if (this.indices.has(field)) return;
    
    const index = new Map();
    this.data.forEach((doc, idx) => {
      doc[field] !== undefined && index.set(doc[field], idx);
    });
    
    this.indices.set(field, index);
  }

  // More efficient index update - only update what changed
  updateIndex(field, value, idx) {
    const index = this.indices.get(field);
    if (index) index.set(value, idx);
  }

  // Rebuild indices for docs after a deletion
  reindexFrom(startIdx) {
    for (let i = startIdx; i < this.data.length; i++) {
      const doc = this.data[i];
      this.indices.forEach((index, field) => {
        doc[field] !== undefined && index.set(doc[field], i);
      });
    }
  }

  insert(docs) {
    const items = Array.isArray(docs) ? docs : [docs];
    const idIndex = this.indices.get('_id');
    
    items.forEach(doc => {
      // Generate ID if not present
      if (!doc._id) doc._id = randomBytes(12).toString('hex');
      
      const idx = this.data.push(doc) - 1;
      
      // Update indices
      this.indices.forEach((index, field) => {
        doc[field] !== undefined && index.set(doc[field], idx);
      });
    });

    this.dirty = true;
    this.save();
    return items.length === 1 ? items[0] : items;
  }

  find(query = {}) {
    // Fast path: empty query returns all data
    if (!Object.keys(query).length) return [...this.data];

    // Fast path: query by _id
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id').get(query._id);
      return idx !== undefined ? [this.data[idx]] : [];
    }

    // Check if we can use an index for a simple single-field query
    const fields = Object.keys(query);
    if (fields.length === 1) {
      const field = fields[0];
      const value = query[field];
      
      if (typeof value !== 'object') {
        this.ensureIndex(field);
        if (this.indices.has(field)) {
          const idx = this.indices.get(field).get(value);
          return idx !== undefined ? [this.data[idx]] : [];
        }
      }
    }

    // Fallback to full scan with optimized matching
    return this.data.filter(doc => this.matchDocument(doc, query));
  }

  findOne(query = {}) {
    // Fast path: query by _id
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id').get(query._id);
      return idx !== undefined ? this.data[idx] : null;
    }

    // Check if we can use an index for a simple single-field query
    const fields = Object.keys(query);
    if (fields.length === 1) {
      const field = fields[0];
      const value = query[field];
      
      if (typeof value !== 'object') {
        this.ensureIndex(field);
        if (this.indices.has(field)) {
          const idx = this.indices.get(field).get(value);
          return idx !== undefined ? this.data[idx] : null;
        }
      }
    }

    // Fallback to find first match
    return this.data.find(doc => this.matchDocument(doc, query)) || null;
  }

  findById(id) {
    const idx = this.indices.get('_id').get(id);
    return idx !== undefined ? this.data[idx] : null;
  }

  update(query, updates) {
    // Fast path: update by _id
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id').get(query._id);
      if (idx !== undefined) {
        const doc = this.data[idx];
        
        // Remove old index entries
        this.indices.forEach((index, field) => {
          if (field in doc && field in updates && doc[field] !== updates[field]) {
            index.delete(doc[field]);
          }
        });
        
        // Update document
        Object.assign(doc, updates);
        
        // Update indices with new values
        this.indices.forEach((index, field) => {
          doc[field] !== undefined && index.set(doc[field], idx);
        });
        
        this.dirty = true;
        this.save();
        return 1;
      }
      return 0;
    }

    // Find matching documents
    const matches = [];
    this.data.forEach((doc, idx) => {
      this.matchDocument(doc, query) && matches.push(idx);
    });

    if (!matches.length) return 0;

    // Update all matches
    matches.forEach(idx => {
      const doc = this.data[idx];
      
      // Remove old index entries
      this.indices.forEach((index, field) => {
        if (field in doc && field in updates && doc[field] !== updates[field]) {
          index.delete(doc[field]);
        }
      });
      
      // Update document
      Object.assign(doc, updates);
      
      // Update indices
      this.indices.forEach((index, field) => {
        doc[field] !== undefined && index.set(doc[field], idx);
      });
    });

    this.dirty = true;
    this.save();
    return matches.length;
  }

  delete(query) {
    // Fast path: delete by _id
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id').get(query._id);
      if (idx !== undefined) {
        const doc = this.data[idx];
        
        // Remove index entries
        this.indices.forEach(index => {
          Object.keys(doc).forEach(field => {
            doc[field] !== undefined && index.delete(doc[field]);
          });
        });
        
        // Remove document
        this.data.splice(idx, 1);
        
        // Fix indices for documents after the deleted one
        this.reindexFrom(idx);
        
        this.dirty = true;
        this.save();
        return 1;
      }
      return 0;
    }

    // Find documents to delete
    const toDelete = [];
    this.data.forEach((doc, idx) => {
      this.matchDocument(doc, query) && toDelete.push(idx);
    });
    
    if (!toDelete.length) return 0;

    // Delete in reverse order to avoid index shifting issues
    toDelete.sort((a, b) => b - a);
    
    let lowestIdx = this.data.length;
    toDelete.forEach(idx => {
      const doc = this.data[idx];
      
      // Remove index entries
      this.indices.forEach(index => {
        Object.keys(doc).forEach(field => {
          doc[field] !== undefined && index.delete(doc[field]);
        });
      });
      
      // Remove document
      this.data.splice(idx, 1);
      lowestIdx = Math.min(lowestIdx, idx);
    });
    
    // Fix indices for documents after the deleted ones
    this.reindexFrom(lowestIdx);
    
    this.dirty = true;
    this.save();
    return toDelete.length;
  }

  // Optimized document matching
  matchDocument(doc, query) {
    for (const key in query) {
      if (!(key in doc)) return false;
      
      const queryVal = query[key];
      
      // Fast path for common cases
      if (queryVal === null) {
        if (doc[key] !== null) return false;
        continue;
      }
      
      if (typeof queryVal !== 'object') {
        if (doc[key] !== queryVal) return false;
        continue;
      }
      
      // Handle operators
      for (const op in queryVal) {
        const val = queryVal[op];
        
        switch (op) {
          case '$gt': if (!(doc[key] > val)) return false; break;
          case '$gte': if (!(doc[key] >= val)) return false; break;
          case '$lt': if (!(doc[key] < val)) return false; break;
          case '$lte': if (!(doc[key] <= val)) return false; break;
          case '$ne': if (doc[key] === val) return false; break;
          case '$in': if (!Array.isArray(val) || !val.includes(doc[key])) return false; break;
          default: return false;
        }
      }
    }
    return true;
  }

  count(query = {}) {
    // Fast path: count all
    if (!Object.keys(query).length) return this.data.length;
    
    // Fast path: count by _id
    if (query._id && typeof query._id === 'string') {
      return this.indices.get('_id').has(query._id) ? 1 : 0;
    }

    // Check if we can use an index for a simple single-field query
    const fields = Object.keys(query);
    if (fields.length === 1) {
      const field = fields[0];
      const value = query[field];
      
      if (typeof value !== 'object') {
        this.ensureIndex(field);
        if (this.indices.has(field)) {
          return this.indices.get(field).has(value) ? 1 : 0;
        }
      }
    }
    
    // Fallback to filtering
    return this.data.filter(doc => this.matchDocument(doc, query)).length;
  }

  createIndex(field) {
    if (this.indices.has(field)) return false;
    this.ensureIndex(field);
    return true;
  }

  bulkWrite(operations) {
    let insertCount = 0, updateCount = 0, deleteCount = 0;

    operations.forEach(op => {
      if (op.insert) {
        const count = Array.isArray(op.insert) ? op.insert.length : 1;
        this.insert(op.insert);
        insertCount += count;
      } else if (op.update && op.query) {
        updateCount += this.update(op.query, op.update);
      } else if (op.delete) {
        deleteCount += this.delete(op.delete);
      }
    });

    return { insertCount, updateCount, deleteCount };
  }
}

export { SimpleDB };
