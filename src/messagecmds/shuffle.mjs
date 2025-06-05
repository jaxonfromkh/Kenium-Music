export const Command = {
    name: "shuffle",
    description: "Shuffle the music queue",
    options: [],
    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player || !message.member?.voice?.channel) return;
        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        if (player.queue.length < 2) {
            return message.reply({ content: "📭 Queue is too short to shuffle." });
        }

        player.shuffle();

        return message.reply({
            content: "🔀 Shuffled the queue.",
            flags: 64,
        });
    },
}