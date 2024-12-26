import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { Filereader } from "./filereader.mjs";

export const CommandHandler = async (client, rootPath) => {
    const loadErrors = [];
    try {
        const allFiles = await Filereader(`${rootPath}/src/commands`);
        const rest = new REST({ version: "10" }).setToken(token);
        const commandsArray = [];

        const commandImports = allFiles.map(commandFile => 
            import(`file://` + commandFile).catch(error => {
                loadErrors.push(`Failed to import ${commandFile}: ${error.message}`);
                return null; 
            })
        );

        const commandModules = (await Promise.all(commandImports)).filter(m => m && m.Command && !m.Command.ignore && m.Command.name && m.Command.description);
        for (const { Command } of commandModules) {
            client.slashCommands.set(Command.name, Command);
            commandsArray.push({
                name: Command.name,
                description: Command.description,
                type: 1,
                options: Command.options ?? []
            });
        }
    
        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationCommands(id), { body: commandsArray });
        console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
    } catch (error) {
        console.error("Failed to refresh application commands:", error);
        throw error;
    }
};