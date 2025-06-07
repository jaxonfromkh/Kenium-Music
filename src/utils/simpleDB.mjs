import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import fg from 'fast-glob';

class SimpleDB {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.collections = new Map();
    this.collectionInstances = new Map();
    
    !existsSync(this.dbPath) && mkdirSync(this.dbPath, { recursive: true });
    
    this.initPromise = this.init();
  }

  async init() {
    const files = await fg('*.json', { cwd: this.dbPath });
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
    this.data = new Map(); // _id to doc
    this.indices = new Map(); // field to (value to Set<_id>)
    this.dirty = false;
    this._saveTimer = null;
    this._saveDelay = 50; // Reduced save delay for better performance
    
    // Ensure _id index
    this.ensureIndex('_id');
    
    // Load data immediately
    this.load();
  }

  load() {
    try {
      if (existsSync(this.filePath)) {
        const fileData = readFileSync(this.filePath, 'utf8');
        const docs = JSON.parse(fileData);
        docs.forEach(doc => {
          if (doc._id) {
            this.data.set(doc._id, doc);
          } else {
            console.error('Document without _id:', doc);
          }
        });
      }
    } catch (err) {
      console.error('Error loading collection:', err);
      this.data = new Map();
    }
    return this;
  }

  save() {
    if (!this.dirty) return true;
    
    this._saveTimer && clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const docs = Array.from(this.data.values());
      writeFileSync(this.filePath, JSON.stringify(docs));
      this.dirty = false;
      this._saveTimer = null;
    }, this._saveDelay);

    return true;
  }

  ensureIndex(field) {
    if (this.indices.has(field)) return;
    
    const indexMap = new Map(); // value to Set<_id>
    this.data.forEach((doc, _id) => {
      const value = doc[field];
      if (value !== undefined) {
        if (!indexMap.has(value)) {
          indexMap.set(value, new Set());
        }
        indexMap.get(value).add(_id);
      }
    });
    
    this.indices.set(field, indexMap);
  }

  insert(docs) {
    const items = Array.isArray(docs) ? docs : [docs];
    items.forEach(doc => {
      if (!doc._id) {
        doc._id = randomBytes(12).toString('hex');
      }
      if (this.data.has(doc._id)) {
        throw new Error('Duplicate _id: ' + doc._id);
      }
      this.data.set(doc._id, doc);
      
      // Update all existing indices
      this.indices.forEach((indexMap, field) => {
        const value = doc[field];
        if (value !== undefined) {
          if (!indexMap.has(value)) {
            indexMap.set(value, new Set());
          }
          indexMap.get(value).add(doc._id);
        }
      });
    });

    this.dirty = true;
    this.save();
    return items.length === 1 ? items[0] : items;
  }

  find(query = {}) {
    if (!Object.keys(query).length) {
      return Array.from(this.data.values());
    }

    const fields = Object.keys(query);
    if (fields.length === 1 && typeof query[fields[0]] !== 'object') {
      const field = fields[0];
      const value = query[field];
      this.ensureIndex(field);
      if (this.indices.has(field)) {
        const indexMap = this.indices.get(field);
        if (indexMap.has(value)) {
          const ids = indexMap.get(value);
          return Array.from(ids).map(_id => this.data.get(_id));
        } else {
          return [];
        }
      }
    }

    // Fallback to full scan
    return Array.from(this.data.values()).filter(doc => this.matchDocument(doc, query));
  }

  findOne(query = {}) {
    const results = this.find(query);
    return results.length > 0 ? results[0] : null;
  }

  findById(id) {
    return this.data.get(id) || null;
  }

  update(query, updates) {
    const matchingDocs = this.find(query);
    let count = 0;
    matchingDocs.forEach(doc => {
      const oldDoc = { ...doc };
      Object.assign(doc, updates);
      
      // Update indices
      Object.keys(updates).forEach(field => {
        if (this.indices.has(field)) {
          const oldVal = oldDoc[field];
          const newVal = doc[field];
          if (oldVal !== newVal) {
            // Remove from oldVal
            if (oldVal !== undefined) {
              const indexMap = this.indices.get(field);
              if (indexMap.has(oldVal)) {
                const set = indexMap.get(oldVal);
                set.delete(doc._id);
                if (set.size === 0) {
                  indexMap.delete(oldVal);
                }
              }
            }
            // Add to newVal
            if (newVal !== undefined) {
              const indexMap = this.indices.get(field);
              if (!indexMap.has(newVal)) {
                indexMap.set(newVal, new Set());
              }
              indexMap.get(newVal).add(doc._id);
            }
          }
        }
      });
      count++;
    });

    this.dirty = true;
    this.save();
    return count;
  }

  delete(query) {
    const matchingDocs = this.find(query);
    let count = 0;
    matchingDocs.forEach(doc => {
      this.data.delete(doc._id);
      
      // Remove from all indices
      this.indices.forEach((indexMap, field) => {
        const value = doc[field];
        if (value !== undefined && indexMap.has(value)) {
          const set = indexMap.get(value);
          set.delete(doc._id);
          if (set.size === 0) {
            indexMap.delete(value);
          }
        }
      });
      count++;
    });

    this.dirty = true;
    this.save();
    return count;
  }

  matchDocument(doc, query) {
    for (const key in query) {
      if (!(key in doc)) return false;
      const queryVal = query[key];
      if (typeof queryVal !== 'object') {
        if (doc[key] !== queryVal) return false;
      } else {
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
    }
    return true;
  }

  count(query = {}) {
    if (!Object.keys(query).length) return this.data.size;
    
    const fields = Object.keys(query);
    if (fields.length === 1 && typeof query[fields[0]] !== 'object') {
      const field = fields[0];
      const value = query[field];
      this.ensureIndex(field);
      if (this.indices.has(field)) {
        const indexMap = this.indices.get(field);
        if (indexMap.has(value)) {
          return indexMap.get(value).size;
        } else {
          return 0;
        }
      }
    }
    
    return this.find(query).length;
  }

  createIndex(field) {
    return this.ensureIndex(field);
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