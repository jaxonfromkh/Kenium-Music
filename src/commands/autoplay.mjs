export const Command = {
    name: "autoplay",
    description: "Toggle autoplay",
    options: [],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guild.id);

        if (!player) return interaction.reply({ content: "Nothing is playing", flags: 64 });

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
            return interaction.reply({ content: "You must be in the same voice channel as the bot.", flags: 64 });
        }

        const newState = !player.isAutoplayEnabled;
        player.setAutoplay(newState);

        return interaction.reply({
            content: `Autoplay has been **${newState ? "enabled" : "disabled"}**.`,
            flags: 64
        });
    }
};
