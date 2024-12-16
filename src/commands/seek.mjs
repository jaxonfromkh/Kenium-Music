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
    run: async (client, interaction) => {
        const { guild, member } = interaction;
        const vc = member?.voice?.channel;
        if (!vc || guild.members.me.voice.channelId !== vc.id) return;

        const player = client.aqua.players.get(guild.id);
        if (!player) return;

        const position = interaction.options.getInteger("position");
        player.seek(position * 1000);

        return interaction.reply({ content: `Seeked to ${position} seconds`, ephemeral: true });
    }
}

