import {
  Command,
  createStringOption,
  Declare,
  type GuildCommandContext,
  Options,
  Embed,
  Middlewares
} from 'seyfert'

/* =========================
   Constants
========================= */
const CACHE_SIZE = 10
const MAX_RESULTS = 4
const THROTTLE_MS = 300
const EMBED_COLOR = 0x000000

const ERR = {
  NO_VOICE: 'You must be in a voice channel to use this command.',
  NO_TRACKS: 'No tracks found for the given query.',
  GENERIC: 'An error occurred. Please try again.',
} as const

/* =========================
   Cache - Single global cache with LRU eviction
========================= */
const recentCache = new Map<string, string[]>() // userId -> [uri1, uri2, ...]
const throttle = new Map<string, number>() // userId -> timestamp
const searchCache = new Map<string, any>() // query -> results (TTL: 30s)

// Compact string truncation
const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 3) + '...' : s

// Fast markdown escape - only common chars
const esc = (s: string) => {
  let r = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    r += (c === '*' || c === '_' || c === '`' || c === '[' || c === ']') ? '\\' + c : c
  }
  return r
}

// Update recent tracks (LRU)
const updateRecent = (userId: string, uri: string) => {
  let items = recentCache.get(userId)
  if (!items) {
    recentCache.set(userId, [uri])
    // Evict oldest user if cache too large
    if (recentCache.size > 100) {
      const firstKey = recentCache.keys().next().value
      recentCache.delete(firstKey)
    }
    return
  }

  // Remove duplicate and add to front
  const idx = items.indexOf(uri)
  if (idx !== -1) items.splice(idx, 1)
  items.unshift(uri)
  if (items.length > CACHE_SIZE) items.length = CACHE_SIZE
}

/* =========================
   Options with Autocomplete
========================= */
const options = {
  query: createStringOption({
    description: 'The song you want to search for',
    required: true,
    autocomplete: async (interaction: any) => {
      const uid = interaction.user.id

      // Throttle check
      const now = Date.now()
      const last = throttle.get(uid) || 0
      if (now - last < THROTTLE_MS) return interaction.respond([])
      throttle.set(uid, now)

      // Clean old throttle entries periodically (every 100 calls)
      if (throttle.size > 100) {
        const threshold = now - 60000
        for (const [k, v] of throttle) {
          if (v < threshold) throttle.delete(k)
        }
      }

      const input = (interaction.getInput() || '').trim()

      // Show recent for empty/short queries
      if (!input || input.length < 2) {
        const recent = recentCache.get(uid)
        if (!recent?.length) return interaction.respond([])

        const choices = []
        for (let i = 0; i < Math.min(recent.length, MAX_RESULTS); i++) {
          const uri = recent[i]

          choices.push({
            name: `🕘 Recent ${i + 1}: ${trunc(uri, 79)}`,
            value: uri.slice(0, 100)
          })
        }
        return interaction.respond(choices)
      }

      // Skip URL autocomplete
      if (input[0] === 'h' && input.startsWith('http')) {
        return interaction.respond([])
      }

      try {
        // Check search cache first
        const cacheKey = input.slice(0, 50) // Limit cache key size
        let results = searchCache.get(cacheKey)

        if (!results) {
          results = await interaction.client.aqua.search(input, uid)
          if (!Array.isArray(results)) results = []

          // Cache with TTL cleanup
          searchCache.set(cacheKey, results)
          setTimeout(() => searchCache.delete(cacheKey), 30000)

          // Limit cache size
          if (searchCache.size > 50) {
            const firstKey = searchCache.keys().next().value
            searchCache.delete(firstKey)
          }
        }

        if (!results.length) return interaction.respond([])

        const choices = []
        const len = Math.min(results.length, MAX_RESULTS)
        for (let i = 0; i < len; i++) {
          const info = results[i]?.info
          if (!info?.uri) continue

          const title = info.title || 'Unknown'
          const author = info.author ? ` - ${trunc(info.author, 20)}` : ''
          const truncatedTitle = trunc(esc(title), 70)
          choices.push({
            name: `${truncatedTitle}${author}`.slice(0, 100),
            value: info.uri.slice(0, 100)
          })
        }

        return interaction.respond(choices)
      } catch {
        return interaction.respond([])
      }
    },
  }),
}

/* =========================
   Command
========================= */
@Declare({
  name: 'play',
  description: 'Play a song by search query or URL.',
})
@Options(options)
@Middlewares(['checkVoice'])
export default class Play extends Command {
  public override async run(ctx: GuildCommandContext): Promise<void> {
    const query = (ctx.options as any).query as string

    try {
      await ctx.deferReply(true)

      // Fast voice check
      const voice = await ctx.member.voice()
      if (!voice?.channelId) {
        await ctx.editResponse({ content: ERR.NO_VOICE })
        return
      }

      // Get or create player
      const player = ctx.client.aqua.createConnection({
        guildId: ctx.guildId,
        voiceChannel: voice.channelId,
        textChannel: ctx.channelId,
        deaf: true,
        defaultVolume: 65,
      })

      // Resolve tracks
      const result = await ctx.client.aqua.resolve({
        query,
        requester: ctx.interaction.user,
      })

      if (!result?.tracks?.length) {
        await ctx.editResponse({ content: ERR.NO_TRACKS })
        return
      }

      const { loadType, tracks, playlistInfo } = result
      const embed = new Embed().setColor(EMBED_COLOR).setTimestamp()

      // Handle single track or search
      if (loadType === 'track' || loadType === 'search') {
        const track = tracks[0]
        const info = track.info

        player.queue.add(track)
        updateRecent(ctx.interaction.user.id, info.title)

        embed.setDescription(`Added [**${esc(info.title || 'Track')}**](${info.uri}) to the queue.`)
      }
      // Handle playlist
      else if (loadType === 'playlist' && playlistInfo?.name) {
        // Batch add tracks
        for (let i = 0; i < tracks.length; i++) {
          player.queue.add(tracks[i])
        }

        if (tracks[0]?.info?.uri) {
          updateRecent(ctx.interaction.user.id, tracks[0].info.uri)
        }

        embed.setDescription(`Added **${esc(playlistInfo.name)}** playlist (${tracks.length} tracks) to the queue.`)
        if (playlistInfo.thumbnail) embed.setThumbnail(playlistInfo.thumbnail)
      }
      // Unsupported
      else {
        await ctx.editResponse({ content: 'Unsupported content type.' })
        return
      }

      await ctx.editResponse({ embeds: [embed] })

      // Start playback if needed
      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play()
      }
    } catch (error: any) {
      if (error?.code !== 10065) {
        console.error('Play error:', error)
        try {
          await ctx.editResponse({ content: ERR.GENERIC })
        } catch {}
      }
    }
  }
}
