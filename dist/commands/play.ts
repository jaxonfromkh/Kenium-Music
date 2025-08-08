import {
  Command,
  createStringOption,
  Declare,
  type GuildCommandContext,
  Options,
  Embed,
  Middlewares
} from 'seyfert'

const RECENT_SELECTIONS_MAX = 10
const MAX_AUTOCOMPLETE_RESULTS = 4
const MAX_RECENT_ITEMS = 4
const EMBED_COLOR = 0x000000
const AUTOCOMPLETE_THROTTLE_MS = 300
const CLEANUP_INTERVAL = 3600000
const MAX_CACHE_AGE = 86400000
const MAX_TITLE_LENGTH = 97
const MAX_AUTHOR_LENGTH = 20

const ERROR_MESSAGES = Object.freeze({
  NO_VOICE: 'You must be in a voice channel to use this command.',
  NO_TRACKS: 'No tracks found for the given query.',
  TIMEOUT: 'The request timed out. Please try again.',
  GENERIC: 'An error occurred while processing your request. Please try again later.',
  UNSUPPORTED: 'Unsupported content type.',
  getDifferentChannel: (id: string) => `I'm already in <#${id}>`
})

const RANKING_EMOJIS = ['🥇', '🥈', '🥉']

class UserCache {
  private cache = new Map<string, { items: any[], lastAccessed: number }>()
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor() {
    this.scheduleCleanup()
  }

  get(userId: string) {
    const data = this.cache.get(userId)
    if (data) {
      data.lastAccessed = Date.now()
      return data
    }
    return null
  }

  set(userId: string, items: any[]) {
    this.cache.set(userId, { items, lastAccessed: Date.now() })
  }

  private scheduleCleanup() {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer)

    this.cleanupTimer = setTimeout(() => {
      const now = Date.now()
      const keysToDelete: string[] = []

      for (const [key, value] of this.cache) {
        if (now - value.lastAccessed > MAX_CACHE_AGE) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach(key => this.cache.delete(key))
      this.scheduleCleanup()
    }, CLEANUP_INTERVAL)
  }

  destroy() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.cache.clear()
  }
}

const userRecentSelections = new UserCache()

const throttleMap = new Map<string, number>()

const isThrottled = (userId: string): boolean => {
  const now = Date.now()
  const lastCall = throttleMap.get(userId) || 0

  if (now - lastCall < AUTOCOMPLETE_THROTTLE_MS) {
    return true
  }

  throttleMap.set(userId, now)

  if (throttleMap.size > 100) {
    const threshold = now - 60000
    for (const [key, time] of throttleMap) {
      if (time < threshold) throttleMap.delete(key)
    }
  }

  return false
}

const truncateTrackName = (title: string = '', author: string = ''): string => {
  if (!title) return ''

  const titlePart = title.substring(0, MAX_TITLE_LENGTH)
  const authorPart = author ? ` - ${author.substring(0, MAX_AUTHOR_LENGTH)}` : ''
  const combined = titlePart + authorPart

  return combined.length > 100 ? `${combined.substring(0, 97)}...` : combined
}

const formatRecentSelection = (item: any, index: number): {name: string, value: string} => {
  const emoji = RANKING_EMOJIS[index] || ''
  const title = (item.title || 'Unknown').substring(0, 93)

  return {
    name: `${emoji} | Recently played: ${title}`.substring(0, 97),
    value: (item.uri || '').substring(0, 97)
  }
}

const getFormattedRecentSelections = (recentSelections: any[] = []): Array<{name: string, value: string}> => {
  return recentSelections
    .slice(0, MAX_RECENT_ITEMS)
    .map(formatRecentSelection)
}

const combineResultsWithRecent = (
  suggestions: Array<{name: string, value: string}>,
  recentSelections: any[],
  query: string
): Array<{name: string, value: string}> => {
  if (!query) {
    const formatted = getFormattedRecentSelections(recentSelections)
    return [...formatted, ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS)
  }

  const queryLower = query.toLowerCase()
  const suggestionUris = new Set(suggestions.map(s => s.value))

  const filteredRecent = []
  for (let i = 0; i < recentSelections.length && filteredRecent.length < MAX_RECENT_ITEMS; i++) {
    const item = recentSelections[i]
    if (!suggestionUris.has(item.uri) && item.title?.toLowerCase().includes(queryLower)) {
      filteredRecent.push({
        name: ` ${item.title.substring(0, 97)}`,
        value: item.uri.substring(0, 97)
      })
    }
  }

  return [...filteredRecent, ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS)
}

const updateRecentSelections = (userId: string, result: any): void => {
  const userSelections = userRecentSelections.get(userId)
  const items = userSelections?.items || []

  const { loadType, tracks, playlistInfo } = result

  if (loadType === 'track' || loadType === 'search') {
    const track = tracks?.[0]
    if (track?.info?.uri) {
      const newItem = {
        title: track.info.title,
        uri: track.info.uri,
        author: track.info.author
      }

      const existingIndex = items.findIndex(item => item.uri === newItem.uri)
      if (existingIndex !== -1) {
        items.splice(existingIndex, 1)
      }

      items.unshift(newItem)
    }
  } else if (loadType === 'playlist' && playlistInfo?.name && tracks?.[0]?.info?.uri) {
    items.unshift({
      title: `${playlistInfo.name} (Playlist)`,
      uri: tracks[0].info.uri,
    })
  }

  if (items.length > RECENT_SELECTIONS_MAX) {
    items.length = RECENT_SELECTIONS_MAX
  }

  userRecentSelections.set(userId, items)
}

const options = {
  query: createStringOption({
    description: 'The song you want to search for',
    required: true,
    autocomplete: async (interaction: any) => {
      const userId = interaction.user.id

      if (isThrottled(userId)) {
        return interaction.respond([])
      }

      const memberVoice = await interaction.member?.voice().catch(() => null)
      if (!memberVoice) {
        return interaction.respond([])
      }

      const focused = interaction.getInput() || ''

      if (focused.startsWith('http://') || focused.startsWith('https://')) {
        return interaction.respond([])
      }

      const userSelections = userRecentSelections.get(userId)
      const recentSelections = userSelections?.items || []

      try {
        if (!focused) {
          return interaction.respond(getFormattedRecentSelections(recentSelections))
        }

        const { client } = interaction
        const result = await client.aqua.search(focused, userId)

        if (!result?.length) {
          return interaction.respond(getFormattedRecentSelections(recentSelections))
        }

        const suggestions = []
        for (let i = 0; i < Math.min(result.length, MAX_AUTOCOMPLETE_RESULTS); i++) {
          const track = result[i]
          if (track?.info?.uri) {
            suggestions.push({
              name: truncateTrackName(track.info.title, track.info.author),
              value: track.info.uri.substring(0, 97)
            })
          }
        }

        const combined = combineResultsWithRecent(suggestions, recentSelections, focused)
        return interaction.respond(combined)

      } catch (error: any) {
        if (error.code === 10065) return;
        console.error('Autocomplete error:', error)
        return interaction.respond(getFormattedRecentSelections(recentSelections))
      }
    },
  }),
}

@Declare({
  name: 'play',
  description: 'Play a song by search query or URL.',
})
@Options(options)
@Middlewares(['checkVoice'])
export default class Play extends Command {
  private createPlayEmbed(result: any, player: any, query: string): Embed | null {
    const embed = new Embed().setColor(EMBED_COLOR).setTimestamp()
    const { loadType, tracks, playlistInfo } = result

    if (loadType === 'track' || loadType === 'search') {
      const track = tracks[0]
      if (!track?.info) return null

      player.queue.add(track)
      embed.setDescription(`Added [**${track.info.title}**](${track.info.uri}) to the queue.`)

    } else if (loadType === 'playlist') {
      if (!tracks?.length || !playlistInfo?.name) return null

        for (const track of tracks) {
          player.queue.add(track)
        }
      embed.setDescription(
        `Added [**${playlistInfo.name}**](${query}) playlist (${tracks.length} tracks) to the queue.`
      )

      if (playlistInfo.thumbnail) {
        embed.setThumbnail(playlistInfo.thumbnail)
      }

    } else {
      embed.setDescription(ERROR_MESSAGES.UNSUPPORTED)
    }

    return embed
  }

  public override async run(ctx: GuildCommandContext): Promise<void> {
    const { options, client, channelId, member } = ctx
    const { query } = options as { query: string }

    try {
      const [me, state] = await Promise.all([
        ctx.me(),
        member.voice()
      ])

      if (!me) {
        await ctx.editResponse({ content: 'I couldn\'t find myself in the guild.' })
        return;
      }

      await ctx.deferReply(true)

      const player = client.aqua.createConnection({
        guildId: ctx.guildId,
        voiceChannel: state.channelId,
        textChannel: channelId,
        deaf: true,
        defaultVolume: 65,
      })

      const result = await client.aqua.resolve({
        query: query,
        requester: ctx.interaction.user,
      })

      if (!result) {
        await ctx.editResponse({ content: 'No results found.' })
        return;
      }

      updateRecentSelections(ctx.interaction.user.id, result)

      const embed = this.createPlayEmbed(result, player, query)
      if (!embed) {
        await ctx.editResponse({ content: ERROR_MESSAGES.NO_TRACKS })
        return;
      }

      await ctx.editResponse({ embeds: [embed] })

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play()
      }
    } catch (error: any) {
      if (error.code === 10065) return;
      console.error('Command execution error:', error)
      await ctx.editResponse({ content: ERROR_MESSAGES.GENERIC })
    }
  }
}