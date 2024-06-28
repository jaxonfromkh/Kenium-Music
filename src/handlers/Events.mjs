import { Filereader } from "./filereader.mjs";
import { pathToFileURL } from "url";


export const EventHandler = async (client, rootPath) => {
    const eventFiles = Filereader(`${rootPath}/src/events`);
    if (!eventFiles?.length) return; // check for null or empty array before proceeding

    const promises = [];
    for (const event of eventFiles) {
        promises.push(
            (async () => {
                try {
                    const { Event: clientEvent } = await import(pathToFileURL(event)) || {};
                    if (clientEvent) {
                        client.events?.set(clientEvent.name, clientEvent);
                        if (!clientEvent.ignore) {
                            if (clientEvent.customEvent) clientEvent.run(client);
                            else if (clientEvent.runOnce) client.once(clientEvent.name, (...args) => clientEvent.run(client, ...args));
                            else client.on(clientEvent.name, (...args) => clientEvent.run(client, ...args));
                        }
                    }
                }
                catch (error) {
                    console.error(error);
                    throw error; // re-throw the error to see the stack trace
                }
            })()
        );
    }
    await Promise.allSettled(promises);
}
