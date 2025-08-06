import { createEvent, Container } from 'seyfert';

const MAX_TITLE_LENGTH = 60;
const VOLUME_STEP = 10;
const MAX_VOLUME = 100;
const MIN_VOLUME = 0;


const EXCLUDED_PREFIXES = new Set(['queue_', 'select_', 'platform_', 'lyrics_', 'add_more_', 'add_track_', 'edit_description_', 'remove_track_', 'playlist_next_', 'playlist_prev_', 'create_playlist_', 'manage_playlist_', 'view_playlist_', 'shuffle_playlist_', 'play_playlist_']);

const MUSIC_PLATFORMS = Object.freeze({
    YOUTUBE: Object.freeze({
        name: 'YouTube',
        source: 'ytsearch',
        color: 0xff0000,
        emoji: '<:youtube:1326295615017058304>',
        icon: '📺',
        style: 4
    }),
    SOUNDCLOUD: Object.freeze({
        name: 'SoundCloud',
        source: 'scsearch',
        color: 0xff5500,
        emoji: '<:soundcloud:1326295646818406486>',
        icon: '🎵',
        style: 1
    }),
    SPOTIFY: Object.freeze({
        name: 'Spotify',
        source: 'spsearch',
        color: 0x1db954,
        emoji: '<:spotify:1326702792269893752>',
        icon: '🎧',
        style: 3
    }),
    DEEZER: Object.freeze({
        name: 'Deezer',
        source: 'dzsearch',
        color: 0x8000ff,
        emoji: '<:Deezer_New_Icon:1398710505106964632>',
        icon: '🎶',
        style: 1
    })
});

const PLATFORM_PATTERNS = [
  { pattern: /youtube|youtu\.be/i, platform: MUSIC_PLATFORMS.YOUTUBE },
  { pattern: /soundcloud/i, platform: MUSIC_PLATFORMS.SOUNDCLOUD },
  { pattern: /spotify/i, platform: MUSIC_PLATFORMS.SPOTIFY },
  { pattern: /deezer/i, platform: MUSIC_PLATFORMS.DEEZER }
];

function getPlatform(uri) {
  for (const { pattern, platform } of PLATFORM_PATTERNS) {
    if (pattern.test(uri)) return platform;
  }
  return MUSIC_PLATFORMS.YOUTUBE;
}
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function truncateText(text, maxLength = MAX_TITLE_LENGTH) {
  return text?.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text || ''
}

function createEmbed(player, track, client) {
    const { position, volume, loop, paused } = player;
    const { title, uri, length, requester } = track;
    const platform = getPlatform(uri);

  const progress = Math.min(10, Math.floor((position / length) * 10));
  const progressBar = `[${'█'.repeat(progress)}⦿${'▬'.repeat(10 - progress)}]`;

    const volumeIcon = volume === 0 ? '🔇' : volume < 50 ? '🔈' : '🔊';
    const loopIcon = loop === 'track' ? '🔂' : loop === 'queue' ? '🔁' : '▶️';
    const playPauseIcon = paused ? '▶️' : '⏸️';

    return new Container({
        components: [{
            type: 9,
            components: [{
                type: 10,
                content: `### ${platform.emoji} [${truncateText(title)}](${uri})${paused ? ' (Paused)' : ''}`
            }, {
                type: 10,
                content: `\`${formatTime(position)}\` ${progressBar} \`${formatTime(length)}\`\n\n${volumeIcon} \`${volume}%\` ${loopIcon} Requested by: \`${requester?.username || 'Unknown'}\``
            }],
            accessory: {
                type: 11,
                media: {
                    url: track.thumbnail || client.me?.avatarURL({ extension: 'png' }) || ''
                }
            }
        }, {
            type: 14,
            divider: true,
            spacing: 2
        }, {
            type: 1,
            components: [
                { type: 2, label: '🔉', style: platform.style, custom_id: 'volume_down' },
                { type: 2, label: '⏮️', style: platform.style, custom_id: 'previous' },
                { type: 2, label: playPauseIcon, style: paused ? 4 : platform.style, custom_id: paused ? 'resume' : 'pause' },
                { type: 2, label: '⏭️', style: platform.style, custom_id: 'skip' },
                { type: 2, label: '🔊', style: platform.style, custom_id: 'volume_up' }
            ]
        }],
        accent_color: platform.color
    });
}

const actionHandlers = Object.freeze({
    volume_down: (player) => {
        const newVolume = Math.max(MIN_VOLUME, player.volume - VOLUME_STEP);
        player.setVolume(newVolume);
        return { message: `🔉 Volume set to ${newVolume}%`, shouldUpdate: true };
    },

    previous: (player) => {
        if (!player.previous) return { message: '❌ No previous track available', shouldUpdate: false };

        if (player.current) player.queue.unshift(player.current);
        player.queue.unshift(player.previous);
        player.stop();

        return { message: "⏮️ Playing the previous track.", shouldUpdate: false };
    },

    resume: async (player) => {
        await player.pause(false);
        return { message: "▶️ Resumed playback.", shouldUpdate: true };
    },

    pause: async (player) => {
        await player.pause(true);
        return { message: "⏸️ Paused playback.", shouldUpdate: true };
    },

    skip: async (player) => {
        if (player.queue.length === 0) return { message: "❌ No tracks in queue to skip to.", shouldUpdate: false };

        await player.skip();
        return { message: "⏭️ Skipped to the next track.", shouldUpdate: false };
    },

    volume_up: (player) => {
        const newVolume = Math.min(MAX_VOLUME, player.volume + VOLUME_STEP);
        player.setVolume(newVolume);
        return { message: `🔊 Volume set to ${newVolume}%`, shouldUpdate: true };
    }
});

const updateNowPlayingEmbed = async (
    player: {
        nowPlayingMessage?: { edit: (options: any) => Promise<any> };
        current?: any;
    },
    client: any
) => {
    if (!player.nowPlayingMessage || !player.current) {
        if (player.nowPlayingMessage && !player.current) {
            player.nowPlayingMessage = null;
        }
        return;
    }

    try {
        const updatedEmbed = createEmbed(player, player.current, client);
        await player.nowPlayingMessage.edit({
            components: [updatedEmbed],
            flags: 4096 | 32768
        });
    } catch (error) {
        player.nowPlayingMessage = null;
        if (error.code === 10008) return;
        console.error("Failed to update now playing message:", error.message);
    }
};
const sendErrorResponse = (interaction, message) =>
    interaction.editOrReply({ content: message }).catch(err =>
        console.error('Response error:', err.message));

export default createEvent({
    data: { name: 'interactionCreate' },
    run: async (interaction, client) => {
         if (!interaction.isButton() || !interaction.customId || !interaction.guildId) return;

             for (const prefix of EXCLUDED_PREFIXES) {
      if (interaction.customId.startsWith(prefix)) return;
    }

        const player = client.aqua.players.get(interaction.guildId);

        if (!player?.current) {
            return interaction.write({
                content: "❌ There is no music playing right now.",
                flags: 64
            }).catch(err => console.error('No music response error:', err.message));
        }

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
            const result = await handler(player);

            await interaction.followup({ content: result.message });

            if (result.shouldUpdate && player.current) {
                queueMicrotask(() => updateNowPlayingEmbed(player, client));
            }

        } catch (error) {
            console.error(`Action ${interaction.customId} failed:`, error.message);
            await sendErrorResponse(interaction, "❌ An error occurred. Please try again.");
        }
    }
});
