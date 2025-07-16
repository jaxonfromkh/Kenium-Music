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

export async function updatePresence(client) {
    let index = 0;
    
    const updateInterval = setInterval(() => {
        if (!client.me) {
            return;
        }

        const guilds = client.cache.guilds?.values() || [];
        const users = guilds.reduce((a, b) => a + (b.memberCount ?? 0), 0);

        const activities = [
            { name: "⚡ Kenium 4.1.0 ⚡", type: 1, url: "https://www.youtube.com/watch?v=5etqxAG9tVg" },
            { name: `${users} users`, type: 1, url: "https://www.youtube.com/watch?v=5etqxAG9tVg" },
            { name: `${guilds.length} servers`, type: 1, url: "https://www.youtube.com/watch?v=5etqxAG9tVg" },
        ];
        const activity = activities[index++ % activities.length];

        client.gateway?.setPresence({ 
            activities: [activity], 
            status: 'idle', 
            since: Date.now(),
            afk: true
        })
    }, 35000);
}


client.setServices({
    middlewares: middlewares,
    cache: {
        disabledCache: {
            bans: true,
            emojis: true,
            stickers: true,
            roles: true,
            presences: false,
            stageInstances: true,
        },
        adapter: new LimitedMemoryAdapter({
            message: {
                expire: 5 * 60 * 1000,
                limit: 10,
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

Object.assign(client, {
    aqua,
});

const UPDATE_INTERVAL = 500;
const MAX_CACHE_SIZE = 20;
const MAX_TITLE_LENGTH = 45;

const channelCache = new Map();
const lastUpdates = new Map();

const PROGRESS_CHARS = ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████'];


const timeFormatCache = new Map();
const formatTime = (ms) => {
    if (timeFormatCache.has(ms)) {
        return timeFormatCache.get(ms);
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;


    if (timeFormatCache.size > 100) {
        timeFormatCache.clear();
    }

    timeFormatCache.set(ms, formatted);
    return formatted;
};

const getChannel = (id) => {
    let channel = channelCache.get(id);
    if (!channel) {
        channel = client.cache.channels.get(id);
        if (channel && channelCache.size < MAX_CACHE_SIZE) {
            channelCache.set(id, channel);
        }
    }
    return channel;
};

const canUpdate = (id) => {
    const now = Date.now();
    const last = lastUpdates.get(id);
    if (last && now - last < UPDATE_INTERVAL) return false;
    lastUpdates.set(id, now);
    return true;
};

const truncateText = (text, length = MAX_TITLE_LENGTH) => {
    return text?.length > length ? `${text.slice(0, length - 3)}...` : text || '';
};

const createEmbed = (player, track) => {
    const { position, volume, loop } = player;
    const { title, uri, length } = track;

    const progress = Math.min(10, Math.max(0, Math.round((position / length) * 10)));
    const bar = `\`[${PROGRESS_CHARS[progress]}⦿${'▬'.repeat(10 - progress)}]\``;

    const volIcon = volume === 0 ? '🔇' : volume < 50 ? '🔈' : '🔊';
    const loopIcon = loop === 'track' ? '🔂' : loop === 'queue' ? '🔁' : '▶️';

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
                        content: `\`${formatTime(position)}\` ${bar} \`${formatTime(length)}\`\n\n${volIcon} \`${volume}%\` ${loopIcon} \`${track.requester?.username || 'Unknown'}\``
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

aqua.on("trackStart", async (player, track) => {
    const channel = getChannel(player.textChannel);
    if (!channel) return;
    try {
        if (!canUpdate(player.guildId)) return;

        const embed = createEmbed(player, track);
        player.cachedEmbed = embed;

        const message = await channel.client.messages.write(channel.id, {
            components: [embed],
            flags: 4096 | 32768
        }).catch(err => {
            console.error("Failed to send message:", err.message);
            return null;
        });

        if (message) {
            player.nowPlayingMessage = message;
        }

        const voiceStatusText = `⭐ ${truncateText(track.info?.title || track.title, 30)} - Kenium 4.1.0`;
        client.channels.setVoiceStatus(player.voiceChannel, voiceStatusText)
            .catch(err => console.error("Voice status error:", err.message));

    } catch (error) {
        console.error("Track start error:", error.message);
    }
});

aqua.on("trackError", async (player, track, payload) => {
    const channel = getChannel(player.textChannel);
    if (!channel) return;

    const errorMsg = payload.exception?.message || 'Playback failed';
    const trackTitle = track.info?.title || track.title || 'Unknown';

    channel.client.messages.write(channel.id, {
        content: `❌ **${truncateText(trackTitle, 25)}**: ${truncateText(errorMsg, 50)}`
    }).catch(err => console.error("Error message failed:", err.message));
});

const cleanupPlayer = (player) => {
    if (player.voiceChannel || player._lastVoiceChannel) {
        client.channels.setVoiceStatus(player.voiceChannel || player._lastVoiceChannel , null)
            .catch(() => { });
    }
    player.nowPlayingMessage = null;
    player.cachedEmbed = null;
};

aqua.on("playerDestroy", (player) => cleanupPlayer(player));
aqua.on("queueEnd", (player) => cleanupPlayer(player));
aqua.on("trackEnd", (player, track) => {
    player.nowPlayingMessage = null;
    player.cachedEmbed = null;
});
aqua.on('nodeError', (node, error) => {
    client.logger.error(`Node [${node.name}] error: ${error.message}`);
});

aqua.on('nodeConnect', (node) => {
    client.logger.debug(`Node [${node.name}] connected`);
});

const gracefulShutdown = async () => {
    console.log("Saving players...");
    await aqua.savePlayer();
    console.log("Players saved successfully");
    
    channelCache.clear();
    lastUpdates.clear();
    timeFormatCache.clear();
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

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
