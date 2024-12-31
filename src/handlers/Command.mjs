import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { Filereader } from "./filereader.mjs";

export const CommandHandler = async (client, rootPath) => {
    const loadErrors = [];
    try {
        const allFiles = await Filereader(`${rootPath}/src/commands`);
        const rest = new REST({ version: "10" }).setToken(token);
        const commandsArray = [];

        await Promise.all(allFiles.map(async (commandFile) => {
            try {
                const module = await import(`file://` + commandFile);
                if (module.Command && !module.Command.ignore && module.Command.name && module.Command.description) {
                    commandsArray.push({
                        name: module.Command.name,
                        description: module.Command.description,
                        type: 1,
                        options: module.Command.options ?? []
                    });
                    client.slashCommands.set(module.Command.name, module.Command);
                }
            } catch (error) {
                loadErrors.push(`Failed to import ${commandFile}: ${error.message}`);
            }
        }));

        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationCommands(id), { body: commandsArray });
        console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
        
    } catch (error) {
        console.error("Failed to refresh application commands:", error);
        throw error;
    }
};
