import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const Command = {
    name: "queue",
    description: "Show the music queue",
    
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.reply("🔇 Nothing is currently playing.");
        }
        
        const userVoiceChannelId = interaction.member.voice.channelId;
        const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
        
        if (!userVoiceChannelId) {
            return interaction.reply("❌ You need to join a voice channel first.");
        }
        
        if (botVoiceChannelId && botVoiceChannelId !== userVoiceChannelId) {
            return interaction.reply("❌ You need to be in the same voice channel as the bot.");
        }

        try {
            return await handleShowQueue(client, interaction, player);
        } catch (error) {
            console.error("Queue command error:", error);
            return interaction.reply("⚠️ An error occurred while processing your request.");
        }
    }
};

function formatDuration(ms) {
    if (ms <= 0) return "0:00";
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function handleShowQueue(client, interaction, player) {
    const queueLength = player.queue.length;
    
    if (queueLength === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setTitle('🎵 Queue')
            .setDescription("📭 Queue is empty. Add some tracks!")
            .setColor(0x0a1931)
            .setTimestamp();
        return interaction.reply({ embeds: [emptyEmbed] });
    }
    
    const embed = createQueueEmbed(client, interaction, player, 1);
    const buttons = createPaginationButtons(interaction.user.id, 1, Math.ceil(queueLength / 10));
    
    await interaction.reply({ 
        embeds: [embed], 
        components: queueLength > 10 ? [buttons] : []
    });
    const message = await interaction.fetchReply();
    
    const collector = message.createMessageComponentCollector({ 
        time: 60000,
        filter: i => i.user.id === interaction.user.id && i.customId.startsWith('queue_')
    });
    
    collector.on('collect', async i => {
        try {
            await i.deferUpdate();
            
            const [, action] = i.customId.split('_');
            const currentPage = parseInt(i.message.embeds[0].footer.text.match(/Page (\d+)/)[1]);
            const maxPages = Math.ceil(player.queue.length / 10);
            
            let newPage = currentPage;
            
            switch (action) {
                case 'first': newPage = 1; break;
                case 'prev': newPage = Math.max(1, currentPage - 1); break;
                case 'next': newPage = Math.min(maxPages, currentPage + 1); break;
                case 'last': newPage = maxPages; break;
                case 'refresh': break;
            }
            
            const newEmbed = createQueueEmbed(client, interaction, player, newPage);
            const newButtons = createPaginationButtons(interaction.user.id, newPage, maxPages);
            
            await i.editReply({
                embeds: [newEmbed],
                components: player.queue.length > 10 ? [newButtons] : []
            });
            
            collector.resetTimer();
        } catch (error) {
            console.error("Button interaction error:", error);
        }
    });
    
    collector.on('end', async () => {
        try {
            await message.delete();
        } catch (error) {
            console.error("Failed to delete message:", error);
        }
    });
}

function createQueueEmbed(client, interaction, player, page) {
    const tracksPerPage = 10;
    const queueLength = player.queue.length;
    const maxPages = Math.ceil(queueLength / tracksPerPage);
    
    const validPage = Math.max(1, Math.min(page, maxPages));
    const startIndex = (validPage - 1) * tracksPerPage;
    const endIndex = Math.min(startIndex + tracksPerPage, queueLength);
    
    const currentTrack = player.current;
    
    let queueContent = [];
    
    if (currentTrack) {
        queueContent.push(`**▶️ Now Playing:**\n[${currentTrack.info.title}](${currentTrack.info.uri}) \`${formatDuration(currentTrack.info.length)}\``);
    }
    
    if (queueLength > 0) {
        queueContent.push("**Queue:**");
        
        const queueItems = player.queue.slice(startIndex, endIndex).map((track, i) => 
            `\`${startIndex + i + 1}.\` [${track.info.title}](${track.info.uri}) \`${formatDuration(track.info.length)}\``
        );
        
        queueContent = [...queueContent, ...queueItems];
        
        const totalDuration = player.queue.reduce((total, track) => total + track.info.length, 0);
        
        queueContent.push(`\n**Total:** ${queueLength} tracks • Duration: \`${formatDuration(totalDuration)}\``);
    }
    
    return new EmbedBuilder()
        .setTitle('🎵 Music Queue')
        .setDescription(queueContent.join('\n'))
        .setColor(0x0a1931)
        .setThumbnail(client.user.displayAvatarURL({ size: 64 }))
        .setFooter({ 
            text: `Page ${validPage}/${maxPages} • Kenium v3.2.1`, 
            iconURL: interaction.user.displayAvatarURL() 
        })
        .setTimestamp();
}

function createPaginationButtons(userId, currentPage, maxPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`queue_first_${userId}`)
            .setLabel('◀◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`queue_prev_${userId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`queue_refresh_${userId}`)
            .setLabel('🔄')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`queue_next_${userId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === maxPages),
        new ButtonBuilder()
            .setCustomId(`queue_last_${userId}`)
            .setLabel('▶▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === maxPages)
    );
}