import { readdir } from "fs/promises";
import { join } from "path";

export const EventHandler = async (client, rootPath) => {
    const eventsDir = join(rootPath, "src", "events");
    try {
        // Read directory once and cache the results
        const eventFiles = await readdir(eventsDir, { withFileTypes: true });

        // Process files in a single pass
        const events = await Promise.all(
            eventFiles
                .filter(file => file.isFile() && /\.m?js$/.test(file.name))
                .map(async file => {
                    const eventPath = join(eventsDir, file.name);
                    try {
                        const { Event } = await import(new URL(`file://${eventPath}`, import.meta.url));
                        // Ensure that Event is a valid object
                        if (Event && typeof Event.run === 'function') {
                            return { Event, eventPath };
                        } else {
                            console.warn(`Invalid event structure in file: ${eventPath}`);
                            return null;
                        }
                    } catch (error) {
                        console.error(`Failed to load event from file: ${eventPath}`, error);
                        return null;
                    }
                })
        );

        // Register events and clean up references
        for (const entry of events) {
            if (!entry || !entry.Event || entry.Event.ignore) continue;

            const { Event } = entry;
            const eventFunction = (...args) => Event.run(client, ...args);

            // Store event handler reference for potential cleanup
            client[`_${Event.name}Handler`] = eventFunction;

            if (Event.runOnce) {
                client.once(Event.name, eventFunction);
            } else {
                client.on(Event.name, eventFunction);
            }
        }
    } catch (error) {
        console.error("Failed to read events directory:", error);
    }
};
