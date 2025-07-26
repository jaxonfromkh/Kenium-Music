import { Client, HttpClient, ParseClient, Container, LimitedMemoryAdapter, ParseMiddlewares } from "seyfert";
import { createRequire } from "module";
import { CooldownManager } from "@slipher/cooldown";
import { middlewares } from "./dist/middlewares/middlewares";

import 'dotenv/config';

const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME, token } = process.env;

// @ts-ignore
const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const client = new Client({});

// Constants
const CONFIG = {
    PRESENCE_UPDATE_INTERVAL: 60000, // Increased from 35s to 60s
    UPDATE_THROTTLE: 1000, // Increased from 500ms to 1s
    MAX_TITLE_LENGTH: 45,
    MAX_ERROR_LENGTH: 50,
    VOICE_STATUS_LENGTH: 30,
    TIME_FORMAT_REGEX: /(\d{2}):(\d{2}):(\d{2})/,
    PROGRESS_CHARS: ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████']
};

// Optimized presence update function
export async function updatePresence(client) {
    let activityIndex = 0;
    
    const updateInterval = setInterval(() => {
        if (!client.me?.id) return;

        const guilds = client.cache.guilds?.values() || [];
        const userCount = guilds.reduce((total, guild) => total + (guild.memberCount || 0), 0);

        const activities = [
            { name: "⚡ Kenium 4.1.0 ⚡", type: 1, url: "https://www.youtube.com/watch?v=5etqxAG9tVg" },
            { name: `${userCount} users`, type: 1, url: "https://www.youtube.com/watch?v=5etqxAG9tVg" },
            { name: `${guilds.length} servers`, type: 1, url: "https://www.youtube.com/watch?v=5etqxAG9tVg" }
        ];

        client.gateway?.setPresence({ 
            activities: [activities[activityIndex++ % activities.length]], 
            status: 'idle', 
            since: Date.now(),
            afk: true
        });
    }, CONFIG.PRESENCE_UPDATE_INTERVAL);

    return () => clearInterval(updateInterval);
}

// Optimized cache configuration
client.setServices({
    middlewares: middlewares,
    cache: {
        disabledCache: {
            bans: true,
            emojis: true,
            stickers: true,
            roles: true,
            presences: true, // Disabled for better performance
            stageInstances: true,
        },
        adapter: new LimitedMemoryAdapter({
            message: {
                expire: 3 * 60 * 1000, // Reduced from 5 minutes
                limit: 5, // Reduced from 10
            },
        }),
    }
});

const aqua = new Aqua(client, [{
    host: NODE_HOST,
    password: NODE_PASSWORD,
    port: NODE_PORT,
    secure: false,
    name: NODE_NAME
}], {
    defaultSearchPlatform: "ytsearch",
    restVersion: "v4",
    shouldDeleteMessage: true,
    infiniteReconnects: true,
    autoResume: true,
    leaveOnEnd: false,
});

Object.assign(client, { aqua });

// Simplified throttling without caching
const lastUpdates = new Map();

// Optimized utility functions
const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const canUpdate = (guildId) => {
    const now = Date.now();
    const lastUpdate = lastUpdates.get(guildId);
    
    if (lastUpdate && (now - lastUpdate) < CONFIG.UPDATE_THROTTLE) {
        return false;
    }
    
    lastUpdates.set(guildId, now);
    
    // Cleanup old entries periodically
    if (lastUpdates.size > 50) {
        const cutoff = now - (CONFIG.UPDATE_THROTTLE * 2);
        for (const [id, timestamp] of lastUpdates.entries()) {
            if (timestamp < cutoff) {
                lastUpdates.delete(id);
            }
        }
    }
    
    return true;
};

// Regex-based text truncation
const truncateText = (text, maxLength = CONFIG.MAX_TITLE_LENGTH) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
};

// Optimized embed creation with reduced complexity
const createEmbed = (player, track) => {
    const { position, volume, loop, paused } = player;
    const { title, uri, length } = track;

    const progress = Math.min(10, Math.max(0, Math.round((position / length) * 10)));
    const progressBar = `\`[${CONFIG.PROGRESS_CHARS[progress]}⦿${'▬'.repeat(10 - progress)}]\``;

    // Simplified icon logic
    const volumeIcon = volume === 0 ? '🔇' : volume < 50 ? '🔈' : '🔊';
    const loopIcon = loop === 'track' ? '🔂' : loop === 'queue' ? '🔁' : '▶️';
    const playPauseIcon = paused ? "▶️" : "⏸️";

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
                        content: `\`${formatTime(position)}\` ${progressBar} \`${formatTime(length)}\`\n\n${volumeIcon} \`${volume}%\` ${loopIcon} \`${track.requester?.username || 'Unknown'}\``
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
                    { type: 2, label: "🔉", style: 1, custom_id: "volume_down" },
                    { type: 2, label: "⏮️", style: 1, custom_id: "previous" },
                    { type: 2, label: playPauseIcon, style: paused ? 3 : 1, custom_id: paused ? "resume" : "pause" },
                    { type: 2, label: "⏭️", style: 1, custom_id: "skip" },
                    { type: 2, label: "🔊", style: 1, custom_id: "volume_up" }
                ]
            }
        ],
        accent_color: 0
    });
};

// Event handlers with improved error handling
aqua.on("trackStart", async (player, track) => {
    try {
        if (!canUpdate(player.guildId)) return;

        const channel = client.cache.channels.get(player.textChannel);
        if (!channel) return;

        const embed = createEmbed(player, track);
        
        const message = await channel.client.messages.write(channel.id, {
            components: [embed],
            flags: 4096 | 32768
        }).catch(() => null);

        if (message) {
            player.nowPlayingMessage = message;
        }

        // Voice status update
        const voiceStatusText = `⭐ ${truncateText(track.info?.title || track.title, CONFIG.VOICE_STATUS_LENGTH)} - Kenium 4.1.0`;
        client.channels.setVoiceStatus(player.voiceChannel, voiceStatusText).catch(() => {});

    } catch (error) {
        console.error(`Track start error [${player.guildId}]:`, error.message);
    }
});

aqua.on("trackError", async (player, track, payload) => {
    try {
        const channel = client.cache.channels.get(player.textChannel);
        if (!channel) return;

        const errorMsg = payload.exception?.message || 'Playback failed';
        const trackTitle = track.info?.title || track.title || 'Unknown';

        await channel.client.messages.write(channel.id, {
            content: `❌ **${truncateText(trackTitle, 25)}**: ${truncateText(errorMsg, CONFIG.MAX_ERROR_LENGTH)}`
        }).catch(() => {});
    } catch (error) {
        console.error(`Track error handler failed [${player.guildId}]:`, error.message);
    }
});

// Simplified cleanup function
const cleanupPlayer = (player) => {
    const voiceChannel = player.voiceChannel || player._lastVoiceChannel;
    if (voiceChannel) {
        client.channels.setVoiceStatus(voiceChannel, null).catch(() => {});
    }
    
    player.nowPlayingMessage = null;
    player.cachedEmbed = null;
};

// Event listeners
aqua.on("playerDestroy", cleanupPlayer);
aqua.on("queueEnd", cleanupPlayer);
aqua.on("trackEnd", (player) => {
    player.nowPlayingMessage = null;
    player.cachedEmbed = null;
});

// Logging events with throttling
let lastLogTime = 0;
const LOG_THROTTLE = 5000; // 5 seconds

aqua.on('nodeError', (node, error) => {
    const now = Date.now();
    if (now - lastLogTime > LOG_THROTTLE) {
        client.logger.error(`Node [${node.name}] error: ${error.message}`);
        lastLogTime = now;
    }
});

aqua.on('socketClosed', (player, payload) => {
    client.logger.debug(`Socket closed [${player.guildId}], code: ${payload.code}`);
});

aqua.on('nodeConnect', (node) => {
    client.logger.debug(`Node [${node.name}] connected`);
});

aqua.on('nodeDisconnect', (code, reason) => {
    client.logger.info(`Node disconnected: ${reason}`);
});

// Optimized graceful shutdown
const gracefulShutdown = async () => {
    console.log("Initiating graceful shutdown...");
    
    try {
        await aqua.savePlayer();
        console.log("Players saved successfully");
    } catch (error) {
        console.error("Failed to save players:", error.message);
    }
    
    // Clear memory
    lastUpdates.clear();
    
    process.exit(0);
};

process.once('SIGTERM', gracefulShutdown);
process.once('SIGINT', gracefulShutdown);

// Bot startup
client.start().then(async () => {
    try {
        await client.uploadCommands({ cachePath: "./commands.json" });
    } catch (error) {
        console.error('Command upload failed:', error.message);
    }
}).catch(error => {
    console.error('Bot startup failed:', error.message);
    process.exit(1);
});

// @ts-ignore
client.cooldown = new CooldownManager(client);

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>>, ParseClient<HttpClient> {
        aqua: InstanceType<typeof Aqua>;
    }
    interface UsingClient {
        cooldown: CooldownManager;
    }
    interface RegisteredMiddlewares extends ParseMiddlewares<typeof middlewares> { }
}
