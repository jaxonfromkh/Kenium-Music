export const Event = {
    name: "interactionCreate",
    run: async (client, interaction) => {
        try {
            const command = interaction.isChatInputCommand() ? client.slashCommands.get(interaction.commandName) :
            interaction.isButton() ? client.buttonCommands.get(interaction.customId) :
            interaction.isStringSelectMenu() ? client.selectMenus.get(interaction.values[0] ?? interaction.customId) : null;

            if (command) command.run(client, interaction);
        } catch (error) {
            console.log(error);
        }
    }
}

