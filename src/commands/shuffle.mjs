export const Command = {
    name: "shuffle",
    description: "Shuffle the music queue",
    options: [],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !interaction.member?.voice?.channel) return;
        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        if (player.queue.length < 2) {
            return interaction.reply({ content: "📭 Queue is too short to shuffle." });
        }

        player.shuffle();

        return interaction.reply({
            content: "🔀 Shuffled the queue.",
            flags: 64,
        });
    },
}