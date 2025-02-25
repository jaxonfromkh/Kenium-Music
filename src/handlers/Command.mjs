import { REST, Routes } from "discord.js";
import { token, id } from "../../config.mjs";
import { FilereaderGenerator } from "./filereader.mjs";

class CommandHandler {
    constructor(client, rootPath) {
        this.client = client;
        this.rootPath = rootPath;
        this.rest = new REST({ version: "10" }).setToken(token);
        this.commandsDir = `${rootPath}/src/commands`;
    }

    async loadCommands() {
        const commandFiles = [];
        for await (const file of FilereaderGenerator(this.commandsDir)) {
            commandFiles.push(file);
        }
        const commands = await Promise.all(
            commandFiles.map(this.loadCommand.bind(this))
        );
        
        return commands.filter(Boolean);
    }

    async loadCommand(commandFile) {
        try {
            const { Command } = await import(`file://${commandFile}`);
            
            const { 
                name, 
                description, 
                ignore, 
                options = [], 
                autocomplete = false 
            } = Command || {};
            
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
            
            console.log(`Refreshing ${commandsArray.length} application (/) commands...`);
            
            await this.rest.put(
                Routes.applicationCommands(id), 
                { body: commandsArray }
            );
            
            console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
        } catch (error) {
            console.error("Failed to refresh application commands:", error);
            throw error;
        }
    }
}

export { CommandHandler };
