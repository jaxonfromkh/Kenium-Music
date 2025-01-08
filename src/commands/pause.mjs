export const Command = {
    name: "pause",
    description: "Pause the current playing song",

    run: async (client, interaction) => {
        const { guild, member } = interaction;
        const player = client.aqua.players.get(guild.id);
        if (!player || !member.voice.channel) return;

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        player.pause(true);

        return interaction.reply({
            content: 'Paused the song',
            flags: 64
        })
    }
}
