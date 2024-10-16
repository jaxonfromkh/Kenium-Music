export const Command = {
    name: 'resume',
    description: 'resume the music',
    options: [],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
        const player = client.manager.players.get(interaction.guildId)
        if (!player) return;
        if (!player.paused) return;
        const { guild, channel } = interaction;

        const lol = guild.channels.cache
            .filter((chnl) => chnl.type == 2)
            .find((channel) => channel.members.has(client.user.id));
        if (lol && vc.id !== lol.id)
            return interaction.reply({
                content: `im already on <#${lol.id}>`,
                ephemeral: true,
            });

        player.pause();
        return interaction.reply({
            content: 'paused the music',
            ephemeral: true
        })
    }
}