export const Event = {
    name: "interactionCreate",
    async run(client, interaction) {
        try {
            const command = (
                client.slashCommands?.get(interaction.commandName) ||
                client.buttonCommands.get(interaction.customId) ||
                (interaction.isStringSelectMenu() &&
                    (client.selectMenus.get(interaction.customId) ||
                        client.selectMenus.get(interaction.values[0])))
            );
            if (command) {
                await command.run(client, interaction);
            }
        } catch (error) {
            console.error("Error handling interaction:", error);
        }
    },
};


