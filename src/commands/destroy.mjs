export const Command = {
    name: "destroy",
    description: 'destroy the music',
    options: [],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !interaction.member?.voice?.channel) return;
        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
        
        player.destroy()
        await interaction.reply({
            content: "Destroyed the music",
            flags: 64,
        })
    }
}