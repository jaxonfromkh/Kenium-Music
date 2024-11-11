export const Command = {
    name: 'resume',
    description: 'resume the music',

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
        const player = client.manager.players.get(interaction.guildId)
        if (!player) return;
        if (player.paused) return;
        const { guild, channel } = interaction;

        const lol = guild.channels.cache
            .filter((chnl) => chnl.type == 2)
            .find((channel) => channel.members.has(client.user.id));
        if (lol && vc.id !== lol.id)
            return interaction.reply({
                content: `im already on <#${lol.id}>`,
                ephemeral: true,
            });

        player.pause(false);
        return interaction.reply({
            content: 'Resumed the music',
            ephemeral: true
        })
    }
}