export const Command = {
    name: "restart",
    description: "Restart the music",
    options: [],

    run: async (client, interaction) => {
        try {
            const vc = interaction.member?.voice?.channel;
            if (!vc) return;

            const player = client.aqua.players.get(interaction.guildId)

            if (!player) return;

            player.seek(0);

            return interaction.reply({ content: "Restarted the music", ephemeral: true });

        } catch (e) {
            console.log(e);
        }
        
    }
};