import { createEvent } from 'seyfert'

import { SimpleDB } from '../utils/simpleDB'
import { updatePresence } from '../../index'

const db = new SimpleDB()
const settingsCollection = db.collection('guildSettings')
const NICKNAME_SUFFIX = ' [24/7]'
const BATCH_SIZE = 10
const BATCH_DELAY = 500

// at module top (same module where you have botReady)
let currentClient: any

const UNKNOWN_VOICE_STATE_CODE = 10065

function isUnknownVoiceStateError(err: any) {
  if (!err) return false
  if (err.code === UNKNOWN_VOICE_STATE_CODE) return true
  const msg = String(err?.message ?? err ?? '')
  if (msg.includes('Unknown Voice State 10065')) return true
  // be defensive: look for a voice-states route + 404
  if (msg.includes('/voice-states/') && (msg.includes('404') || msg.includes('Unknown'))) return true
  return false
}

function extractGuildIdFromError(err: any): string | undefined {
  const candidates = [
    err?.path,
    err?.route,
    err?.request?.path,
    err?.stack,
    err?.message,
    String(err)
  ].filter(Boolean) as string[]

  for (const s of candidates) {
    const m = s.match(/\/guilds\/(\d{6,})\/voice-states/i)
    if (m?.[1]) return m[1]
  }
  return undefined
}

async function cleanup247ForGuild(guildId: string) {
  try {
    const docs = settingsCollection.find({ guildId })
    if (!docs?.length) return

    // delete all 24/7 settings rows for that guild
    settingsCollection.delete({ guildId })

    // optionally destroy an existing player if any
    const p = currentClient?.aqua?.players?.get(guildId)
    if (p) p.destroy()

    currentClient?.logger?.info?.(`[24/7] Removed settings for guild ${guildId} due to Unknown Voice State`)
  } catch (e) {
    console.error('cleanup247ForGuild failed:', e)
  }
}

export default createEvent({
  data: { once: true, name: 'botReady' },
  run: (user, client) => {
    currentClient = client

    // Ensure botId is set as early as possible
    if (!client.botId) client.botId = user.id

    client.aqua.init(client.botId)
    updatePresence(client)
    client.logger.info(`${user.username} is ready`)
    setTimeout(() => processAutoJoin(client), 6000)

    // Register a single unhandledRejection listener
    if (!(global as any).__vsHandlerRegistered) {
      (global as any).__vsHandlerRegistered = true
       client.logger.info('Registering unhandledRejection listener for voice state errors')
      process.on('unhandledRejection', async (reason: any) => {
        try {
          if (isUnknownVoiceStateError(reason)) {
            const gid = extractGuildIdFromError(reason)
            if (gid) await cleanup247ForGuild(gid)
          }
        } catch (e) {
          console.error('unhandledRejection handler failed:', e)
        }
      })
    }
  }
})

const processAutoJoin = async client => {
  const guildsWithTwentyFourSeven = settingsCollection.find({ twentyFourSevenEnabled: true })
  if (!guildsWithTwentyFourSeven.length) return;

  for (let i = 0; i < guildsWithTwentyFourSeven.length; i += BATCH_SIZE) {
    const batch = guildsWithTwentyFourSeven.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(settings => processGuild(client, settings))
    )

    if (i + BATCH_SIZE < guildsWithTwentyFourSeven.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }
}

const processGuild = async (client, settings) => {
  const { guildId, voiceChannelId, textChannelId, _id } = settings

  if (!voiceChannelId || !textChannelId) {
    settingsCollection.delete({ _id })
    return;
  }

  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null)
    if (!guild) {
      settingsCollection.delete({ _id })
      return;
    }

    const [voiceChannel, textChannel] = await Promise.all([
      guild.channels.fetch(voiceChannelId).catch(() => null),
      guild.channels.fetch(textChannelId).catch(() => null)
    ])

    if (!voiceChannel || voiceChannel.type !== 2) {
      settingsCollection.delete({ _id })
      return;
    }

    if (!textChannel || ![0, 5].includes(textChannel.type)) {
      settingsCollection.delete({ _id })
      return;
    }

    await Promise.all([
      client.aqua.createConnection({
        guildId,
        voiceChannel: voiceChannelId,
        textChannel: textChannelId,
        deaf: true,
        defaultVolume: 65
      }),
      updateNickname(guild)
    ])
  } catch (error) {
    console.error(`[Music] Guild ${guildId}: ${error.message}`)
    settingsCollection.delete({ _id })
  }
}

const updateNickname = async guild => {
  const botMember = guild.members.me
  if (!botMember) return;

  const currentNick = botMember.nickname || botMember.user.username
  if (currentNick.includes('[24/7]')) return;

  try {
    await botMember.edit({ nick: currentNick + NICKNAME_SUFFIX })
  } catch {}
}