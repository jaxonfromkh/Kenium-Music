import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { Filereader } from "./filereader.mjs";

export const CommandHandler = async (client, rootPath) => {
    const loadErrors = [];
    try {
        const allFiles = await Filereader(`${rootPath}/src/commands`);
        const rest = new REST({ version: "10" }).setToken(token);
        const commandsArray = [];

        // Use Promise.all to handle imports in parallel
        await Promise.all(allFiles.map(async (commandFile) => {
            try {
                const module = await import(`file://${commandFile}`);
                const { Command } = module;

                // Validate command structure
                if (Command && !Command.ignore && Command.name && Command.description) {
                    commandsArray.push({
                        name: Command.name,
                        description: Command.description,
                        type: 1,
                        options: Command.options ?? [],
                        autocomplete: Command.autocomplete ?? false,
                    });
                    client.slashCommands.set(Command.name, Command);
                }
            } catch (error) {
                loadErrors.push(`Failed to import ${commandFile}: ${error.message}`);
            }
        }));

        // Log the number of commands to be registered
        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationCommands(id), { body: commandsArray });
        console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);

        // Log any loading errors that occurred
        if (loadErrors.length) {
            console.error("There were errors loading some commands:", loadErrors.join('\n'));
        }
    } catch (error) {
        console.error("Failed to refresh application commands:", error);
        throw error; // Rethrow to handle it upstream if necessary
    }
};