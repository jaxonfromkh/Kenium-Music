import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { FilereaderGenerator } from "./filereader.mjs";

export const CommandHandler = async (client, rootPath) => {
    const rest = new REST({ version: "10" }).setToken(token);

    try {
        const commandsDir = `${rootPath}/src/commands`;
        const commandFiles = [];
        for await (const file of FilereaderGenerator(commandsDir)) {
            commandFiles.push(file);
        }

        const load = commandFiles.map(async (commandFile) => {
            try {
                const { Command } = await import(`file://${commandFile}`);
                if (!Command?.name || !Command?.description || Command?.ignore) return null;

                client.slashCommands.set(Command.name, Command);

                return {
                    name: Command.name,
                    description: Command.description,
                    type: 1,
                    options: Command.options || [],
                    autocomplete: Command.autocomplete || false,
                };
            } catch (err) {
                console.error(`Error loading command from ${commandFile}:`, err);
                return null;
            }
        });

        const commandsArray = (await Promise.all(load)).filter(Boolean);

        if (commandsArray.length) {
            console.log("Started refreshing application (/) commands.");
            await rest.put(Routes.applicationCommands(id), { body: commandsArray });
            console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
        }

    } catch (error) {
        console.error("Failed to refresh application commands:", error);
        throw error;
    }
};
