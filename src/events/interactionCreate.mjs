export const Event = {
    name: "interactionCreate",
    run: async(client, interaction) => {
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
    }
}
