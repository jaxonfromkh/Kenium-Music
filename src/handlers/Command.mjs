import 'dotenv/config';
import { REST, Routes } from "discord.js";
import glob from 'tiny-glob';

const token = process.env.token;
const id = process.env.id;

class CommandHandler {
    constructor(client, rootPath) {
        this.client = client;
        this.rootPath = rootPath;
        this.rest = new REST({ version: "10" }).setToken(token);
        this.commandsDir = `${rootPath}/src/commands`;
        this.slashCommands = new Map();
    }

    async loadCommands() {
        const files = await glob('**/*.mjs', {
            cwd: this.commandsDir,
            absolute: true,
            onlyFiles: true,
            followSymbolicLinks: false,
            concurrency: 50
        });

        const commandPromises = files.map(file => this.loadCommand(file));
        const commandResults = await Promise.all(commandPromises);
        
        return commandResults.filter(cmd => cmd !== null);
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
            
            const BATCH_SIZE = 50;
            if (commandsArray.length > BATCH_SIZE) {
                for (let i = 0; i < commandsArray.length; i += BATCH_SIZE) {
                    const batch = commandsArray.slice(i, i + BATCH_SIZE);
                    await this.rest.put(Routes.applicationCommands(id), { body: batch });
                    console.log(`Registered batch ${i/BATCH_SIZE + 1} (${batch.length} commands)`);
                }
            } else {
                await this.rest.put(Routes.applicationCommands(id), { body: commandsArray });
            }
            
            console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
            
            return commandsArray.length;
        } catch (error) {
            console.error("Failed to refresh application commands:", error);
            throw error;
        }
    }
}

export { CommandHandler };