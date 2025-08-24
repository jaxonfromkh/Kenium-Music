import {
  Command,
  createStringOption,
  Declare,
  Options,
  Embed,
  Middlewares
} from 'seyfert'


const CACHE_SIZE = 10
const MAX_USER_CACHE = 200
const MAX_SEARCH_CACHE = 128
const MAX_RESULTS = 4
const THROTTLE_MS = 300
const SEARCH_TTL_MS = 30_000
const SWEEP_INTERVAL_MS = 5_000
const EMBED_COLOR = 0x000000

const URL_RE = /^https?:\/\//i
const MD_ESCAPE_RE = /([\\`*_\[\]()~`>#+\-=|{}!.])/g
const esc = s => String(s || '').replace(MD_ESCAPE_RE, '\\$1')
const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 3) + '...')

const ERR = {
  NO_VOICE: 'You must be in a voice channel to use this command.',
  NO_TRACKS: 'No tracks found for the given query.',
  GENERIC: 'An error occurred. Please try again.'
}

class CacheManager {
  private map: Map<string, any>;
  private maxSize: number;
  private ttl: number;
  constructor(maxSize = 128, ttl = 30_000) {
    this.map = new Map()
    this.maxSize = maxSize
    this.ttl = ttl
  }

  get(key) {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expires) {
      this.map.delete(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key, value) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value
      if (firstKey) this.map.delete(firstKey)
    }
    this.map.set(key, { value, expires: Date.now() + this.ttl })
  }

  delete(key) { this.map.delete(key) }

  sweep() {
    const now = Date.now()
    for (const [k, v] of this.map) {
      if (now > v.expires) this.map.delete(k)
    }
  }
}

type RecentItem = { title: string; uri: string }

class RecentTracks {
  private map: Map<string, RecentItem[]>
  private maxUsers: number
  private maxTracks: number
  constructor(maxUsers = MAX_USER_CACHE, maxTracks = CACHE_SIZE) {
    this.map = new Map()
    this.maxUsers = maxUsers
    this.maxTracks = maxTracks
  }

  add(userId: string, title: string, uri: string) {
    if (!uri) return
    const item: RecentItem = { title: title || uri, uri }
    let arr = this.map.get(userId)
    if (!arr) {
      if (this.map.size >= this.maxUsers) {
        const firstKey = this.map.keys().next().value
        if (firstKey) this.map.delete(firstKey)
      }
      this.map.set(userId, [item])
      return
    }

    // remove existing entries with same uri
    arr = arr.filter(x => x.uri !== uri)
    const result = [item, ...arr].slice(0, this.maxTracks)
    this.map.set(userId, result)
  }

  get(userId: string): RecentItem[] | undefined {
    return this.map.get(userId)
  }
}

class ThrottleManager {
  private map: Map<string, number>
  private retentionMs: number
  private counter: number
  private cleanupInterval: number
  constructor(retentionMs = 60_000, cleanupInterval = 256) {
    this.map = new Map()
    this.retentionMs = retentionMs
    this.counter = 0
    this.cleanupInterval = cleanupInterval
  }

  shouldThrottle(userId, ms = THROTTLE_MS) {
    const now = Date.now()
    const last = this.map.get(userId) || 0
    if (now - last < ms) return true
    this.map.set(userId, now)
    if (++this.counter >= this.cleanupInterval) {
      this.counter = 0
      this.cleanup(now)
    }
    return false
  }

  cleanup(now = Date.now()) {
    const threshold = now - this.retentionMs
    for (const [k, v] of this.map) if (v < threshold) this.map.delete(k)
  }
}

const searchCache = new CacheManager(MAX_SEARCH_CACHE, SEARCH_TTL_MS)
const recentTracks = new RecentTracks()
const throttleManager = new ThrottleManager()

setInterval(() => {
  searchCache.sweep()
}, SWEEP_INTERVAL_MS).unref && setInterval(() => {}).unref()

const options = {
  query: createStringOption({
    description: 'The song you want to search for',
    required: true,
    autocomplete: async interaction => {
      const uid = interaction.user.id
      if (throttleManager.shouldThrottle(uid)) return interaction.respond([])

      const raw = interaction.getInput()
      const input = (raw ? String(raw) : '').trim()

      if (!input || input.length < 2) {
        const recent = recentTracks.get(uid)
        if (!recent?.length) return interaction.respond([])
        const limit = Math.min(recent.length, MAX_RESULTS)
        const choices = new Array(limit)
        for (let i = 0; i < limit; i++) {
          const title = recent[i].title || recent[i].uri
          const uri = recent[i].uri
          choices[i] = { name: `🕘 Recent ${i + 1}: ${trunc(title, 79)}`, value: uri.slice(0, 100) }
        }
        return interaction.respond(choices)
      }

      if (URL_RE.test(input)) return interaction.respond([])

      try {
        const key = input.toLowerCase().slice(0, 80)
        let results = searchCache.get(key)
        if (!results) {
          results = await interaction.client.aqua.search(input, uid)
          if (!Array.isArray(results)) results = []
          if (results.length) searchCache.set(key, results)
        }
        if (!results.length) return interaction.respond([])

        const len = Math.min(results.length, MAX_RESULTS)
        const choices = []
        for (let i = 0; i < len; i++) {
          const info = results[i]?.info
          if (!info?.uri) continue
          const title = esc(info.title || 'Unknown')
          const author = info.author ? ` - ${trunc(esc(info.author), 20)}` : ''
          choices.push({ name: `${trunc(title, 70)}${author}`.slice(0, 100), value: String(info.uri).slice(0, 100) })
        }
        return interaction.respond(choices)
      } catch (e) {
        return interaction.respond([])
      }
    }
  })
}

@Declare({ name: 'play', description: 'Play a song by search query or URL.' })
@Options(options)
@Middlewares(['checkVoice'])
export default class Play extends Command {
  async run(ctx) {
    const query = (ctx.options || {}).query
    try {
      await ctx.deferReply(true)
      const voice = await ctx.member.voice()
      if (!voice?.channelId) return void (await ctx.editResponse({ content: ERR.NO_VOICE }))

      const player = ctx.client.aqua.createConnection({
        guildId: ctx.guildId,
        voiceChannel: voice.channelId,
        textChannel: ctx.channelId,
        deaf: true,
        defaultVolume: 65
      })

      const result = await ctx.client.aqua.resolve({ query, requester: ctx.interaction.user })
      if (!result?.tracks?.length) return void (await ctx.editResponse({ content: ERR.NO_TRACKS }))

      const { loadType, tracks, playlistInfo } = result
      const embed = new Embed().setColor(EMBED_COLOR).setTimestamp()

      const safeAddToQueue = async items => {
        if (!items || !items.length) return
        for (const it of items) player.queue.add(it)
      }

      if (loadType === 'track' || loadType === 'search') {
        const track = tracks[0]
        const info = track?.info || {}
        await safeAddToQueue([track])
        recentTracks.add(ctx.interaction.user.id, info.title || query, info.uri || query)
        embed.setDescription(`Added [**${esc(info.title || 'Track')}**](${info.uri || '#'}) to the queue.`)
      } else if (loadType === 'playlist' && playlistInfo?.name) {
        await safeAddToQueue(tracks)
        const firstTitle = tracks[0]?.info?.title
        const firstUri = tracks[0]?.info?.uri
        if (firstUri) recentTracks.add(ctx.interaction.user.id, firstTitle || firstUri, firstUri)
        embed.setDescription(`Added **${esc(playlistInfo.name)}** playlist (${tracks.length} tracks) to the queue.`)
        if (playlistInfo.thumbnail) embed.setThumbnail(playlistInfo.thumbnail)
      } else {
        return void (await ctx.editResponse({ content: 'Unsupported content type.' }))
      }

      await ctx.editResponse({ embeds: [embed] })
      if (!player.playing && !player.paused && player.queue.size > 0) {
        try { player.play() } catch (e) { console.error('play start error', e) }
      }
    } catch (err) {
      if (!err || err.code === 10065) return
      console.error('Play error:', err)
      try { await ctx.editResponse({ content: ERR.GENERIC }) } catch {}
    }
  }
}
