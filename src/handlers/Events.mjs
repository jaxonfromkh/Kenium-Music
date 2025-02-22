import { readdir } from "fs/promises"; 
import path from "path"; 
class EventHandler { 
    constructor(client, rootPath) { 
        if (!client || !rootPath) { 
            throw new Error('Client and rootPath are required parameters'); 
        } 
        this.client = client; 
        this.rootPath = rootPath; 
        this.eventsDir = path.join(rootPath, "src", "events"); 
        this._cache = new Map(); 
    } 
    async loadEvents() { 
        try { 
            const files = await readdir(this.eventsDir); 
            const eventFiles = files.filter(file => file.endsWith(".mjs")); 
            await Promise.all(eventFiles.map(file => this.loadEvent(file))); 
        } catch (error) { 
            console.error("Failed to open events directory:", error); 
            throw error; 
        } 
    } 
    async loadEvent(filename) { 
        const eventPath = path.join(this.eventsDir, filename); 
        let module; 
        try { 
            if (this._cache.has(eventPath)) { 
                module = this._cache.get(eventPath); 
            } else { 
                module = await import(`file://${eventPath}`); 
                this._cache.set(eventPath, module); 
            } 
            const { Event } = module; 
            if (Event && !Event.ignore) { 
                const eventFunction = (...args) => { 
                    try { 
                        return Event.run(this.client, ...args); 
                    } catch (error) { 
                        console.error(`Error in event ${Event.name}:`, error); 
                    } 
                }; 
                const listenerMethod = Event.runOnce ? this.client.once : this.client.on; 
                listenerMethod.call(this.client, Event.name, eventFunction); 
            } 
        } catch (error) { 
            console.error(`Failed to load event from file: ${eventPath}`, error); 
        } 
    } 
} 
export { EventHandler };
