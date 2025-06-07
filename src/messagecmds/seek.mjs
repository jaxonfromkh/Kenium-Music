export const Command = {
    name: "seek",
    description: "Seek to a specific position in the song",
    options: [
        {
            name: "position",
            description: "The position in seconds to seek to",
            type: 4,
            required: true,
        },
    ],
    run: async (client, message) => { 
        const { guild, member } = message;
        const vc = member?.voice?.channel;
        if (!vc || guild.members.me.voice.channelId !== vc.id) return;

        const args = message.content.split(" ").slice(1);
        if (args.length === 0) {
            return message.reply({ content: "Please provide a position in seconds to seek to", flags: 64 });
        }

        const player = client.aqua.players.get(guild.id);
        if (!player) return;

        const position = Number(args[0]);
        if (isNaN(position)) return message.reply({ content: "Invalid position", flags: 64 });

        player.seek(position * 1000);

        return message.reply({ content: `Seeked to ${position} seconds`, flags: 64 });
    }
}


