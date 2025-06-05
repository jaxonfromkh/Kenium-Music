import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "clear",
    description: "Clear the music queue",
    options: [],
    
    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player || !message.member?.voice?.channel) return;

        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        const queueLength = player.queue.length;
    
        if (queueLength === 0) {
            return message.reply({ content: "📭 Queue is already empty."});
        }

        const clearedCount = player.queue.length;
        player.queue.length = 0;

        const embed = new EmbedBuilder()
        .setTitle('🧹 Queue Cleared')
        .setDescription(`Cleared ${clearedCount} tracks from the queue.`)
        .setColor(15105570)
        .setTimestamp();
    
        return message.reply({ embeds: [embed] });

    },
};