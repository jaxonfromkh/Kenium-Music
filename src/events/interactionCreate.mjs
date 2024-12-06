export const Event = {
    name: "interactionCreate",
    run: async (client, interaction) => {
        try {
            let command;
            
            if (interaction.isChatInputCommand()) {
                command = client.slashCommands?.get(interaction.commandName);
            } else if (interaction.isButton()) {
                command = client.buttonCommands.get(interaction.customId);
            } else if (interaction.isStringSelectMenu()) {
                command = client.selectMenus.get(interaction.customId) || client.selectMenus.get(interaction.values[0]);
            }

            if (command) {
                await command.run(client, interaction);
            }
        } catch (error) {
            console.error("Error handling interaction:", error);
        }
    }
};
