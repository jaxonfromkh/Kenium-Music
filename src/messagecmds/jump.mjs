export const Command = {
    name: "jump",
    description: "Jump to a specific position or song in the queue",
    usage: "!jump <position|song name>",
    run: async (client, message, args) => {
        const player = client.aqua.players.get(message.guild.id);

        if (!player || message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        if (!args.length) {
            return message.reply("Please provide either a position or a song name.");
        }

        const queueLength = player.queue.length;
        const firstArg = args[0];
        const position = parseInt(firstArg, 10);

        // Handle position-based jumping
        if (!isNaN(position)) {
            if (position < 1 || position > queueLength) {
                return message.reply(`Position must be between 1 and ${queueLength}`);
            }
            player.queue.splice(0, position - 1);
            player.stop();
            return message.reply(`Jumped to song ${position}`);
        }

        // Handle name-based jumping
        const name = args.join(" ");
        const songIndex = player.queue.findIndex(song => song.info.title === name);

        if (songIndex === -1) {
            return message.reply(`Couldn't find "${name}" in the queue`);
        }

        player.queue.splice(0, songIndex);
        player.stop();
        return message.reply(`Jumped to "${name}"`);
    },
};
