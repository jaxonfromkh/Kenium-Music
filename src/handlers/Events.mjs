import { readdir } from "fs/promises";
import path from "path";

export const EventHandler = async (client, rootPath) => {
    if (!client || !rootPath) {
        throw new Error('Client and rootPath are required parameters');
    }
    
    const eventsDir = path.join(rootPath, "src", "events");

    try {
        const files = await readdir(eventsDir);
        const eventLoadPromises = files
            .filter((file) => /\.(js|mjs)$/.test(file))
            .map(async (filename) => {
                const eventPath = path.join(eventsDir, filename);
                try {
                    const { Event } = await import(`file://${eventPath}`);
                    if (!Event || Event.ignore) return;
                    
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
            });

        await Promise.all(eventLoadPromises);
    } catch (error) {
        console.error("Failed to open events directory:", error);
        throw error;
    }
};
