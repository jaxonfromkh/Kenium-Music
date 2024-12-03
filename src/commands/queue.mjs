import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "queue",
    description: "Show the queue",
    options: [],

    run: async(client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        
        if (!player) return interaction.reply({ content: "Nothing is playing", ephemeral: true });

        const formatTime = (time) => {
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
        };

        if (player.queue.length === 0) return interaction.reply({ content: "Queue is empty", ephemeral: true });

        const queue = player.queue.map((track, i) => `**${i + 1}** - [\`${track.info.title}\`](${track.info.uri}) - \`${formatTime(Math.round(track.info.length / 1000))}\``).slice(0, 5).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('🎵  | Queue')
            .setDescription(queue)
            .setColor(0x000000)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Toddys Music v2.3.0 | by mushroom0162', iconURL: interaction.user.displayAvatarURL() });

        try {
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send queue embed:', error);
        }
    }
};
