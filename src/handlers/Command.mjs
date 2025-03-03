import 'dotenv/config';
import { REST, Routes } from "discord.js";
import { FilereaderGenerator } from "./filereader.mjs";

const token = process.env.token;
const id = process.env.id;

class CommandHandler {
    constructor(client, rootPath) {
        this.client = client;
        this.rootPath = rootPath;
        this.rest = new REST({ version: "10" }).setToken(token);
        this.commandsDir = `${rootPath}/src/commands`;
    }

    async loadCommands() {
        const commands = [];
        for await (const file of FilereaderGenerator(this.commandsDir)) {
            const command = await this.loadCommand(file);
            if (command) commands.push(command);
        }
        return commands;
    }

    async loadCommand(commandFile) {
        try {
            const { Command } = await import(`file://${commandFile}`);
            if (!Command?.name || !Command?.description || Command?.ignore) return null;
            
            this.client.slashCommands.set(Command.name, Command);
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
    }

    async refreshCommands() {
        try {
            const commandsArray = await this.loadCommands();
            console.log(`Refreshing ${commandsArray.length} application (/) commands...`);
            await this.rest.put(Routes.applicationCommands(id), { body: commandsArray });
            console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
        } catch (error) {
            console.error("Failed to refresh application commands:", error);
            throw error;
        }
    }
}

export { CommandHandler };
