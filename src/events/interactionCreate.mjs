export const Event = {
    name: "interactionCreate",
    async run(client, interaction) {
        try {
            if (interaction.isAutocomplete()) {
                const command = client.slashCommands.get(interaction.commandName);
                if (command?.autocomplete) {
                    await command.autocomplete(client, interaction);
                }
                return;
            }

            const command = interaction.isStringSelectMenu()
                ? client.selectMenus.get(interaction.customId) || client.selectMenus.get(interaction.values[0])
                : client.slashCommands.get(interaction.commandName);

            if (!command) return;
            await command.run(client, interaction);
        } catch (error) {
            console.error(`Error handling interaction ${interaction.commandName}:`, error);
        }
    },
};
