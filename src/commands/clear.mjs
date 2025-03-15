import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "clear",
    description: "Clear the music queue",
    options: [],
    
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !interaction.member?.voice?.channel) return;

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        const queueLength = player.queue.length;
    
        if (queueLength === 0) {
            return interaction.reply({ content: "📭 Queue is already empty."});
        }

        const clearedCount = player.queue.length;
        player.queue.length = 0;

        const embed = new EmbedBuilder()
        .setTitle('🧹 Queue Cleared')
        .setDescription(`Cleared ${clearedCount} tracks from the queue.`)
        .setColor(15105570)
        .setTimestamp();
    
        return interaction.reply({ embeds: [embed] });

    },
};
