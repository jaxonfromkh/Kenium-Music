import process from 'node:process'
import { createEvent, Embed } from 'seyfert'

import { isTwentyFourSevenEnabled, getChannelIds } from '../utils/db_helper'

const NO_SONG_TIMEOUT = 600_000
const REJOIN_DELAY = 5_000

class TimeoutManager {
  private timeouts: Map<string, NodeJS.Timeout>
  constructor() {
    this.timeouts = new Map()
  }
  clear(guildId: string) {
    const timeout = this.timeouts.get(guildId)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(guildId)
    }
  }
  set(guildId: string, callback: () => void | Promise<void>, delay: number) {
    this.clear(guildId)
    const timeout = setTimeout(() => {
      this.timeouts.delete(guildId)

      void callback()
    }, delay)
    this.timeouts.set(guildId, timeout)
  }
  clearAll() {
    for (const timeout of this.timeouts.values()) clearTimeout(timeout)
    this.timeouts.clear()
  }
}

const timeoutManager = new TimeoutManager()
let listenersRegistered = false

const registerEventListeners = (client: any) => {
  if (listenersRegistered) return
  listenersRegistered = true

  const aqua = client.aqua

  aqua.on('trackStart', (player: any) => {
    timeoutManager.clear(player.guildId)
  })

  aqua.on('queueEnd', (player: any) => {
    if (!isTwentyFourSevenEnabled(player.guildId)) {
      handleInactivePlayer(client, player)
    }
  })

  aqua.on('playerDestroy', (player: any) => {

    if (player?.guildId) timeoutManager.clear(player.guildId)

    if (!player?.guildId) return
    if (!isTwentyFourSevenEnabled(player.guildId)) return

    setTimeout(() => {
      rejoinChannel(client, player.guildId, player.voiceChannel, player.textChannel)
    }, REJOIN_DELAY)
  })
}

const rejoinChannel = async (
  client: any,
  guildId: string,
  voiceChannelId?: string | null,
  textChannelId?: string | null
) => {
  try {

    if (client.aqua.players.get(guildId)) return

    let vId = voiceChannelId ?? undefined
    let tId = textChannelId ?? undefined

    if (!vId || !tId) {
      const channelIds = getChannelIds(guildId)
      if (!channelIds?.voiceChannelId || !channelIds?.textChannelId) return
      vId = channelIds.voiceChannelId
      tId = channelIds.textChannelId
    }

    const guild =
      client.cache.guilds.get(guildId) ||
      (await client.guilds.fetch?.(guildId).catch(() => null))
    if (!guild) return

    const voiceChannel =
      guild.channels?.get?.(vId) ||
      (await guild.channels?.fetch?.(vId).catch(() => null))

    if (!voiceChannel || voiceChannel.type !== 2) return

    await client.aqua.createConnection({
      guildId,
      voiceChannel: vId,
      textChannel: tId,
      deaf: true,
      defaultVolume: 65
    })
  } catch (error) {
    console.error(`Failed to rejoin voice channel in guild ${guildId}:`, error)
  }
}

const handleInactivePlayer = (client: any, player: any) => {
  const guildId = player.guildId

  timeoutManager.set(
    guildId,
    async () => {
      try {
        const currentPlayer = client.aqua?.players?.get(guildId)
        if (!currentPlayer || currentPlayer.playing) return
        if (isTwentyFourSevenEnabled(guildId)) return

        if (currentPlayer.textChannel) {
          const textChannel = await client.channels
            .fetch(currentPlayer.textChannel)
            .catch(() => null)

          if (textChannel && textChannel.type === 0) {
            const embed = new Embed()
              .setColor(0)
              .setDescription(
                'No song added in 10 minutes, disconnecting...\nUse the `/24_7` command to keep the bot in voice channel.'
              )
              .setFooter({ text: 'Automatically destroying player' })

            const message = await client.messages
              .write(textChannel.id, { embeds: [embed] })
              .catch(() => null)
            if (message) {
              setTimeout(() => message.delete().catch(() => null), 10_000)
            }
          }
        }

        currentPlayer.destroy()
      } catch (error) {
        console.error(`Error in timeout handler for guild ${guildId}:`, error)
        const p = client.aqua?.players?.get(guildId)
        if (p) p.destroy()
      }
    },
    NO_SONG_TIMEOUT
  )
}

export default createEvent({
  data: { name: 'voiceStateUpdate', once: false },

  run: async ([oldState, newState]: any[], client: any) => {
    if (!client.aqua?.players) return

    const guildId = oldState?.guildId ?? newState?.guildId
    if (!guildId) return

    const player = client.aqua.players.get(guildId)

    if (!listenersRegistered) {
      registerEventListeners(client)
    }

    const is247Enabled = isTwentyFourSevenEnabled(guildId)

    const botLeftVoice =
      oldState?.userId === client.botId && oldState?.channelId && !newState?.channelId

    if (!player || !player.voiceChannel || botLeftVoice) {
      if (is247Enabled) {
        const channelIds = getChannelIds(guildId)
        if (channelIds?.voiceChannelId && channelIds?.textChannelId) {
          setTimeout(() => {
            rejoinChannel(client, guildId, channelIds.voiceChannelId, channelIds.textChannelId)
          }, REJOIN_DELAY)
        }
      }
      return
    }

    if (!is247Enabled) {

      const botMember = await client.cache.guilds
        .get(guildId)
        ?.members.fetch(client.botId)
        .catch(() => null)

      const voiceChannel = botMember?.voice()?.channel
      if (voiceChannel) {
        const humanMembers = voiceChannel.members.filter((m: any) => !m.user.bot).size
        if (humanMembers === 0) {
          handleInactivePlayer(client, player)
        } else {
          timeoutManager.clear(guildId)
        }
      }

      if (!player.playing && !player.paused) {
        handleInactivePlayer(client, player)
      } else if (player.playing) {
        timeoutManager.clear(guildId)
      }
    } else {

      timeoutManager.clear(guildId)
    }
  }
})

process.on('exit', () => timeoutManager.clearAll())
