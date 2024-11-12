import { readdir } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

export const EventHandler = async (client, rootPath) => {
    const eventsDir = join(rootPath, "src", "events");
    const eventFiles = await readdir(eventsDir, { withFileTypes: true });

    for (const eventFile of eventFiles) {
        if (eventFile.isFile() && (extname(eventFile.name) === ".js" || extname(eventFile.name) === ".mjs")) {
            const eventPath = join(eventsDir, eventFile.name);
            try {
                const { Event } = await import(new URL(`file://${eventPath}`, import.meta.url));


                if (Event && !Event.ignore) {
                    const eventFunction = Event.customEvent ? Event.run.bind(null, client) : Event.run.bind(null, client);
                    

                    const handler = (...args) => eventFunction(...args);

                    if (Event.runOnce) {
                        client.once(Event.name, handler);
                    } else {
                        client.on(Event.name, handler);
                    }
                }
            } catch (error) {
                console.error(`Failed to load event from file: ${eventPath}`, error);
            }
        }
    }
};