import { createEvent } from 'seyfert'

import { SimpleDB } from '../utils/simpleDB'
import { updatePresence } from '../../index'

const db = new SimpleDB()
const settingsCollection = db.collection('guildSettings')
const NICKNAME_SUFFIX = ' [24/7]'
const BATCH_SIZE = 10
const BATCH_DELAY = 500

export default createEvent({
  data: { once: true, name: 'botReady' },
  run: (user, client) => {
    client.aqua.init(client.botId)
    updatePresence(client)
    client.logger.info(`${user.username} is ready`)
    setTimeout(() => processAutoJoin(client), 6000)
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