export const Event = {
    name: "interactionCreate",
    run: async (client, interaction) => {
        let command;
        try {
            if (interaction.isChatInputCommand()) {
                command = client.slashCommands?.get(interaction.commandName);
            } else if (interaction.isButton()) {
                command = client.buttonCommands.get(interaction.customId);
            } else if (interaction.isStringSelectMenu()) {
                command = client.selectMenus.get(interaction.values[0] ?? interaction.customId);
            }

            if (command) {
                await command.run(client, interaction);
            }
        } catch (error) {
            console.error("Error handling interaction:", error);
        } finally {
            if (global.gc) {
                global.gc();
            }
        }
    }
};