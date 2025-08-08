import { createEvent, Embed } from 'seyfert'
import { isTwentyFourSevenEnabled, getChannelIds } from '../utils/db_helper'

const NO_SONG_TIMEOUT = 600000
const REJOIN_DELAY = 5000

class TimeoutManager {
private timeouts: Map<string, any>;
  constructor() {
    this.timeouts = new Map()
  }

  clear(guildId) {
    const timeout = this.timeouts.get(guildId)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(guildId)
    }
  }

  set(guildId, callback, delay) {
    this.clear(guildId)
    const timeout = setTimeout(() => {
      this.timeouts.delete(guildId)
      callback()
    }, delay)
    this.timeouts.set(guildId, timeout)
  }

  clearAll() {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout)
    }
    this.timeouts.clear()
  }
}

const timeoutManager = new TimeoutManager()
let listenersRegistered = false

function registerEventListeners(client) {
  if (listenersRegistered) return;
  listenersRegistered = true

  const aqua = client.aqua

  aqua.on('trackStart', player => {
    timeoutManager.clear(player.guildId)
  })

  aqua.on('queueEnd', player => {
    if (!isTwentyFourSevenEnabled(player.guildId)) {
      handleInactivePlayer(client, player)
    }
  })

  aqua.on('playerDestroy', async player => {
    if (!player?.guildId || !player?.voiceChannel || !player?.textChannel) return;

    if (isTwentyFourSevenEnabled(player.guildId)) {
      setTimeout(() => {
        rejoinChannel(client, player.guildId, player.voiceChannel, player.textChannel)
      }, REJOIN_DELAY)
    }
  })
}

async function rejoinChannel(client, guildId, voiceChannelId, textChannelId) {
  try {
    if (client.aqua.players.get(guildId)) return;

    if (!voiceChannelId || !textChannelId) {
      const channelIds = getChannelIds(guildId)
      if (!channelIds?.voiceChannelId || !channelIds?.textChannelId) return;

      voiceChannelId = channelIds.voiceChannelId
      textChannelId = channelIds.textChannelId
    }

    const guild = await client.guilds.fetch(guildId).catch(() => null)
    if (!guild) return;

    const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null)
    if (!voiceChannel || voiceChannel.type !== 2) return;

    await client.aqua.createConnection({
      guildId,
      voiceChannel: voiceChannelId,
      textChannel: textChannelId,
      deaf: true,
      defaultVolume: 65
    })
  } catch (error) {
    console.error(`Failed to rejoin voice channel in guild ${guildId}:`, error.message)
  }
}

function handleInactivePlayer(client, player) {
  const guildId = player.guildId

  timeoutManager.set(guildId, async () => {
    try {
      const currentPlayer = client.aqua?.players?.get(guildId)
      if (!currentPlayer || currentPlayer.playing) return;

      if (isTwentyFourSevenEnabled(guildId)) return;

      if (currentPlayer.textChannel) {
        const textChannel = await client.channels.fetch(currentPlayer.textChannel).catch(() => null)

        if (textChannel && textChannel.type === 0) {
          const embed = new Embed()
            .setColor(0)
            .setDescription('No song added in 10 minutes, disconnecting...\nUse the `/24_7` command to keep the bot in voice channel.')
            .setFooter({ text: 'Automatically destroying player' })

          const message = await client.messages.write(textChannel.id, { embeds: [embed] }).catch(() => null)

          if (message) {
            setTimeout(() => message.delete().catch(() => null), 10000)
          }
        }
      }

      currentPlayer.destroy()
    } catch (error) {
      console.error(`Error in timeout handler for guild ${guildId}:`, error.message)

      const player = client.aqua?.players?.get(guildId)
      if (player) player.destroy()
    }
  }, NO_SONG_TIMEOUT)
}

export default createEvent({
  data: { name: 'voiceStateUpdate', once: false },
  async run([newState, oldState], client) {
    if (!client.aqua?.players || !oldState?.guildId) return;

    const guildId = oldState.guildId
    const player = client.aqua.players.get(guildId)

    if (!listenersRegistered) {
      registerEventListeners(client)
    }

    const botMember = await client.cache.guilds.get(guildId)?.members.fetch(client.botId).catch(() => null)

    if (!player || !botMember?.voice()?.channelId ||
        (oldState.channelId === client.botId && oldState.channelId && !newState.channelId)) {

      if (isTwentyFourSevenEnabled(guildId)) {
        const channelIds = getChannelIds(guildId)
        if (channelIds?.voiceChannelId && channelIds?.textChannelId) {
          setTimeout(() => {
            rejoinChannel(client, guildId, channelIds.voiceChannelId, channelIds.textChannelId)
          }, REJOIN_DELAY)
        }
      }
      return;
    }

    const voiceChannel = botMember.voice().channel
    const is247Enabled = isTwentyFourSevenEnabled(guildId)

    if (voiceChannel) {
      const humanMembers = voiceChannel.members.filter(m => !m.user.bot).size

      if (humanMembers === 0) {
        if (!is247Enabled) {
          handleInactivePlayer(client, player)
        }
      } else {
        timeoutManager.clear(guildId)
      }
    }

    if (player && !player.playing && !player.paused && !is247Enabled) {
      handleInactivePlayer(client, player)
    } else if (player && player.playing) {
      timeoutManager.clear(guildId)
    }
  }
})

process.on('exit', () => timeoutManager.clearAll())
