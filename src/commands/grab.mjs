import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "grab",
    description: "Grab a song from the queue, and send to DM",
    options: [],

    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !interaction.member.voice.channel || interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
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
            await interaction.user.send({ embeds: [trackEmbed], content: `from ${interaction.guild.name}` });
            return interaction.reply({ content: "I've sent you the track details in your DMs.", flags: 64 });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: "I couldn't send you a DM. Please check your privacy settings.", flags: 64 });
        }

    }
}
