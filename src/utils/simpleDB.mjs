import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

class SimpleDB {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.collections = {};
    this.init();
  }

  init() {
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }

    const collections = readdirSync(this.dbPath)
      .filter(file => file.endsWith('.json'));
    
    collections.forEach(collection => {
      const name = collection.replace('.json', '');
      this.collections[name] = true;
    });
  }

  collection(name) {
    const filePath = join(this.dbPath, `${name}.json`);
    
    if (!this.collections[name]) {
      writeFileSync(filePath, JSON.stringify([]));
      this.collections[name] = true;
    }
    
    return new Collection(name, filePath);
  }
}

class Collection {
  constructor(name, filePath) {
    this.name = name;
    this.filePath = filePath;
    this.data = this.load();
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
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    return true;
  }

  insert(docs) {
    const docsArray = Array.isArray(docs) ? docs : [docs];
    
    docsArray.forEach(doc => {
      if (!doc._id) {
        doc._id = randomBytes(16).toString('hex');
      }
      this.data.push(doc);
    });
    
    this.save();
    return docsArray.length === 1 ? docsArray[0] : docsArray;
  }

  find(query = {}) {
    return this.data.filter(doc => this.matchDocument(doc, query));
  }

  findOne(query = {}) {
    return this.data.find(doc => this.matchDocument(doc, query)) || null;
  }

  findById(id) {
    return this.data.find(doc => doc._id === id) || null;
  }

  update(query, updates) {
    const matches = this.data.filter(doc => this.matchDocument(doc, query));
    
    matches.forEach(doc => {
      Object.keys(updates).forEach(key => {
        doc[key] = updates[key];
      });
    });
    
    this.save();
    return matches.length;
  }

  delete(query) {
    const initialLength = this.data.length;
    this.data = this.data.filter(doc => !this.matchDocument(doc, query));
    this.save();
    return initialLength - this.data.length;
  }

  matchDocument(doc, query) {
    for (const key in query) {
      if (typeof query[key] === 'object' && query[key] !== null) {
        const operator = Object.keys(query[key])[0];
        const value = query[key][operator];
        
        switch (operator) {
          case '$gt': if (!(doc[key] > value)) return false; break;
          case '$gte': if (!(doc[key] >= value)) return false; break;
          case '$lt': if (!(doc[key] < value)) return false; break;
          case '$lte': if (!(doc[key] <= value)) return false; break;
          case '$ne': if (doc[key] === value) return false; break;
          case '$in': if (!Array.isArray(value) || !value.includes(doc[key])) return false; break;
          default: return false;
        }
      } else if (doc[key] !== query[key]) {
        return false;
      }
    }
    return true;
  }


  count(query = {}) {
    return this.find(query).length;
  }
}

export { SimpleDB };