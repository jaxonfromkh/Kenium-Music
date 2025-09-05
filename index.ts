import process from 'node:process'
import 'dotenv/config'
import { Client, HttpClient, ParseClient, Container, LimitedMemoryAdapter, ParseMiddlewares } from 'seyfert'
import { CooldownManager } from '@slipher/cooldown'
import { middlewares } from './dist/middlewares/middlewares'
import { Aqua } from 'aqualink'
import { createEmbed, truncateText } from './dist/events/interactionCreate'

const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env

const PRESENCE_UPDATE_INTERVAL = 60000
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
aqua.on('debug', msg => client.logger.debug(msg))

let presenceInterval = null
let lastVoiceStatusUpdate = 0
let lastErrorLog = 0

const _functions = {
  createEmbed: (player, track) => createEmbed(player, track, client),

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
      { name: '⚡ Kenium 4.5.1 ⚡', type: 1, url: 'https://www.youtube.com/watch?v=7aIjwQCEox8' },
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
      const status = `⭐ ${truncateText(track.info?.title || track.title, VOICE_STATUS_LENGTH)} - Kenium 4.5.1`
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
  const title = truncateText(track.info?.title || track.title, 25)

  await channel.client.messages.write(channel.id, {
    content: `❌ **${title}**: ${truncateText(errorMsg, 50)}`
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