export const Command = {
    name: "restart",
    description: "Restart the music",
    options: [],

    run: async (client, interaction) => {
        try {
            const vc = interaction.member?.voice?.channel;
            if (!vc) return;

            const player = client.aqua.players.get(interaction.guildId)
            if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

            if (!player) return;

            player.replay();

            return interaction.reply({ content: "Restarted the music", ephemeral: true });

        } catch (e) {
            console.log(e);
        }
        
    }
};
