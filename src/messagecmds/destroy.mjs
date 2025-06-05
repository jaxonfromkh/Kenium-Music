export const Command = {
    name: "destroy",
    description: 'destroy the music',
    options: [],
    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player || !message.member?.voice?.channel) return;
        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;
        
        player.destroy()
        await message.reply({
            content: "Destroyed the music",
            flags: 64,
        })
    }
}