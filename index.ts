

import { Client, HttpClient, ParseClient, Container, LimitedMemoryAdapter, ParseMiddlewares } from 'seyfert'
import { CooldownManager } from '@slipher/cooldown'
import 'dotenv/config'

import { middlewares } from './dist/middlewares/middlewares'
import { createRequire } from 'node:module'
// @ts-ignore
const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');


const {
  NODE_HOST,
  NODE_PASSWORD,
  NODE_PORT,
  NODE_NAME,
} = process.env

const PRESENCE_UPDATE_INTERVAL = 60000
const UPDATE_THROTTLE = 250
const MAX_TITLE_LENGTH = 45
const MAX_ERROR_LENGTH = 50
const VOICE_STATUS_LENGTH = 30
const PROGRESS_CHARS = ['', '▰', '▰▰', '▰▰▰', '▰▰▰▰', '▰▰▰▰▰', '▰▰▰▰▰▰', '▰▰▰▰▰▰▰', '▰▰▰▰▰▰▰▰', '▰▰▰▰▰▰▰▰▰', '▰▰▰▰▰▰▰▰▰▰']
const LOG_THROTTLE = 5000

const client = new Client({})
const aqua = new Aqua(
  client,
  [{
    host: NODE_HOST,
    password: NODE_PASSWORD,
    port: NODE_PORT,
    secure: false,
    name: NODE_NAME
  }],
  {
    defaultSearchPlatform: 'ytsearch',
    restVersion: 'v4',
    shouldDeleteMessage: true,
    infiniteReconnects: true,
    autoResume: true,
    leaveOnEnd: false
  }
)

Object.assign(client, { aqua })


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

function getPlatform(uri) {
    if (/youtube|youtu\.be/i.test(uri)) return MUSIC_PLATFORMS.YOUTUBE;
    if (/soundcloud/i.test(uri)) return MUSIC_PLATFORMS.SOUNDCLOUD;
    if (/spotify/i.test(uri)) return MUSIC_PLATFORMS.SPOTIFY;
    if (/deezer/i.test(uri)) return MUSIC_PLATFORMS.DEEZER;
    return MUSIC_PLATFORMS.YOUTUBE; // Default fallback
}

function createEmbed(player, track) {
    const { position, volume, loop, paused } = player;
    const { title, uri, length, requester } = track;
    const platform = getPlatform(uri);

    const progress = Math.min(10, Math.max(0, Math.floor((position / length) * 10)));
    const progressBar = `[${PROGRESS_CHARS[progress]}⦿${'▬'.repeat(10 - progress)}]`;

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

function cleanupPlayer(player) {
  const voiceChannel = player.voiceChannel || player._lastVoiceChannel
  if (voiceChannel) {
    client.channels.setVoiceStatus(voiceChannel, null).catch(() => null)
  }
  player.nowPlayingMessage = null
}

export async function updatePresence(client) {
    let activityIndex = 0;

    const updateInterval = setInterval(() => {
        if (!client.me?.id) return;

        const guilds = client.cache.guilds?.values() || [];
        const userCount = guilds.reduce((total, guild) => total + (guild.memberCount || 0), 0);

        const activities = [
            { name: "⚡ Kenium 4.1.0 ⚡", type: 1, url: "https://www.youtube.com/watch?v=7aIjwQCEox8" },
            { name: `${userCount} users`, type: 1, url: "https://www.youtube.com/watch?v=7aIjwQCEox8" },
            { name: `${guilds.length} servers`, type: 1, url: "https://www.youtube.com/watch?v=7aIjwQCEox8" }
        ];

        client.gateway?.setPresence({
            activities: [activities[activityIndex++ % activities.length]],
            status: 'idle',
            since: Date.now(),
            afk: true
        });
    }, PRESENCE_UPDATE_INTERVAL);

    return () => clearInterval(updateInterval);
}


client.setServices({
    middlewares: middlewares,
    cache: {
        disabledCache: {
            bans: true,
            emojis: true,
            stickers: true,
            roles: true,
            presences: true,
            stageInstances: true,
        },
        adapter: new LimitedMemoryAdapter({
            message: {
                expire: 3 * 60 * 1000,
                limit: 5,
            },
        }),
    }
})

aqua.on('trackStart', async (player, track) => {
  try {
    const channel = client.cache.channels.get(player.textChannel)
    if (!channel) return

    const embed = createEmbed(player, track)
    const message = await channel.client.messages.write(channel.id, {
      components: [embed],
      flags: 4096 | 32768
    }).catch(() => null)

    if (message) player.nowPlayingMessage = message

    const status = `⭐ ${truncateText(track.info?.title || track.title, VOICE_STATUS_LENGTH)} - Kenium 4.1.0`
    client.channels.setVoiceStatus(player.voiceChannel, status).catch(() => null)
  } catch (error) {
    console.error(`Track error [${player.guildId}]:`, error.message)
  }
})

aqua.on('trackError', async (player, track, payload) => {
  const channel = client.cache.channels.get(player.textChannel)
  if (!channel) return

  const errorMsg = payload.exception?.message || 'Playback failed'
  const title = truncateText(track.info?.title || track.title, 25)

  await channel.client.messages.write(channel.id, {
    content: `❌ **${title}**: ${truncateText(errorMsg, MAX_ERROR_LENGTH)}`
  }).catch(() => null)
})

aqua.on('playerDestroy', cleanupPlayer)
aqua.on('queueEnd', cleanupPlayer)
aqua.on('trackEnd', player => {
  player.nowPlayingMessage = null
})

let lastLogTime = 0
aqua.on('nodeError', (node, error) => {
  const now = Date.now()
  if (now - lastLogTime > LOG_THROTTLE) {
    client.logger.error(`Node [${node.name}] error: ${error.message}`)
    lastLogTime = now
  }
})

aqua.on('socketClosed', (player, payload) => {
  client.logger.debug(`Socket closed [${player.guildId}], code: ${payload.code}`)
})

aqua.on('nodeConnect', node => {
  client.logger.debug(`Node [${node.name}] connected`)
})

aqua.on('nodeDisconnect', (_, reason) => {
  client.logger.info(`Node disconnected: ${reason}`)
})
const shutdown = async () => {
  console.log('Shutting down...')
  await aqua.savePlayer().catch(console.error)
  process.exit(0)
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

client.start()
  .then(async () => {
    await client.uploadCommands({ cachePath: './commands.json' }).catch(console.error)
  })
  .catch(error => {
    console.error('Startup failed:', error.message)
    process.exit(1)
  })

// @ts-ignore
client.cooldown = new CooldownManager(client)

declare module 'seyfert' {
  interface UsingClient extends ParseClient<Client<true>>, ParseClient<HttpClient> {
    aqua: InstanceType<typeof Aqua>
  }
  interface UsingClient {
    cooldown: CooldownManager
  }
  interface RegisteredMiddlewares extends ParseMiddlewares<typeof middlewares> { }
}
