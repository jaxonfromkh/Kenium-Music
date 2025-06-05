import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "grab",
    description: "Grab a song from the queue, and send to DM",
    options: [],

    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player || !message.member.voice.channel || message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;
        const track = player.currenttrack
        const trackEmbed = new EmbedBuilder()
            .setTitle(`Now Playing: **${track.info.title}**`)
            .setDescription(`[Listen Here](${track.info.uri})`)
            .addFields(
                { name: "> ⏱️ Duration", value: `> \`${track.info.length / 1000} seconds\``, inline: true },
                { name: "> 👤 Author", value: `> \`${track.info.author}\``, inline: true },
            )
            .setColor(0x000000)
            .setThumbnail(track.info.artworkUrl);
        

        try {
            await message.author.send({ embeds: [trackEmbed], content: `from ${message.guild.name}` });
            return message.reply({ content: "I've sent you the track details in your DMs.", flags: 64 });
        } catch (error) {
            console.error(error);
            return message.reply({ content: "I couldn't send you a DM. Please check your privacy settings.", flags: 64 });
        }

    }
}


