import { createEvent, Container } from 'seyfert';

const PROGRESS_CHARS = ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████', '███████████', '████████████'];
const MAX_TITLE_LENGTH = 60;
const VOLUME_STEP = 10;
const MAX_VOLUME = 100;
const MIN_VOLUME = 0;

const EXCLUDED_INTERACTIONS = /^(?:queue_|select_|platform_|lyrics_|add_more_|add_track_|edit_description_|remove_track_|playlist_(?:next|prev)_|(?:create|manage|view|shuffle|play)_playlist_)/;

const VOLUME_ICONS = ['🔇', '🔈', '🔉', '🔊'];
const LOOP_ICONS = { track: '🔂', queue: '🔁', none: '▶️' };

const formatTime = (ms) => {
    const totalSeconds = ms / 1000 | 0;
    const hours = totalSeconds / 3600 | 0;
    const minutes = (totalSeconds % 3600) / 60 | 0;
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};


const truncateText = (text, length = MAX_TITLE_LENGTH) => 
    (!text || text.length <= length) ? text : `${text.slice(0, length - 3)}...`;

const getVolumeIcon = (volume) => {
    if (volume === 0) return VOLUME_ICONS[0];
    if (volume < 30) return VOLUME_ICONS[1];
    if (volume < 70) return VOLUME_ICONS[2];
    return VOLUME_ICONS[3];
};


const createEmbed = (player, track, client) => {
    const { position, volume, loop } = player;
    const { title, uri, length } = track;
    
    const progress = Math.min(12, Math.max(0, (position / length * 12) | 0));
    const progressBar = PROGRESS_CHARS[progress];
    const remainingBar = '▬'.repeat(12 - progress);
    const bar = `\`[${progressBar}⦿${remainingBar}]\``;
    
    const volIcon = getVolumeIcon(volume);
    const loopIcon = LOOP_ICONS[loop] || '▶️';
    const requester = track.requester?.username || 'Unknown';

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
                        content: `\`${formatTime(position)}\` ${bar} \`${formatTime(length)}\`\n\n${volIcon} \`${volume}%\` ${loopIcon} \`${requester}\``
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
                        label: player.paused ? "▶️" : "⏸️",
                        style: player.paused ? 3 : 1,
                        custom_id: player.paused ? "resume" : "pause"
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
                    },
                ],
            },
        ],
        accent_color: 0
    });
};

const actionHandlers = {
    volume_down: (player) => {
        const newVolume = Math.max(MIN_VOLUME, player.volume - VOLUME_STEP);
        player.setVolume(newVolume);
        return `🔉 Volume set to ${newVolume}%`;
    },

    previous: (player) => {
        if (!player.previous) {
            return '❌ No previous track available';
        }
        
        if (player.current) {
            player.queue.unshift(player.current);
        }
        
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
        if (player.queue.length === 0) {
            return "❌ No tracks in queue to skip to.";
        }
        
        await player.skip();
        return "⏭️ Skipped to the next track.";
    },

    volume_up: (player) => {
        const newVolume = Math.min(MAX_VOLUME, player.volume + VOLUME_STEP);
        player.setVolume(newVolume);
        return `🔊 Volume set to ${newVolume}%`;
    }
};

const updateNowPlayingEmbed = async (player, client) => {
    if (!player.nowPlayingMessage || !player.current) return;

    try {
        const updatedEmbed = createEmbed(player, player.current, client);
        
        await player.nowPlayingMessage.edit({ 
            components: [updatedEmbed], 
            flags: 4096 | 32768
        });
        
        player.cachedEmbed = updatedEmbed;
        
    } catch (error) {
        console.error("Error updating now playing message:", error);
        player.nowPlayingMessage = null;
        player.cachedEmbed = null;
    }
};

const sendErrorResponse = async (interaction, message) => {
    try {
        await interaction.editOrReply({ content: message });
    } catch (error) {
        console.error('Error sending response:', error);
    }
};

export default createEvent({
    data: {
        name: 'interactionCreate',
    },
    run: async (interaction, client) => {
        if (!interaction.isButton()) return;
        if (EXCLUDED_INTERACTIONS.test(interaction.customId)) return;
        
        const { customId, guildId } = interaction;
        if (!customId || !guildId) return;
        
        const player = client.aqua.players.get(guildId);
        if (!player || !player.current) {
            try {
                await interaction.write({ 
                    content: "❌ There is no music playing right now.",
                    flags: 64
                });
            } catch (error) {
                console.error('Error sending no music response:', error);
            }
            return;
        }
        try {
            await interaction.deferReply(64);
        } catch (error) {
            console.error('Error deferring reply:', error);
            return;
        }

        const handler = actionHandlers[customId];
        if (!handler) {
            await sendErrorResponse(interaction, "❌ This button action is not recognized.");
            return;
        }

        try {
            const responseContent = await handler(player, interaction);
            
            await interaction.followup({ content: responseContent });
            await updateNowPlayingEmbed(player, client);
            
        } catch (error) {
            console.error(`Error handling ${customId} action:`, error);
            await sendErrorResponse(interaction, `❌ An error occurred while processing your request. Please try again.`);
        }
    },
});