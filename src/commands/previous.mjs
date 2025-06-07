export const Command = {
    name: 'previous',
    description: 'Play the previous song',
    options: [],
    run: async(client, interaction) => {
        const player = client.aqua.players.get(interaction.guild.id);
        if (!player || !interaction.member.voice.channel) return;

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        player.queue.unshift(player.previous);
        player.stop();
        return interaction.reply({
            content: 'Playing the previous song',
            flags: 64
        })
    }
}