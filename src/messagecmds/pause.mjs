export const Command = {
    name: "pause",
    description: "Pause the current playing song",

    run: async (client, message) => { 
        const { guild, member } = message;
        const player = client.aqua.players.get(guild.id);
        if (!player || !member.voice.channel) return;

        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        player.pause(true);

        return message.reply({
            content: 'Paused the song',
            flags: 64
        })
    }
}
