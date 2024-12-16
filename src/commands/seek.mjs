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
        const vc = interaction.member?.voice?.channel;
        const position = interaction.options.getInteger("position");
        if (!vc) return;
        const player = client.aqua.players.get(interaction.guildId)
        if (!player) return;
        player.seek(position * 1000);
        return interaction.reply({ content: `Seeked to ${position} seconds`, ephemeral: true });
    }
}

