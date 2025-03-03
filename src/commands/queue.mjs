import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "queue",
    description: "Manage the music queue",
    options: [
        {
            name: "show",
            description: "Show the current queue",
            type: 1,
            options: [
                {
                    name: "page",
                    description: "Page number to display (5 tracks per page)",
                    type: 4,
                    required: false,
                }
            ]
        },
        {
            name: "remove",
            description: "Remove a track from the queue",
            type: 1,
            options: [
                {
                    name: "track_number",
                    description: "The number of the track to remove",
                    type: 4,
                    required: true,
                    autocomplete: true,
                },
            ],
        },
        {
            name: "clear",
            description: "Clear the entire queue",
            type: 1,
        },
    ],
    
    async autocomplete(client, interaction) {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player?.queue?.length) {
            return interaction.respond([]);
        }
        
        const focusedValue = interaction.options.getFocused().toString().toLowerCase();
        
        const choices = player.queue
            .slice(0, 25)
            .map((track, index) => ({
                name: formatTrackName(`${index + 1}: ${track.info.title}`),
                value: index + 1,
            }))
            .filter(choice => !focusedValue || choice.name.toLowerCase().includes(focusedValue));

        return interaction.respond(choices.slice(0, 25));
    },
    
    run: async (client, interaction) => {
        await interaction.deferReply({ flags: 64 });
        
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.editReply("🔇 Nothing is currently playing.");
        }
        
        const userVoiceChannelId = interaction.member.voice.channelId;
        const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
        
        if (!userVoiceChannelId) {
            return interaction.editReply("❌ You need to join a voice channel first.");
        }
        
        if (botVoiceChannelId && botVoiceChannelId !== userVoiceChannelId) {
            return interaction.editReply("❌ You need to be in the same voice channel as the bot.");
        }

        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case "show":
                    return await handleShowQueue(client, interaction, player);
                
                case "remove":
                    return await handleRemoveTrack(interaction, player);
                
                case "clear":
                    return await handleClearQueue(interaction, player);
                
                default:
                    return interaction.editReply("❓ Unknown command.");
            }
        } catch (error) {
            console.error("Queue command error:", error);
            return interaction.editReply("⚠️ An error occurred while processing your request.");
        }
    }
};

function formatTrackName(name) {
    return name.length <= 100 ? name : `${name.substring(0, 97)}...`;
}

function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function handleShowQueue(client, interaction, player) {
    const queueLength = player.queue.length;
    
    if (queueLength === 0) {
        return interaction.editReply("📭 Queue is empty.");
    }
    
    const page = interaction.options.getInteger("page") || 1;
    const tracksPerPage = 10;
    const maxPages = Math.ceil(queueLength / tracksPerPage);
    
    if (page < 1 || page > maxPages) {
        return interaction.editReply(`❌ Invalid page number. Please choose a page between 1 and ${maxPages}.`);
    }
    
    const startIndex = (page - 1) * tracksPerPage;
    const endIndex = Math.min(startIndex + tracksPerPage, queueLength);
    
    const currentTrack = player.current;
    let queueList = "";
    
    if (currentTrack) {
        queueList += `**▶️ Now Playing:** [${currentTrack.info.title}](${currentTrack.info.uri}) - \`${formatDuration(currentTrack.info.length)}\`\n\n`;
    }
    
    if (queueLength > 0) {
        queueList += player.queue.slice(startIndex, endIndex).map((track, i) => 
            `**${startIndex + i + 1}.** [${track.info.title}](${track.info.uri}) - \`${formatDuration(track.info.length)}\``
        ).join('\n');
        
        queueList += `\n\n**Total:** ${queueLength} tracks`;
        
        if (queueLength > tracksPerPage) {
            queueList += ` • Page ${page}/${maxPages}`;
        }
    }
    
    const totalDuration = player.queue.reduce((total, track) => total + track.info.length, 0);
    queueList += ` • Duration: \`${formatDuration(totalDuration)}\``;
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Music Queue')
        .setDescription(queueList)
        .setColor(0)
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 64 }))
        .setTimestamp()
        .setFooter({ 
            text: `Kenium v3.0.0 • Requested by ${interaction.user.tag}`, 
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
        });

    return interaction.editReply({ embeds: [embed] });
}

async function handleRemoveTrack(interaction, player) {
    const queueLength = player.queue.length;
    
    if (queueLength === 0) {
        return interaction.editReply("📭 Queue is empty.");
    }
    
    const trackNumber = interaction.options.getInteger("track_number");
    
    if (trackNumber < 1 || trackNumber > queueLength) {
        return interaction.editReply(`❌ Invalid track number. Please choose a number between 1 and ${queueLength}.`);
    }

    const trackIndex = trackNumber - 1;
    const removedTrack = player.queue[trackIndex];
    
    if (!removedTrack) {
        return interaction.editReply("❌ Could not find the specified track.");
    }
    
    player.queue.splice(trackIndex, 1);
    
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Track Removed')
        .setDescription(`Removed [${removedTrack.info.title}](${removedTrack.info.uri}) from the queue.`)
        .setColor(15548997)
        .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
}

async function handleClearQueue(interaction, player) {
    const queueLength = player.queue.length;
    
    if (queueLength === 0) {
        return interaction.editReply("📭 Queue is already empty.");
    }
    
    const clearedCount = player.queue.length;
    player.queue.length = 0;
    
    const embed = new EmbedBuilder()
        .setTitle('🧹 Queue Cleared')
        .setDescription(`Cleared ${clearedCount} tracks from the queue.`)
        .setColor(15105570)
        .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
}
