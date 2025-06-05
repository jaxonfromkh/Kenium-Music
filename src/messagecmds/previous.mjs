export const Command = {
    name: 'previous',
    description: 'Play the previous song',
    options: [],
    run: async(client, message) => {
        const player = client.aqua.players.get(message.guild.id);
        if (!player || !message.member.voice.channel) return;

        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        player.queue.unshift(player.previous);
        player.stop();
        return message.reply({
            content: 'Playing the previous song',
            flags: 64
        })
    }
}