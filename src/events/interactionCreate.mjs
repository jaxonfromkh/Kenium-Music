export const Event = {
    name: "interactionCreate",
    run: async (client, interaction) => {
        try {
            const command = (() => {
                switch (true) {
                    case interaction.isChatInputCommand():
                        return client.slashCommands?.get(interaction.commandName);
                    case interaction.isButton():
                        return client.buttonCommands.get(interaction.customId);
                    case interaction.isStringSelectMenu():
                        return client.selectMenus.get(interaction.customId) || client.selectMenus.get(interaction.values[0]);
                    default:
                        return null;
                }
            })();

            if (command) {
                await command.run(client, interaction);
            }
        } catch (error) {
            console.error("Error handling interaction:", error);
        }
    }
};
