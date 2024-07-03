export const Event = {
    name: "interactionCreate",
    run: async (client, interaction) => {
        try {
            switch (true) {
                case interaction.isChatInputCommand():
                    const command = client.slashCommands.get(interaction.commandName);
                    if (command) command.run(client, interaction);
                    break;
                case interaction.isButton():
                    const button = client.buttonCommands.get(interaction.customId);
                    if (button) button.run(client, interaction);
                    break;

                case interaction.isStringSelectMenu():
                    const selectMenuCommand = client.selectMenus.get(interaction.values[0]) ?? client.selectMenus.get(interaction.customId);
                    if (!selectMenuCommand) return;
                
                    selectMenuCommand.run(interaction, client);
                    break;
            }
        } catch (error) {
            if (error instanceof DiscordAPIError && error.code === 10062) {
                console.warn(`DiscordAPIError[10062]: Unknown interaction ${interaction.id}`);
            } else {
                console.error(error);
            }
        }
    }
}

