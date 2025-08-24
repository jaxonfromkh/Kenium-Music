import process from 'node:process'

import 'dotenv/config'
import { Client, HttpClient, ParseClient, Container, LimitedMemoryAdapter, ParseMiddlewares } from 'seyfert'
import { CooldownManager } from '@slipher/cooldown'

import { middlewares } from './dist/middlewares/middlewares'

import { Aqua } from 'aqualink';

const {
  NODE_HOST,
  NODE_PASSWORD,
  NODE_PORT,
  NODE_NAME
} = process.env

const PRESENCE_UPDATE_INTERVAL = 60000
const MAX_TITLE_LENGTH = 45
const VOICE_STATUS_LENGTH = 30
const VOICE_STATUS_THROTTLE = 5000
const ERROR_LOG_THROTTLE = 5000

const MUSIC_PLATFORMS = {
  youtube: {
    name: 'YouTube',
    emoji: '<:youtube:1326295615017058304>',
    color: 0x000000,
    style: 1//blue button
  },
  soundcloud: {
    name: 'SoundCloud',
    emoji: '<:soundcloud:1326295646818406486>',
    color: 0x000000,
    style: 1
  },
  spotify: {
    name: 'Spotify',
    emoji: '<:spotify:1326702792269893752>',
    color: 0x000000,
    style: 1
  },
  deezer: {
    name: 'Deezer',
    emoji: '<:Deezer_New_Icon:1398710505106964632>',
    color: 0x000000,
    style: 1
  }
}

const client = new Client({})


const aqua = new Aqua(
  client,
  [{
    host: NODE_HOST,
    password: NODE_PASSWORD,
    // @ts-ignore
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
    loadBancer: 'random', // cpu, memory, rest: leastLoad, only rest: leastRest, no check: random
    leaveOnEnd: false
  }
)

aqua.init(process.env.CLIENT_ID)
Object.assign(client, { aqua })
aqua.on('debug', msg => client.logger.debug(msg))
const formatTime = ms => {
  const totalSeconds = Math.floor((ms || 0) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = n => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

const truncateText = (text, maxLength = MAX_TITLE_LENGTH) => {
  if (!text || text.length <= maxLength) return text || ''
  return text.slice(0, maxLength - 3) + '...'
}

const getPlatform = uri => {
  const lowerUri = (uri || '').toLowerCase()
  if (lowerUri.includes('youtu')) return MUSIC_PLATFORMS.youtube
  if (lowerUri.includes('soundcloud')) return MUSIC_PLATFORMS.soundcloud
  if (lowerUri.includes('spotify')) return MUSIC_PLATFORMS.spotify
  if (lowerUri.includes('deezer')) return MUSIC_PLATFORMS.deezer
  return MUSIC_PLATFORMS.youtube
}

const createProgressBar = (position, length) => {
  const total = length > 0 ? length : 1
  const progress = Math.min(10, Math.floor((position / total) * 10))
  return `[${'█'.repeat(progress)}⦿${'▬'.repeat(10 - progress)}]`
}

const createEmbed = (player, track) => {
  const { position, volume, loop, paused } = player
  const { title, uri, length, requester } = track
  const platform = getPlatform(uri)
  const progressBar = createProgressBar(position, length)
  const volumeIcon = volume === 0 ? '🔇' : volume < 50 ? '🔈' : '🔊'
  const loopIcon = loop === 'track' ? '🔂' : loop === 'queue' ? '🔁' : '▶️'
  const playPauseIcon = paused ? '▶️' : '⏸️'

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
  })
}

const cleanupPlayer = player => {
  const voiceChannel = player.voiceChannel || player._lastVoiceChannel
  if (voiceChannel) {
    client.channels.setVoiceStatus(voiceChannel, null).catch(() => null)
  }
  player.nowPlayingMessage?.delete().catch(() => null)
  player.nowPlayingMessage = null
}

let presenceInterval = null

export const updatePresence = async clientInstance => {
  if (presenceInterval) {
    clearInterval(presenceInterval)
  }

  let activityIndex = 0

  presenceInterval = setInterval(() => {
    if (!clientInstance.me?.id) return;


    const guilds = clientInstance.cache.guilds?.values() || [];
    const userCount = guilds.reduce((total, guild) => total + (guild.memberCount || 0), 0);
    const activities = [
      { name: '⚡ Kenium 4.3.0 ⚡', type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' },
      { name: `${userCount} users`, type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' },
      { name: `${guilds.length} servers`, type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' }
    ]

    clientInstance.gateway?.setPresence({
      activities: [activities[activityIndex++ % activities.length]],
      status: 'idle',
      since: Date.now(),
      afk: true
    })
  }, PRESENCE_UPDATE_INTERVAL)
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
      stageInstances: true
    },
    adapter: new LimitedMemoryAdapter({
      message: {
        expire: 3 * 60 * 1000,
        limit: 5
      }
    })
  }
})

let lastVoiceStatusUpdate = 0
let lastErrorLog = 0

aqua.on('trackStart', async (player, track) => {
  try {
    const channel = client.cache.channels.get(player.textChannel)
    if (!channel) return;

    const embed = createEmbed(player, track)

    if (player.nowPlayingMessage?.id && player.nowPlayingMessage.edit) {
      try {
        await player.nowPlayingMessage.edit({
          components: [embed],
          flags: 4096 | 32768
        })
      } catch {
        const message = await channel.client.messages.write(channel.id, {
          components: [embed],
          flags: 4096 | 32768
        }).catch(() => null)
        if (message) player.nowPlayingMessage = message
      }
    } else {
      const message = await channel.client.messages.write(channel.id, {
        components: [embed],
        flags: 4096 | 32768
      }).catch(() => null)
      if (message) player.nowPlayingMessage = message
    }

    const now = Date.now()
    if (now - lastVoiceStatusUpdate > VOICE_STATUS_THROTTLE) {
      lastVoiceStatusUpdate = now
      const status = `⭐ ${truncateText(track.info?.title || track.title, VOICE_STATUS_LENGTH)} - Kenium 4.3.0`
      client.channels.setVoiceStatus(player.voiceChannel, status).catch(() => null)
    }

  } catch (error) {
    console.error(`Track error [${player.guildId}]:`, error.message)
  }
})

aqua.on('trackError', async (player, track, payload) => {
  const channel = client.cache.channels.get(player.textChannel)
  if (!channel) return;

  const errorMsg = payload.exception?.message || 'Playback failed'
  const title = truncateText(track.info?.title || track.title, 25)

  await channel.client.messages.write(channel.id, {
    content: `❌ **${title}**: ${truncateText(errorMsg, 50)}`
  }).catch(() => null)
})

aqua.on('playerDestroy', cleanupPlayer)
aqua.on('queueEnd', cleanupPlayer)
aqua.on('trackEnd', cleanupPlayer)

aqua.on('nodeError', (node, error) => {
  const now = Date.now()
  if (now - lastErrorLog > ERROR_LOG_THROTTLE) {
    client.logger.error(`Node [${node.name}] error: ${error.message}`)
    lastErrorLog = now
  }
})
aqua.on('socketClosed', (player, payload) => {
  client.logger.debug(`Socket closed [${player.guildId}], code: ${payload.code}`)
})

aqua.on('nodeConnect', node => {
  client.logger.debug(`Node [${node.name}] connected, IsNodeSecure: ${node.secure}`)
})

aqua.on('nodeDisconnect', (_, reason) => {
  client.logger.info(`Node disconnected: ${reason}`)
})

const shutdown = async () => {
  console.log('Shutting down...')
  if (presenceInterval) clearInterval(presenceInterval)
  // @ts-ignore
  await aqua.savePlayer().catch(console.error)
  process.exit(0)
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
// @ts-ignore

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
  interface Client<Ready extends boolean> {
    cooldown: CooldownManager
  }
  interface RegisteredMiddlewares extends ParseMiddlewares<typeof middlewares> { }
}