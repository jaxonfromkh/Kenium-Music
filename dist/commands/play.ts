import {
    Command,
    createStringOption,
    Declare,
    type GuildCommandContext,
    Options,
    Embed,
    Middlewares
} from "seyfert";

// Constants
const RECENT_SELECTIONS_MAX = 10;
const MAX_AUTOCOMPLETE_RESULTS = 4;
const MAX_RECENT_ITEMS = 4;
const EMBED_COLOR = 0x000000;
const AUTOCOMPLETE_THROTTLE_MS = 500;
const CLEANUP_INTERVAL = 3600000;
const MAX_CACHE_AGE = 86400000;

const URL_REGEX = /^https?:\/\/.+/i;
const CLEANUP_REGEX = /\s+/g;

const ERROR_MESSAGES = Object.freeze({
    NO_VOICE: "You must be in a voice channel to use this command.",
    NO_TRACKS: "No tracks found for the given query.",
    TIMEOUT: "The request timed out. Please try again.",
    GENERIC: "An error occurred while processing your request. Please try again later.",
    UNSUPPORTED: "Unsupported content type.",
    getDifferentChannel: (id: string) => `I'm already in <#${id}>`
});

class UserCache {
    private cache = new Map<string, { items: any[], lastAccessed: number }>();
    private lastCleanup = Date.now();

    get(userId: string) {
        const data = this.cache.get(userId);
        if (data) {
            data.lastAccessed = Date.now();
        }
        return data;
    }

    set(userId: string, data: { items: any[], lastAccessed: number }) {
        this.cache.set(userId, data);
        this.maybeCleanup();
    }

    private maybeCleanup() {
        const now = Date.now();
        if (now - this.lastCleanup > CLEANUP_INTERVAL) {
            this.cleanup();
            this.lastCleanup = now;
        }
    }

    private cleanup() {
        const now = Date.now();
        const toDelete: string[] = [];
        
        for (const [userId, data] of this.cache) {
            if (now - data.lastAccessed > MAX_CACHE_AGE) {
                toDelete.push(userId);
            }
        }
        
        toDelete.forEach(userId => this.cache.delete(userId));
    }
}

const userRecentSelections = new UserCache();
let lastAutocomplete = 0;

const truncateTrackName = (title: string = "", author: string = ""): string => {
    const titlePart = title.slice(0, 97);
    const authorPart = author ? ` - ${author.slice(0, 20)}` : "";
    const combined = titlePart + authorPart;
    return combined.length > 100 ? combined.slice(0, 97) + "..." : combined;
};

const getFormattedRecentSelections = (recentSelections: any[] = []): Array<{name: string, value: string}> => {
    const rankingEmojis = ['🥇', '🥈', '🥉'];
    
    return recentSelections
        .slice(0, MAX_RECENT_ITEMS)
        .map((item, index) => ({
            name: `${rankingEmojis[index] || ''} | Recently played: ${(item.title || "Unknown").slice(0, 93)}`.slice(0, 97),
            value: (item.uri || "").slice(0, 97)
        }));
};

const combineResultsWithRecent = (
    suggestions: Array<{name: string, value: string}>, 
    recentSelections: any[], 
    query: string
): Array<{name: string, value: string}> => {
    if (!query) return [...getFormattedRecentSelections(recentSelections), ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS);
    
    const queryLower = query.toLowerCase();
    const suggestionUris = new Set(suggestions.map(s => s.value));

    const filteredRecent = recentSelections
        .filter(item => 
            !suggestionUris.has(item.uri) && 
            item.title?.toLowerCase().includes(queryLower)
        )
        .slice(0, MAX_RECENT_ITEMS)
        .map(item => ({ 
            name: ` ${item.title.slice(0, 97)}`, 
            value: item.uri.slice(0, 97) 
        }));

    return [...filteredRecent, ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS);
};

const updateRecentSelections = (userId: string, result: any): void => {
    let userSelections = userRecentSelections.get(userId);

    if (!userSelections) {
        userSelections = { items: [], lastAccessed: Date.now() };
        userRecentSelections.set(userId, userSelections);
    } else {
        userSelections.lastAccessed = Date.now();
    }

    const { loadType, tracks } = result;
    
    if (loadType === "track" || loadType === "search") {
        if (tracks?.[0]) {
            addTrackToRecentSelections(userSelections.items, tracks[0]);
        }
    } else if (loadType === "playlist" && tracks?.[0]) {
        addPlaylistToRecentSelections(userSelections.items, result);
    }

    if (userSelections.items.length > RECENT_SELECTIONS_MAX) {
        userSelections.items.length = RECENT_SELECTIONS_MAX;
    }
};

const addTrackToRecentSelections = (selections: any[], track: any): void => {
    const { info } = track;
    if (!info?.uri) return;

    const existingIndex = selections.findIndex(item => item.uri === info.uri);
    if (existingIndex !== -1) {
        selections.splice(existingIndex, 1);
    }

    selections.unshift({
        title: info.title,
        uri: info.uri,
        author: info.author
    });
};

const addPlaylistToRecentSelections = (selections: any[], result: any): void => {
    const { playlistInfo, tracks } = result;
    if (!playlistInfo?.name || !tracks?.[0]?.info?.uri) return;

    selections.unshift({
        title: `${playlistInfo.name} (Playlist)`,
        uri: tracks[0].info.uri,
    });
};

const options = {
    query: createStringOption({
        description: "The song you want to search for",
        required: true,
        autocomplete: async (interaction: any) => {
            const { client } = interaction;
            
            const now = Date.now();
            if (now - lastAutocomplete < AUTOCOMPLETE_THROTTLE_MS) {
                return interaction.respond([]);
            }
            lastAutocomplete = now;

            const memberVoice = await interaction.member?.voice().catch(() => null);
            if (!memberVoice) {
                return interaction.respond([]);
            }

            const focused = interaction.getInput() || "";
            const userId = interaction.user.id;
            
            if (URL_REGEX.test(focused)) {
                return interaction.respond([]);
            }

            const recentSelectionObject = userRecentSelections.get(userId);
            const recentSelections = recentSelectionObject?.items || [];

            try {
                if (!focused) {
                    return interaction.respond(getFormattedRecentSelections(recentSelections));
                }

                const result = await client.aqua.search(focused, userId);

                if (!result?.length) {
                    return interaction.respond(getFormattedRecentSelections(recentSelections));
                }

                const suggestions = result
                    .slice(0, MAX_AUTOCOMPLETE_RESULTS)
                    .map(track => ({
                        name: truncateTrackName(track?.info?.title, track?.info?.author),
                        value: track?.info?.uri?.slice(0, 97) || ""
                    }))
                    .filter(s => s.value);

                const combined = combineResultsWithRecent(suggestions, recentSelections, focused);
                return interaction.respond(combined);
                
            } catch (error: any) {
                if (error.code === 10065) return;
                console.error("Autocomplete error:", error);
                return interaction.respond(getFormattedRecentSelections(recentSelections));
            }
        },
    }),
};

@Declare({
    name: "play",
    description: "Play a song by search query or URL.",
})
@Options(options)
@Middlewares(["checkVoice"])
export default class Play extends Command {
    private createPlayEmbed(result: any, player: any, query: string): Embed {
        const embed = new Embed().setColor(EMBED_COLOR).setTimestamp();
        const { loadType, tracks, playlistInfo } = result;

        switch (loadType) {
            case "track":
            case "search": {
                const track = tracks[0];
                if (!track?.info) throw new Error(ERROR_MESSAGES.UNSUPPORTED);
                
                player.queue.add(track);
                embed.setDescription(`Added [**${track.info.title}**](${track.info.uri}) to the queue.`);
                break;
            }
            case "playlist": {
                if (!tracks?.length || !playlistInfo?.name) {
                    throw new Error(ERROR_MESSAGES.UNSUPPORTED);
                }

                for (const track of tracks) {
                    player.queue.add(track);
                }
                
                embed.setDescription(
                    `Added [**${playlistInfo.name}**](${query}) playlist (${tracks.length} tracks) to the queue.`
                );
                
                if (playlistInfo.thumbnail) {
                    embed.setThumbnail(playlistInfo.thumbnail);
                }
                break;
            }
            default:
                throw new Error(ERROR_MESSAGES.UNSUPPORTED);
        }
        return embed;
    }

    private async sendErrorReply(ctx: GuildCommandContext, content: string): Promise<void> {
        await ctx.editResponse({ content });
    }

    public override async run(ctx: GuildCommandContext): Promise<void> {
        const { options, client, channelId, member } = ctx;
        const { query } = options as { query: string };

        try {
            const me = await ctx.me();
            if (!me) {
                return await this.sendErrorReply(ctx, "I couldn't find myself in the guild.");
            }

            const state = await member.voice();
            await ctx.deferReply(true);

            const player = client.aqua.createConnection({
                guildId: ctx.guildId,
                voiceChannel: state.channelId,
                textChannel: channelId,
                deaf: true,
                defaultVolume: 65,
            });

            const result = await client.aqua.resolve({
                query: query,
                requester: ctx.interaction.user,
            });

            if (!result) {
                return await this.sendErrorReply(ctx, "No results found.");
            }

            updateRecentSelections(ctx.interaction.user.id, result);

            const embed = this.createPlayEmbed(result, player, query);
            await ctx.editResponse({ embeds: [embed] });

            if (!player.playing && !player.paused && player.queue.size > 0) {
                player.play();
            }
        } catch (error: any) {
            if (error.code === 10065) return;
            console.error("Command execution error:", error);
            await this.sendErrorReply(ctx, ERROR_MESSAGES.GENERIC);
        }
    }
}
