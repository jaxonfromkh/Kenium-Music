export const Command = {
    name: 'resume',
    description: 'resume the music',

    run: async (client, message) => { 
        const { guild, member } = message;
        const player = client.aqua.players.get(guild.id);
        if (!player || !member.voice.channel) return;

        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        player.pause(false);
        return message.reply({
            content: 'Resumed the music',
            flags: 64
        })
    }
}