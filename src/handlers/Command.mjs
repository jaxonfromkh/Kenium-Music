import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { Filereader } from "./filereader.mjs";

export const CommandHandler = async (client, rootPath) => {
    try {
        const allFiles = await Filereader(`${rootPath}/src/commands`);
        const rest = new REST({ version: "10" }).setToken(token);

        const commandModules = await Promise.allSettled(allFiles.map(async (commandFile) => {
            try {
                const { Command } = await import(`file://` + commandFile);
                return { Command, commandFile };
            } catch (error) {
                console.error(`Failed to import command file ${commandFile}:`, error);
                return null;
            }
        }));

        const commandsArray = commandModules
            .filter(result => result && result.status === 'fulfilled' && result.value.Command)
            .map(({ value: { Command } }) => {
                if (Command && !Command.ignore && Command.name && Command.description) {
                    client.slashCommands?.set(Command.name, Command);
                    return {
                        name: Command.name,
                        description: Command.description,
                        type: 1,
                        options: Command.options ?? []
                    };
                }
                return null;
            })
            .filter(Boolean);

        if (commandsArray.length > 0) {
            console.log("Started refreshing application (/) commands.");
            await rest.put(
                Routes.applicationCommands(id),
                { body: commandsArray }
            );
            console.log("Successfully reloaded application (/) commands.");
        } else {
            console.log("No valid commands found to reload.");
        }
    } catch (error) {
        console.error("Failed to refresh application commands:", error);
    }
};
