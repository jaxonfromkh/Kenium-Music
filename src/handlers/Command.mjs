import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { FilereaderGenerator } from "./filereader.mjs";
class CommandHandler {
    constructor(client, rootPath) {
        this.client = client;
        this.rootPath = rootPath;
        this.rest = new REST({ version: "10" }).setToken(token);
    }
    async loadCommands() {
        const commandsDir = `${this.rootPath}/src/commands`;
        const commandFiles = [];
        for await (const file of FilereaderGenerator(commandsDir)) {
            commandFiles.push(file);
        }
        const commandsPromises = commandFiles.map(file => this.loadCommand(file));
        const results = await Promise.all(commandsPromises);
        return results.filter(command => command !== null);
    }
    async loadCommand(commandFile) {
        try {
            const { Command } = await import("file://" + commandFile); 
            const { name, description, ignore, options = [], autocomplete = false } = Command || {};
            if (!name || !description || ignore) return null;
            this.client.slashCommands.set(name, Command);
            return {
                name,
                description,
                type: 1,
                options,
                autocomplete,
            };
        } catch (err) {
            console.error(`Error loading command from ${commandFile}:`, err);
            return null;
        }
    }
    async refreshCommands() {
        try {
            const commandsArray = await this.loadCommands();
            if (commandsArray.length) {
                console.log("Started refreshing application (/) commands.");
                await this.rest.put(Routes.applicationCommands(id), { body: commandsArray });
                console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
            }
        } catch (error) {
            console.error("Failed to refresh application commands:", error);
            throw error;
        }
    }
}
export { CommandHandler };
