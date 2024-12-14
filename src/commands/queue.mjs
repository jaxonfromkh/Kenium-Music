import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "queue",
    description: "Show the queue",
    options: [],

    run: async(client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);

        if (!player || player.queue.length === 0) {
            return interaction.reply({ content: player ? "Queue is empty" : "Nothing is playing", ephemeral: true });
        }

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        const queue = player.queue.slice(0, 5).map((track, i) => {
            const minutes = Math.floor(track.info.length / 60000);
            const seconds = Math.floor((track.info.length % 60000) / 1000);
            return `**${i + 1}** - [\`${track.info.title}\`](${track.info.uri}) - \`${minutes}:${seconds < 10 ? "0" : ""}${seconds}\``;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🎵  | Queue')
            .setDescription(queue)
            .setColor(0x000000)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Kenium v2.4.0 | by mushroom0162', iconURL: interaction.user.displayAvatarURL() });

        try {
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send queue embed:', error);
        }
    }
};

