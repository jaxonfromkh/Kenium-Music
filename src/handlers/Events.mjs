import { opendir } from "fs/promises";
import path from "path";

export const EventHandler = async (client, rootPath) => {
    if (!client || !rootPath) {
        throw new Error('Client and rootPath are required parameters');
    }
    
    const eventsDir = path.join(rootPath, "src", "events");

    try {
        const dirHandle = await opendir(eventsDir);
        for await (const dirent of dirHandle) {
            if (!dirent.isFile() || !/\.(js|mjs)$/.test(dirent.name)) continue;
            
            const eventPath = path.join(eventsDir, dirent.name);
            try {
                const { Event } = await import(new URL(`file://${eventPath}`, import.meta.url));
                if (!Event || Event.ignore) continue;

                const eventFunction = (...args) => {
                    try {
                        return Event.run(client, ...args);
                    } catch (error) {
                        console.error(`Error in event ${Event.name}:`, error);
                        client.removeListener(Event.name, eventFunction);
                    }
                };

                if (Event.runOnce) {
                    client.once(Event.name, eventFunction);
                } else {
                    client.on(Event.name, eventFunction);
                }
            } catch (error) {
                console.error(`Failed to load event from file: ${eventPath}`, error);
            }
        }
    } catch (error) {
        console.error("Failed to open events directory:", error);
        throw error; 
    }
};
