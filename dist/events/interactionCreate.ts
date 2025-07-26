import { createEvent, Container } from 'seyfert';

// Constants optimized for performance
const PROGRESS_CHARS = ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████', '███████████', '████████████'];
const MAX_TITLE_LENGTH = 60;
const VOLUME_STEP = 10;
const MAX_VOLUME = 100;
const MIN_VOLUME = 0;

// Pre-compiled regex for better performance
const EXCLUDED_INTERACTIONS = /^(?:queue_|select_|platform_|lyrics_|add_more_|add_track_|edit_description_|remove_track_|playlist_(?:next|prev)_|(?:create|manage|view|shuffle|play)_playlist_)/;

// Optimized constants
const VOLUME_ICONS = ['🔇', '🔈', '🔉', '🔊'];
const LOOP_ICONS = Object.freeze({ track: '🔂', queue: '🔁', none: '▶️' });

// Optimized time formatting with bitwise operations
const formatTime = (ms) => {
    const totalSeconds = (ms / 1000) | 0;
    const hours = (totalSeconds / 3600) | 0;
    const minutes = ((totalSeconds % 3600) / 60) | 0;
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Optimized text truncation
const truncateText = (text, length = MAX_TITLE_LENGTH) => 
    text?.length > length ? `${text.slice(0, length - 3)}...` : text || '';

// Optimized volume icon selection
const getVolumeIcon = (volume) => 
    VOLUME_ICONS[volume === 0 ? 0 : volume < 30 ? 1 : volume < 70 ? 2 : 3];

// Optimized embed creation with minimal object allocation
const createEmbed = (player, track, client) => {
    const { position, volume, loop } = player;
    const { title, uri, length } = track;
    
    const progress = Math.min(12, Math.max(0, ((position / length) * 12) | 0));
    const progressBar = PROGRESS_CHARS[progress];
    const remainingBar = '▬'.repeat(12 - progress);
    
    const volIcon = getVolumeIcon(volume);
    const loopIcon = LOOP_ICONS[loop] || '▶️';
    const requester = track.requester?.username || 'Unknown';
    const isPaused = player.paused;

    return new Container({
        components: [
            {
                type: 9,
                components: [
                    {
                        type: 10,
                        content: `### [${truncateText(title)}](${uri})`
                    },
                    {
                        type: 10,
                        content: `\`${formatTime(position)}\` \`[${progressBar}⦿${remainingBar}]\` \`${formatTime(length)}\`\n\n${volIcon} \`${volume}%\` ${loopIcon} \`${requester}\``
                    }
                ],
                accessory: {
                    type: 11,
                    media: {
                        url: track.thumbnail || client.me?.avatarURL({ extension: 'png' }) || ''
                    }
                }
            },
            {
                type: 14,
                divider: true,
                spacing: 2
            },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        label: "🔉",
                        style: 1,
                        custom_id: "volume_down"
                    },
                    {
                        type: 2,
                        label: "⏮️",
                        style: 1,
                        custom_id: "previous"
                    },
                    {
                        type: 2,
                        label: isPaused ? "▶️" : "⏸️",
                        style: isPaused ? 3 : 1,
                        custom_id: isPaused ? "resume" : "pause"
                    },
                    {
                        type: 2,
                        label: "⏭️",
                        style: 1,
                        custom_id: "skip"
                    },
                    {
                        type: 2,
                        label: "🔊",
                        style: 1,
                        custom_id: "volume_up"
                    }
                ]
            }
        ],
        accent_color: 0
    });
};

// Optimized action handlers with early returns
const actionHandlers = Object.freeze({
    volume_down: (player) => {
        const newVolume = Math.max(MIN_VOLUME, player.volume - VOLUME_STEP);
        player.setVolume(newVolume);
        return `🔉 Volume set to ${newVolume}%`;
    },

    previous: (player) => {
        if (!player.previous) return '❌ No previous track available';
        
        if (player.current) player.queue.unshift(player.current);
        player.queue.unshift(player.previous);
        player.stop();
        
        return "⏮️ Playing the previous track.";
    },

    resume: async (player) => {
        await player.pause(false);  
        return "▶️ Resumed playback.";
    },

    pause: async (player) => {
        await player.pause(true);
        return "⏸️ Paused playback.";
    },

    skip: async (player) => {
        if (player.queue.length === 0) return "❌ No tracks in queue to skip to.";
        
        await player.skip();
        return "⏭️ Skipped to the next track.";
    },

    volume_up: (player) => {
        const newVolume = Math.min(MAX_VOLUME, player.volume + VOLUME_STEP);
        player.setVolume(newVolume);
        return `🔊 Volume set to ${newVolume}%`;
    }
});

// Optimized embed update with error recovery
const updateNowPlayingEmbed = async (player, client) => {
    if (!player.nowPlayingMessage || !player.current) return;

    try {
        const updatedEmbed = createEmbed(player, player.current, client);
        await player.nowPlayingMessage.edit({ 
            components: [updatedEmbed], 
            flags: 4096 | 32768
        });
    } catch (error) {
        // Clean up on failure
        player.nowPlayingMessage = null;
        console.error("Failed to update now playing message:", error.message);
    }
};

// Optimized error response
const sendErrorResponse = (interaction, message) => 
    interaction.editOrReply({ content: message }).catch(err => 
        console.error('Response error:', err.message));

export default createEvent({
    data: { name: 'interactionCreate' },
    run: async (interaction, client) => {
        // Early returns for performance
        if (!interaction.isButton() || 
            EXCLUDED_INTERACTIONS.test(interaction.customId) || 
            !interaction.customId || 
            !interaction.guildId) return;
        
        const player = client.aqua.players.get(interaction.guildId);
        
        // Handle no player/track case
        if (!player?.current) {
            return interaction.write({ 
                content: "❌ There is no music playing right now.",
                flags: 64
            }).catch(err => console.error('No music response error:', err.message));
        }

        // Defer reply with error handling
        try {
            await interaction.deferReply(64);
        } catch (error) {
            console.error('Defer error:', error.message);
            return;
        }

        const handler = actionHandlers[interaction.customId];
        if (!handler) {
            return sendErrorResponse(interaction, "❌ This button action is not recognized.");
        }

        try {
            const responseContent = await handler(player);
            
            // Parallel execution for better performance
            await Promise.all([
                interaction.followup({ content: responseContent }),
                updateNowPlayingEmbed(player, client)
            ]);
            
        } catch (error) {
            console.error(`Action ${interaction.customId} failed:`, error.message);
            await sendErrorResponse(interaction, "❌ An error occurred. Please try again.");
        }
    }
});
