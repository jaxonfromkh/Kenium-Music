    import 'dotenv/config';
    import { REST, Routes } from "discord.js";
    import fg from 'fast-glob';

    const token = process.env.token;
    const id = process.env.id;

    class CommandHandler {
        constructor(client, rootPath) {
            this.client = client;
            this.rootPath = rootPath;
            this.rest = new REST({ version: "10" }).setToken(token);
            this.commandsDir = `${rootPath}/src/commands`;
            this.messageCommandsDir = `${rootPath}/src/messagecmds`;
        }

        async loadCommands() {
            const files = await fg('**/*.mjs', {
                cwd: this.commandsDir,
                absolute: true,
                onlyFiles: true,
                followSymbolicLinks: false,
            });

            const commands = [];
            this.client.slashCommands = new Map();

            for (const file of files) {
                const cmd = await this.loadCommand(file);
                if (cmd) commands.push(cmd);
            }

            // Load message commands as well
            await this.loadMessageCommands();

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
                    autocomplete: !!Command.autocomplete,
                };
            } catch (err) {
                console.error(`Error loading command from ${commandFile}:`, err);
                return null;
            }
        }

        async loadMessageCommands() {
            if (process.env.PREFIX_ENABLED !== 'true') return console.log("Message commands loading is disabled.");
            console.log("Loading message commands...");
            const files = await fg('**/*.mjs', {
                cwd: this.messageCommandsDir,
                absolute: true,
                onlyFiles: true,
                followSymbolicLinks: false,
            });

            this.client.messageCommands = new Map();

            for (const file of files) {
                try {
                    const { Command } = await import(`file://${file}`);
                    if (!Command?.name || Command?.ignore) continue;
                    this.client.messageCommands.set(Command.name, Command);
                } catch (err) {
                    console.error(`Error loading message command from ${file}:`, err);
                }
            }
        }

        async refreshCommands() {
            try {
                const commandsArray = await this.loadCommands();
                console.log(`Refreshing ${commandsArray.length} application (/) commands...`);

                await this.rest.put(Routes.applicationCommands(id), { body: commandsArray });

                console.log(`Successfully reloaded ${commandsArray.length} application (/) commands.`);
                return commandsArray.length;
            } catch (error) {
                console.error("Failed to refresh application commands:", error);
                throw error;
            }
        }
    }

    export { CommandHandler };
