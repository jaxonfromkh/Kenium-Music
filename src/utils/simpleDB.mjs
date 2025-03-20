import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

class SimpleDB {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.collections = new Map();
    this.init();
  }

  init() {
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }

    readdirSync(this.dbPath)
      .filter(file => file.endsWith('.json'))
      .forEach(collection => {
        const name = collection.replace('.json', '');
        this.collections.set(name, true);
      });
  }

  collection(name) {
    const filePath = join(this.dbPath, `${name}.json`);

    if (!this.collections.has(name)) {
      writeFileSync(filePath, JSON.stringify([]));
      this.collections.set(name, true);
    }

    return new Collection(name, filePath);
  }
}

class Collection {
  constructor(name, filePath) {
    this.name = name;
    this.filePath = filePath;
    this.data = this.load();
    this.indices = new Map();
    this.buildIndices(['_id']);
  }

  load() {
    try {
      const fileData = readFileSync(this.filePath, 'utf8');
      return JSON.parse(fileData);
    } catch (err) {
      return [];
    }
  }

  save() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }

    this._saveTimeout = setTimeout(() => {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      this._saveTimeout = null;
    }, 100);

    return true;
  }

  buildIndices(fields) {
    fields.forEach(field => {
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

  insert(docs) {
    const docsArray = Array.isArray(docs) ? docs : [docs];
    
    docsArray.forEach(doc => {
      if (!doc._id) {
        doc._id = randomBytes(16).toString('hex');
      }
      
      const idx = this.data.push(doc) - 1;
      this.updateIndices(doc, idx);
    });

    this.save();
    return docsArray.length === 1 ? docsArray[0] : docsArray;
  }

  find(query = {}) {
    const singleFieldQueries = Object.keys(query);
    if (singleFieldQueries.length === 1) {
      const field = singleFieldQueries[0];
      const value = query[field];
      
      if (typeof value !== 'object' && this.indices.has(field)) {
        const idx = this.indices.get(field).get(value);
        return idx !== undefined ? [this.data[idx]] : [];
      }
    }

    return this.data.filter(doc => this.matchDocument(doc, query));
  }

  findOne(query = {}) {
    if (query._id && typeof query._id !== 'object') {
      const idx = this.indices.get('_id').get(query._id);
      return idx !== undefined ? this.data[idx] : null;
    }

    const singleFieldQueries = Object.keys(query);
    if (singleFieldQueries.length === 1) {
      const field = singleFieldQueries[0];
      const value = query[field];
      
      if (typeof value !== 'object' && this.indices.has(field)) {
        const idx = this.indices.get(field).get(value);
        return idx !== undefined ? this.data[idx] : null;
      }
    }

    return this.data.find(doc => this.matchDocument(doc, query)) || null;
  }

  findById(id) {
    const idx = this.indices.get('_id').get(id);
    return idx !== undefined ? this.data[idx] : null;
  }

  update(query, updates) {
    if (query._id && typeof query._id !== 'object') {
      const idx = this.indices.get('_id').get(query._id);
      if (idx !== undefined) {
        Object.assign(this.data[idx], updates);
        this.updateIndices(this.data[idx], idx);
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

    matches.forEach(idx => {
      Object.assign(this.data[idx], updates);
      this.updateIndices(this.data[idx], idx);
    });

    if (matches.length > 0) {
      this.save();
    }
    
    return matches.length;
  }

  delete(query) {
    if (query._id && typeof query._id !== 'object') {
      const idx = this.indices.get('_id').get(query._id);
      if (idx !== undefined) {
        this.indices.forEach(index => {
          const doc = this.data[idx];
          Object.keys(doc).forEach(field => {
            if (index.get(doc[field]) === idx) {
              index.delete(doc[field]);
            }
          });
        });
        
        this.data.splice(idx, 1);
        
        for (let i = idx; i < this.data.length; i++) {
          this.updateIndices(this.data[i], i);
        }
        
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
    
    toDelete.sort((a, b) => b - a).forEach(idx => {
      const doc = this.data[idx];
      this.indices.forEach(index => {
        Object.keys(doc).forEach(field => {
          if (index.get(doc[field]) === idx) {
            index.delete(doc[field]);
          }
        });
      });
      
      this.data.splice(idx, 1);
      
      for (let i = idx; i < this.data.length; i++) {
        this.updateIndices(this.data[i], i);
      }
    });
    
    if (toDelete.length > 0) {
      this.save();
    }
    
    return toDelete.length;
  }

  matchDocument(doc, query) {
    for (const key in query) {
      if (!(key in doc)) return false;
      
      if (typeof query[key] === 'object' && query[key] !== null) {
        const operator = Object.keys(query[key])[0];
        const value = query[key][operator];
        
        switch (operator) {
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
      } else if (doc[key] !== query[key]) {
        return false;
      }
    }
    return true;
  }

  count(query = {}) {
    if (Object.keys(query).length === 0) {
      return this.data.length;
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
}

export { SimpleDB };
