export const Event = {
    name: "interactionCreate",
    run: async(client, interaction) => {
        switch (true) {
            case interaction.isChatInputCommand():
                const command = client.slashCommands.get(interaction.commandName);
                if (command) command.run(client, interaction);
                break;
        }
    }
}