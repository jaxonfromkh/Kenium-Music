import { readdir } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

export const EventHandler = async (client, rootPath) => {
    const eventsDir = join(rootPath, "src", "events");
    
    try {
        const eventFiles = await readdir(eventsDir, { withFileTypes: true });
        
        // Filter and map event files in one go
        const eventPromises = eventFiles
            .filter(eventFile => eventFile.isFile() && (extname(eventFile.name) === ".js" || extname(eventFile.name) === ".mjs"))
            .map(async (eventFile) => {
                const eventPath = join(eventsDir, eventFile.name);
                try {
                    const { Event } = await import(new URL(`file://${eventPath}`, import.meta.url));
                    if (Event && !Event.ignore) {
                        const eventFunction = Event.run.bind(null, client);
                        return Event.runOnce ? client.once(Event.name, eventFunction) : client.on(Event.name, eventFunction);
                    }
                } catch (error) {
                    console.error(`Failed to load event from file: ${eventPath}`, error);
                }
                return null; // Return null for failed events
            });

        // Wait for all promises to resolve
        await Promise.all(eventPromises);
    } catch (error) {
        console.error("Failed to read events directory:", error);
    }
};
