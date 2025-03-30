import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import tinyGlob from 'tiny-glob';

class SimpleDB {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.collections = new Map();
    this.collectionInstances = new Map();
    this.init();
  }

  async init() {
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }

    const files = await tinyGlob('*.json', { cwd: this.dbPath });
    files.forEach(file => {
      const name = file.replace('.json', '');
      this.collections.set(name, true);
    });
  }

  collection(name) {
    if (this.collectionInstances.has(name)) {
      return this.collectionInstances.get(name);
    }

    const filePath = join(this.dbPath, `${name}.json`);

    if (!this.collections.has(name)) {
      if (!existsSync(filePath)) {
        writeFileSync(filePath, '[]');
      }
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
    this.loading = this.load();
    this._saveTimer = null;
  }

  async load() {
    try {
      if (existsSync(this.filePath)) {
        const fileData = readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(fileData);
        this.buildIndices(['_id']);
      } else {
        this.data = [];
      }
    } catch (err) {
      this.data = [];
    }
  }

  save() {
    if (!this.dirty) return true;
    
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }

    this._saveTimer = setTimeout(() => {
      writeFileSync(this.filePath, JSON.stringify(this.data));
      this.dirty = false;
      this._saveTimer = null;
    }, 100);

    return true;
  }

  buildIndices(fields) {
    fields.forEach(field => {
      if (this.indices.has(field)) return;
      
      const index = new Map();
      this.data.forEach((doc, idx) => {
        if (doc[field] !== undefined) {
          index.set(doc[field], idx);
        }
      });
      this.indices.set(field, index);
    });
  }

  updateIndices(doc, idx) {
    this.indices.forEach((index, field) => {
      if (doc[field] !== undefined) {
        index.set(doc[field], idx);
      }
    });
  }

  reindexFrom(startIdx) {
    for (let i = startIdx; i < this.data.length; i++) {
      this.updateIndices(this.data[i], i);
    }
  }

  insert(docs) {
    const docsArray = Array.isArray(docs) ? docs : [docs];
    const startIdx = this.data.length;
    
    docsArray.forEach(doc => {
      if (!doc._id) {
        doc._id = randomBytes(12).toString('hex');
      }
      
      const idx = this.data.push(doc) - 1;
      this.updateIndices(doc, idx);
    });

    this.dirty = true;
    this.save();
    return docsArray.length === 1 ? docsArray[0] : docsArray;
  }

  find(query = {}) {
    if (Object.keys(query).length === 0) {
      return [...this.data];
    }

    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id')?.get(query._id);
      return idx !== undefined ? [this.data[idx]] : [];
    }

    const queryFields = Object.keys(query);
    if (queryFields.length === 1) {
      const field = queryFields[0];
      const value = query[field];
      
      if (typeof value !== 'object' && this.indices.has(field)) {
        const idx = this.indices.get(field).get(value);
        return idx !== undefined ? [this.data[idx]] : [];
      }
    }

    return this.data.filter(doc => this.matchDocument(doc, query));
  }

  findOne(query = {}) {
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id')?.get(query._id);
      return idx !== undefined ? this.data[idx] : null;
    }

    const queryFields = Object.keys(query);
    if (queryFields.length === 1) {
      const field = queryFields[0];
      const value = query[field];
      
      if (typeof value !== 'object' && this.indices.has(field)) {
        const idx = this.indices.get(field).get(value);
        return idx !== undefined ? this.data[idx] : null;
      }
    }

    return this.data.find(doc => this.matchDocument(doc, query)) || null;
  }

  findById(id) {
    const idx = this.indices.get('_id')?.get(id);
    return idx !== undefined ? this.data[idx] : null;
  }

  update(query, updates) {
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id')?.get(query._id);
      if (idx !== undefined) {
        Object.assign(this.data[idx], updates);
        this.updateIndices(this.data[idx], idx);
        this.dirty = true;
        this.save();
        return 1;
      }
      return 0;
    }

    const matches = [];
    this.data.forEach((doc, idx) => {
      if (this.matchDocument(doc, query)) {
        matches.push(idx);
      }
    });

    if (matches.length === 0) return 0;

    matches.forEach(idx => {
      Object.assign(this.data[idx], updates);
      this.updateIndices(this.data[idx], idx);
    });

    this.dirty = true;
    this.save();
    return matches.length;
  }

  delete(query) {
    if (query._id && typeof query._id === 'string') {
      const idx = this.indices.get('_id')?.get(query._id);
      if (idx !== undefined) {
        const doc = this.data[idx];
        this.indices.forEach(index => {
          Object.keys(doc).forEach(field => {
            if (index.has(doc[field])) {
              index.delete(doc[field]);
            }
          });
        });
        
        this.data.splice(idx, 1);
        
        this.reindexFrom(idx);
        
        this.dirty = true;
        this.save();
        return 1;
      }
      return 0;
    }

    const toDelete = [];
    this.data.forEach((doc, idx) => {
      if (this.matchDocument(doc, query)) {
        toDelete.push(idx);
      }
    });
    
    if (toDelete.length === 0) return 0;

    toDelete.sort((a, b) => b - a);
    
    let lowestIdx = this.data.length;
    toDelete.forEach(idx => {
      const doc = this.data[idx];
      this.indices.forEach(index => {
        Object.keys(doc).forEach(field => {
          if (index.has(doc[field])) {
            index.delete(doc[field]);
          }
        });
      });
      
      this.data.splice(idx, 1);
      
      lowestIdx = Math.min(lowestIdx, idx);
    });
    
    this.reindexFrom(lowestIdx);
    
    this.dirty = true;
    this.save();
    return toDelete.length;
  }

  matchDocument(doc, query) {
    for (const key in query) {
      if (!(key in doc)) return false;
      
      const queryValue = query[key];
      
      if (queryValue === null) {
        if (doc[key] !== null) return false;
        continue;
      }
      
      if (typeof queryValue === 'object') {
        const operators = Object.keys(queryValue);
        
        for (const op of operators) {
          const value = queryValue[op];
          
          switch (op) {
            case '$gt': if (!(doc[key] > value)) return false; break;
            case '$gte': if (!(doc[key] >= value)) return false; break;
            case '$lt': if (!(doc[key] < value)) return false; break;
            case '$lte': if (!(doc[key] <= value)) return false; break;
            case '$ne': if (doc[key] === value) return false; break;
            case '$in': 
              if (!Array.isArray(value) || !value.includes(doc[key])) {
                return false;
              }
              break;
            default: return false;
          }
        }
      } else if (doc[key] !== queryValue) {
        return false;
      }
    }
    return true;
  }

  count(query = {}) {
    if (Object.keys(query).length === 0) {
      return this.data.length;
    }
    
    if (query._id && typeof query._id === 'string') {
      return this.indices.get('_id').has(query._id) ? 1 : 0;
    }

    const queryFields = Object.keys(query);
    if (queryFields.length === 1) {
      const field = queryFields[0];
      const value = query[field];
      
      if (typeof value !== 'object' && this.indices.has(field)) {
        return this.indices.get(field).has(value) ? 1 : 0;
      }
    }
    
    return this.find(query).length;
  }

  createIndex(field) {
    if (!this.indices.has(field)) {
      this.buildIndices([field]);
      return true;
    }
    return false;
  }

  bulkWrite(operations) {
    let insertCount = 0;
    let updateCount = 0;
    let deleteCount = 0;

    operations.forEach(op => {
      if (op.insert) {
        this.insert(op.insert);
        insertCount += Array.isArray(op.insert) ? op.insert.length : 1;
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
