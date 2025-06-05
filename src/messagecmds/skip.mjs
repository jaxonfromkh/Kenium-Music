
export const Command = {
    name: "skip",
    description: "Skip the current playing song",
    options: [],

    run: async (client, message) => { 
        const vc = message.member?.voice?.channel;
        if (!vc) return;

        const player = client.aqua.players.get(message.guildId)

        if (!player || player.queue.size == 0) {
            return message.reply({ content: player ? "No song to skip" : "Nothing is playing", flags: 64 });
        }

        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        player.skip()

        return message.reply(`Skipped the current track`)
    },
}