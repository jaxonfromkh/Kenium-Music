
export const Command = {
    name: "skip",
    description: "Skip the current playing song",
    options: [],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;

        const player = client.aqua.players.get(interaction.guildId)


        if (!player || player.queue.size == 0) {
            return interaction.reply({ content: player ? "No song to skip" : "Nothing is playing", flags: 64 });
        }

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        player.skip()

        return interaction.reply(`Skipped the current track`)

    },
}