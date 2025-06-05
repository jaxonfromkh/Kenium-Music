export const Event = {
    name: "messageCreate",
    async run(client, message) {
        try {

            const prefix = "kk!";
            if (message.author.bot || !message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const command = client.messageCommands.get(commandName);
            if (!command) return;

            await command.run(client, message);

        } catch (error) {
            console.error(`Error handling message command:`, error);
        }
    },
};
