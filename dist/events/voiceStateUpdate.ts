import process from 'node:process'
import { createEvent, Embed } from 'seyfert'
import QuickLRU from 'quick-lru'
import { isTwentyFourSevenEnabled, getChannelIds } from '../utils/db_helper'

const NO_SONG_TIMEOUT = 600_000
const REJOIN_DELAY = 5_000

const PlayerState = {
  IDLE: 0b0001,
  PLAYING: 0b0010,
  REJOINING: 0b0100,
  DESTROYING: 0b1000,
} as const

class CircuitBreaker {

  private failures = new QuickLRU<string, number>({ maxSize: 1000 })
  private lastAttempt = new QuickLRU<string, number>({ maxSize: 1000 })
  private readonly threshold = 3
  private readonly resetTime = 30_000

  canAttempt(guildId: string): boolean {
    const failures = this.failures.get(guildId) ?? 0
    const lastAttempt = this.lastAttempt.get(guildId) ?? 0

    if (failures >= this.threshold) {
      if (Date.now() - lastAttempt > this.resetTime) {
        this.failures.delete(guildId)
        this.lastAttempt.delete(guildId)
        return true
      }
      return false
    }
    return true
  }

  recordSuccess(guildId: string): void {
    this.failures.delete(guildId)
    this.lastAttempt.delete(guildId)
  }

  recordFailure(guildId: string): void {
    this.failures.set(guildId, (this.failures.get(guildId) ?? 0) + 1)
    this.lastAttempt.set(guildId, Date.now())
  }
}

class TimeoutHeap {
  private heap: Array<{ guildId: string; expiry: number; callback: Function }> = []
  private positions = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null

  add(guildId: string, callback: Function, delay: number): void {
    this.remove(guildId)

    const expiry = Date.now() + delay
    const entry = { guildId, expiry, callback }

    this.heap.push(entry)
    const index = this.heap.length - 1
    this.positions.set(guildId, index)
    this.bubbleUp(index)

    this.scheduleNext()
  }

  remove(guildId: string): void {
    const index = this.positions.get(guildId)
    if (index === undefined) return

    const last = this.heap.pop()!
    if (index < this.heap.length && last) {
      this.heap[index] = last
      this.positions.set(last.guildId, index)
      this.bubbleDown(index)
    }

    this.positions.delete(guildId)
    this.scheduleNext()
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.heap[parentIndex].expiry <= this.heap[index].expiry) break

      this.swap(index, parentIndex)
      index = parentIndex
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      let smallest = index
      const left = 2 * index + 1
      const right = 2 * index + 2

      if (left < this.heap.length && this.heap[left].expiry < this.heap[smallest].expiry) {
        smallest = left
      }
      if (right < this.heap.length && this.heap[right].expiry < this.heap[smallest].expiry) {
        smallest = right
      }

      if (smallest === index) break

      this.swap(index, smallest)
      index = smallest
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]]
    this.positions.set(this.heap[i].guildId, i)
    this.positions.set(this.heap[j].guildId, j)
  }

  private scheduleNext(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.heap.length === 0) return

    const next = this.heap[0]
    const delay = Math.max(0, next.expiry - Date.now())

    this.timer = setTimeout(() => {
      this.timer = null
      if (this.heap[0] === next) {
        this.remove(next.guildId)
        next.callback()
      }
      this.scheduleNext()
    }, delay)
  }

  clearAll(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.heap = []
    this.positions.clear()
  }
}

class ConnectionPool {
  private pool: any[] = []
  private readonly maxSize = 50

  acquire(config: any): any {
    const obj = this.pool.pop() || {}
    return Object.assign(obj, config)
  }

  release(obj: any): void {
    if (this.pool.length < this.maxSize) {

      for (const key in obj) {
        delete obj[key]
      }

      Object.setPrototypeOf(obj, Object.prototype)
      this.pool.push(obj)
    }
  }
}

class PlayerStateMachine {

  private states = new QuickLRU<string, number>({ maxSize: 5000 })
  private readonly transitions = new Map<number, Set<number>>([
    [PlayerState.IDLE, new Set([PlayerState.PLAYING, PlayerState.DESTROYING])],
    [PlayerState.PLAYING, new Set([PlayerState.IDLE, PlayerState.DESTROYING])],
    [PlayerState.REJOINING, new Set([PlayerState.PLAYING, PlayerState.IDLE])],
    [PlayerState.DESTROYING, new Set([PlayerState.REJOINING])],
  ])

  canTransition(guildId: string, toState: number): boolean {
    const currentState = this.states.get(guildId) ?? PlayerState.IDLE
    return this.transitions.get(currentState)?.has(toState) ?? false
  }

  transition(guildId: string, toState: number): boolean {
    if (!this.canTransition(guildId, toState)) return false
    this.states.set(guildId, toState)
    return true
  }

  getState(guildId: string): number {
    return this.states.get(guildId) ?? PlayerState.IDLE
  }

  clear(guildId: string): void {
    this.states.delete(guildId)
  }
}

class EventDebouncer {

  private pending = new QuickLRU<string, { timer: NodeJS.Timeout; events: any[] }>({
    maxSize: 1000,

    onEviction: (key, value) => {
      if (value.timer) {
        clearTimeout(value.timer)
      }
    }
  })
  private readonly delay = 100

  debounce(key: string, event: any, handler: (events: any[]) => void): void {
    const existing = this.pending.get(key)

    if (existing) {
      clearTimeout(existing.timer)
      existing.events.push(event)
    } else {
      this.pending.set(key, {
        events: [event],
        timer: setTimeout(() => {
          const data = this.pending.get(key)
          this.pending.delete(key)
          if (data) handler(data.events)
        }, this.delay)
      })
    }
  }

  cleanup(): void {

    for (const [key, value] of this.pending.entries()) {
      if (value.timer) {
        clearTimeout(value.timer)
      }
    }
    this.pending.clear()
  }
}

class OptimizedVoiceManager {
  private static instance: OptimizedVoiceManager
  private timeoutHeap = new TimeoutHeap()
  private circuitBreaker = new CircuitBreaker()
  private connectionPool = new ConnectionPool()
  private stateMachine = new PlayerStateMachine()
  private debouncer = new EventDebouncer()

  private channelCache = new QuickLRU<string, any>({ maxSize: 2000 })
  private registeredClients = new WeakSet<any>()

  static getInstance(): OptimizedVoiceManager {
    if (!this.instance) {
      this.instance = new OptimizedVoiceManager()
    }
    return this.instance
  }

  registerListeners(client: any): void {

    if (this.registeredClients.has(client)) return
    this.registeredClients.add(client)

    const aqua = client.aqua

    const trackStartHandler = (player: any) => {
      this.stateMachine.transition(player.guildId, PlayerState.PLAYING)
      this.timeoutHeap.remove(player.guildId)
    }

    const queueEndHandler = (player: any) => {
      this.stateMachine.transition(player.guildId, PlayerState.IDLE)
      if (!isTwentyFourSevenEnabled(player.guildId)) {
        this.scheduleInactiveHandler(client, player)
      }
    }

    const playerDestroyHandler = (player: any) => {
      if (!player?.guildId) return

      this.stateMachine.transition(player.guildId, PlayerState.DESTROYING)
      this.timeoutHeap.remove(player.guildId)

      if (isTwentyFourSevenEnabled(player.guildId)) {
        this.scheduleRejoin(client, player.guildId, player.voiceChannel, player.textChannel)
      } else {
        this.stateMachine.clear(player.guildId)
      }
    }

    aqua.on('trackStart', trackStartHandler)
    aqua.on('queueEnd', queueEndHandler)
    aqua.on('playerDestroy', playerDestroyHandler)

    client._voiceManagerHandlers = {
      trackStart: trackStartHandler,
      queueEnd: queueEndHandler,
      playerDestroy: playerDestroyHandler
    }
  }

  unregisterListeners(client: any): void {
    if (!this.registeredClients.has(client)) return
    this.registeredClients.delete(client)

    const handlers = client._voiceManagerHandlers
    if (handlers && client.aqua) {
      client.aqua.off('trackStart', handlers.trackStart)
      client.aqua.off('queueEnd', handlers.queueEnd)
      client.aqua.off('playerDestroy', handlers.playerDestroy)
    }
    delete client._voiceManagerHandlers
  }

  private scheduleRejoin(client: any, guildId: string, voiceId?: string, textId?: string): void {
    if (!this.circuitBreaker.canAttempt(guildId)) return

    const rejoinData = { guildId, voiceId, textId }

    this.timeoutHeap.add(guildId, async () => {
      if (!this.stateMachine.transition(rejoinData.guildId, PlayerState.REJOINING)) return

      try {
        await this.rejoinChannel(client, rejoinData.guildId, rejoinData.voiceId, rejoinData.textId)
        this.circuitBreaker.recordSuccess(rejoinData.guildId)
      } catch (error) {
        this.circuitBreaker.recordFailure(rejoinData.guildId)
        console.error(`Rejoin failed for ${rejoinData.guildId}:`, error)
      }
    }, REJOIN_DELAY)
  }

  private async rejoinChannel(
    client: any,
    guildId: string,
    voiceId?: string | null,
    textId?: string | null
  ): Promise<void> {
    if (client.aqua.players.get(guildId)) return

    let vId = voiceId
    let tId = textId

    if (!vId || !tId) {
      const channelIds = getChannelIds(guildId)
      if (!channelIds?.voiceChannelId || !channelIds?.textChannelId) return
      vId = channelIds.voiceChannelId
      tId = channelIds.textChannelId
    }

    let guild = this.channelCache.get(guildId)

    if (!guild) {
      guild = client.cache.guilds.get(guildId) ||
        await client.guilds.fetch?.(guildId).catch(() => null)

      if (guild) {
        this.channelCache.set(guildId, guild)
      }
    }

    if (!guild) return

    const voiceChannel = guild.channels?.get?.(vId) ||
      await guild.channels?.fetch?.(vId).catch(() => null)

    if (!voiceChannel || voiceChannel.type !== 2) return

    const config = this.connectionPool.acquire({
      guildId,
      voiceChannel: vId,
      textChannel: tId,
      deaf: true,
      defaultVolume: 65
    })

    await client.aqua.createConnection(config)
    this.connectionPool.release(config)
    this.stateMachine.transition(guildId, PlayerState.IDLE)
  }

  private scheduleInactiveHandler(client: any, player: any): void {
    const guildId = player.guildId

    this.timeoutHeap.add(guildId, async () => {
      const currentPlayer = client.aqua?.players?.get(guildId)
      if (!currentPlayer || currentPlayer.playing) return
      if (isTwentyFourSevenEnabled(guildId)) return

      await this.sendInactiveMessage(client, currentPlayer)
      currentPlayer.destroy()
    }, NO_SONG_TIMEOUT)
  }

  private async sendInactiveMessage(client: any, player: any): Promise<void> {
    if (!player.textChannel) return

    const embed = new Embed()
      .setColor(0)
      .setDescription(
        'No song added in 10 minutes, disconnecting...\nUse the `/24_7` command to keep the bot in voice channel.'
      )
      .setFooter({ text: 'Automatically destroying player' })

    const message = await client.messages
      .write(player.textChannel, { embeds: [embed] })
      .catch(() => null)

    if (message) {
      this.timeoutHeap.add(`msg_${message.id}`, () => {
        message.delete().catch(() => null)
      }, 10_000)
    }
  }

  handleVoiceUpdate(event: any, client: any): void {
    this.debouncer.debounce(event.guildId, event, (events) => {
      this.processVoiceUpdates(events[events.length - 1], client)
    })
  }

  private processVoiceUpdates(event: any, client: any): void {
    const { newState, oldState } = event
    const { guildId } = newState

    if (!guildId || oldState?.channelId === newState.channelId) return

    const player = client.aqua.players.get(guildId)
    const is247 = isTwentyFourSevenEnabled(guildId)

    if (!player && is247) {
      const channelIds = getChannelIds(guildId)
      if (channelIds?.voiceChannelId && channelIds?.textChannelId) {
        this.scheduleRejoin(client, guildId, channelIds.voiceChannelId, channelIds.textChannelId)
      }
    }

    if (player && !is247) {
      this.checkVoiceActivity(client, guildId, player)
    }
  }

  private async checkVoiceActivity(client: any, guildId: string, player: any): Promise<void> {
    const botMember = await client.cache.guilds
      .get(guildId)
      ?.members.fetch(client.botId)
      .catch(() => null)

    const voiceChannel = botMember?.voice()?.channel
    if (voiceChannel) {
      const humanCount = voiceChannel.members.filter((m: any) => !m.user.bot).size

      if (humanCount === 0) {
        this.scheduleInactiveHandler(client, player)
      } else {
        this.timeoutHeap.remove(guildId)
      }
    }
  }

  cleanup(): void {
    this.timeoutHeap.clearAll()
    this.debouncer.cleanup()
    this.channelCache.clear()
  }
}

const manager = OptimizedVoiceManager.getInstance()

export default createEvent({
  data: { name: 'voiceStateUpdate', once: false },
  run: async ([newState, oldState], client) => {
    if (!client.aqua?.players) return

    manager.registerListeners(client)
    manager.handleVoiceUpdate({ newState, oldState }, client)
  }
})

process.on('exit', () => manager.cleanup())
process.on('SIGTERM', () => manager.cleanup())
process.on('SIGINT', () => manager.cleanup())