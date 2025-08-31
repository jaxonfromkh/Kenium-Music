import process from 'node:process'
import 'dotenv/config'
import { Client, HttpClient, ParseClient, Container, LimitedMemoryAdapter, ParseMiddlewares } from 'seyfert'
import { CooldownManager } from '@slipher/cooldown'
import { middlewares } from './dist/middlewares/middlewares'
import { Aqua } from 'aqualink'
import { MUSIC_PLATFORMS } from './dist/shared/emojis'
const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env

const PRESENCE_UPDATE_INTERVAL = 60000
const MAX_TITLE_LENGTH = 45
const VOICE_STATUS_LENGTH = 30
const VOICE_STATUS_THROTTLE = 5000
const ERROR_LOG_THROTTLE = 5000


const client = new Client({})

const aqua = new Aqua(client, [{
  host: NODE_HOST,
  password: NODE_PASSWORD,
  port: NODE_PORT,
  secure: false,
  name: NODE_NAME
}], {
  defaultSearchPlatform: 'ytsearch',
  restVersion: 'v4',
  shouldDeleteMessage: true,
  infiniteReconnects: true,
  autoResume: true,
  loadBalancer: 'random',
  leaveOnEnd: false
})

aqua.init(process.env.CLIENT_ID)
Object.assign(client, { aqua })

let presenceInterval = null
let lastVoiceStatusUpdate = 0
let lastErrorLog = 0

const _functions = {
  formatTime: ms => {
    const totalSeconds = Math.floor((ms || 0) / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const pad = n => n.toString().padStart(2, '0')
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  },

  truncateText: (text, maxLength = MAX_TITLE_LENGTH) => {
    if (!text || text.length <= maxLength) return text || ''
    const processedText = text.replace(/[^\w\s-_.]/g, '').trim()
    return processedText.length > maxLength
      ? processedText.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...'
      : processedText
  },
  getPlatform: uri => {
    const lowerUri = (uri || '').toLowerCase()
    if (lowerUri.includes('youtu')) return MUSIC_PLATFORMS.youtube
    if (lowerUri.includes('soundcloud')) return MUSIC_PLATFORMS.soundcloud
    if (lowerUri.includes('spotify')) return MUSIC_PLATFORMS.spotify
    if (lowerUri.includes('deezer')) return MUSIC_PLATFORMS.deezer
    return MUSIC_PLATFORMS.youtube
  },
  createEmbed: (player, track) => {
    const { position, volume, loop, paused } = player
    const { title, uri, length, requester } = track
    const volumeIcon = volume === 0 ? '🔇' : volume < 50 ? '🔈' : '🔊'
    const loopIcon = loop === 'track' ? '🔂' : loop === 'queue' ? '🔁' : '▶️'
    const playPauseIcon = paused ? '▶️' : '⏸️'
    const platform = _functions.getPlatform(uri)
    const truncatedTitle = _functions.truncateText(title).replace(/\b\w/g, l => l.toUpperCase())

    return new Container({
      components: [
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: `**${platform.emoji} Now Playing**` },
        { type: 14, divider: true, spacing: 1 },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: `## **[\`${truncatedTitle}\`](${uri})**\n\`${_functions.formatTime(position)}\` / \`${_functions.formatTime(length)}\``
            },
            {
              type: 10,
              content: `${volumeIcon} \`${volume}%\` ${loopIcon} Requester: \`${requester.username}\``
            }
          ],
          accessory: {
            type: 11,
            media: { url: track.thumbnail || client.me.avatarURL({ extension: 'webp' }) || '' }
          }
        },
        { type: 14, divider: true, spacing: 2 },
        {
          type: 1,
          components: [
            { type: 2, label: '🔉', style: 2, custom_id: 'volume_down' },
            { type: 2, label: '⏮️', style: 2, custom_id: 'previous' },
            { type: 2, label: playPauseIcon, style: paused ? 3 : 2, custom_id: paused ? 'resume' : 'pause' },
            { type: 2, label: '⏭️', style: 2, custom_id: 'skip' },
            { type: 2, label: '🔊', style: 2, custom_id: 'volume_up' }
          ]
        },
        { type: 14, divider: true, spacing: 2 },
      ]
    })
  },

  cleanupPlayer: player => {
    const voiceChannel = player.voiceChannel || player._lastVoiceChannel
    if (voiceChannel) {
      client.channels.setVoiceStatus(voiceChannel, null).catch(() => null)
    }
    player.nowPlayingMessage?.delete().catch(() => null)
    player.nowPlayingMessage = null
  },

  shutdown: async () => {
    if (presenceInterval) clearInterval(presenceInterval)
    await aqua.savePlayer().catch(() => null)
    process.exit(0)
  }
}

export const updatePresence = async clientInstance => {
  if (presenceInterval) clearInterval(presenceInterval)

  let activityIndex = 0

  presenceInterval = setInterval(() => {
    if (!clientInstance.me?.id) return

    const guilds = clientInstance.cache.guilds?.values() || []
    const userCount = guilds.reduce((total, guild) => total + (guild.memberCount || 0), 0)

    const activities = [
      { name: '⚡ Kenium 4.5.0 ⚡', type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' },
      { name: `${userCount} users`, type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' },
      { name: `${guilds.length} servers`, type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' },
      { name: 'Sponsor: https://links.triniumhost.com/', type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' }
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
      message: { expire: 3 * 60 * 1000, limit: 5 }
    })
  }
})

aqua.on('trackStart', async (player, track) => {
  try {
    const channel = client.cache.channels.get(player.textChannel)
    if (!channel) return

    const embed = _functions.createEmbed(player, track)

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
      const status = `⭐ ${_functions.truncateText(track.info?.title || track.title, VOICE_STATUS_LENGTH)} - Kenium 4.5.0`
      client.channels.setVoiceStatus(player.voiceChannel, status).catch(() => null)
    }
  } catch (error) {
    // Error handling removed console.log as requested
  }
})

aqua.on('trackError', async (player, track, payload) => {
  const channel = client.cache.channels.get(player.textChannel)
  if (!channel) return

  const errorMsg = payload.exception?.message || 'Playback failed'
  const title = _functions.truncateText(track.info?.title || track.title, 25)

  await channel.client.messages.write(channel.id, {
    content: `❌ **${title}**: ${_functions.truncateText(errorMsg, 50)}`
  }).catch(() => null)
})

aqua.on('playerDestroy', _functions.cleanupPlayer)
aqua.on('queueEnd', _functions.cleanupPlayer)
aqua.on('trackEnd', _functions.cleanupPlayer)

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

process.once('SIGTERM', _functions.shutdown)
process.once('SIGINT', _functions.shutdown)

client.start()
  .then(async () => {
    await client.uploadCommands({ cachePath: './commands.json' }).catch(() => null)
  })
  .catch(error => {
    process.exit(1)
  })

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