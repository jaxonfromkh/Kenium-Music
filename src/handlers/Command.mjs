import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { Filereader } from "./filereader.mjs";

export const CommandHandler = async (client, rootPath) => {
    if (!client || !rootPath) {
        throw new Error('Client and rootPath are required parameters');
    }

    const rest = new REST({ version: "10" }).setToken(token);
    try {
        // Get files once and store in memory
        const allFiles = await Filereader(`${rootPath}/src/commands`);
        
        // Process commands in batches to prevent memory spikes
        const BATCH_SIZE = 50;
        const commands = [];
        
        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            const batch = allFiles.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(async (commandFile) => {
                    try {
                        const module = await import(`file://${commandFile}`);
                        return module.Command;
                    } catch (err) {
                        console.warn(`Failed to load command from ${commandFile}:`, err);
                        return null;
                    }
                })
            );

            // Process valid commands
            for (const Command of batchResults) {
                if (!Command || Command.ignore || !Command.name || !Command.description) continue;

                // Set command in client
                client.slashCommands?.set(Command.name, Command);

                // Add to commands array for registration
                commands.push({
                    name: Command.name,
                    description: Command.description,
                    type: 1,
                    options: Command.options ?? []
                });
            }
        }

        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationCommands(id), { body: commands });
        console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
        
        // Clear references to prevent memory leaks
        commands.length = 0;

    } catch (error) {
        console.error("Failed to refresh application commands:", error);
        throw error; // Re-throw to handle it in the calling code
    }
};
