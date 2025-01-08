export const Command = {
    name: 'resume',
    description: 'resume the music',

    run: async (client, interaction) => {
        const { guild, member } = interaction;
        const player = client.aqua.players.get(guild.id);
        if (!player || !member.voice.channel) return;

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        player.pause(false);
        return interaction.reply({
            content: 'Resumed the music',
            flags: 64
        })
    }
}