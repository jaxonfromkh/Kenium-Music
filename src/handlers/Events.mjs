import fg from 'fast-glob';
import path from 'path';

class EventHandler {
    constructor(client, rootPath) {
        if (!client || !rootPath) {
            throw new Error("Client and rootPath are required parameters");
        }
        this.client = client;
        this.eventsDir = path.join(rootPath, "src", "events");
    }

    async loadEvents() {
        try {
            const eventFiles = await fg('*.mjs', {
                cwd: this.eventsDir,
                onlyFiles: true
            });
            await Promise.all(eventFiles.map(file => this.loadEvent(file)));
        } catch (error) {
            console.error("Failed to load events:", error);
            throw error;
        }
    }

    async loadEvent(filename) {
        const eventPath = path.join(this.eventsDir, filename);
        try {
            const { Event } = await import(`file://${eventPath}`);
            if (!Event?.name || Event?.ignore) return;

            const handler = (...args) => {
                try {
                    Event.run(this.client, ...args);
                } catch (err) {
                    console.error(`Error in event ${Event.name}:`, err);
                }
            };

            this.client[Event.runOnce ? "once" : "on"](Event.name, handler);
        } catch (error) {
            console.error(`Failed to load event from file: ${eventPath}`, error);
        }
    }
}

export { EventHandler };
