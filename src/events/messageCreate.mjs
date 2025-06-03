export const Event = {
    name: "messageCreate",
    async run(client, message) {
        try {
            // Ignore messages from bots or without the prefix
            const prefix = "kk!";
            if (message.author.bot || !message.content.startsWith(prefix)) return;

            // Parse command and args
            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            // Get command from collection
            const command = client.messageCommands.get(commandName);
            if (!command) return;

            // Run the command
            await command.run(client, message);
        } catch (error) {
            console.error(`Error handling message command:`, error);
        }
    },
};
