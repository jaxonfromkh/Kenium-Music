import { Command, Declare, type CommandContext, Container, Middlewares, createStringOption, Options } from 'seyfert';

// Frozen objects for better performance and memory usage
const MUSIC_PLATFORMS = Object.freeze({
    YOUTUBE: Object.freeze({ name: 'YouTube', source: 'ytsearch', color: 0x18191c, emoji: '<:youtube:1326295615017058304>', icon: '📺', style: 4 }),
    SOUNDCLOUD: Object.freeze({ name: 'SoundCloud', source: 'scsearch', color: 0x18191c, emoji: '<:soundcloud:1326295646818406486>', icon: '🎵', style: 1 }),
    SPOTIFY: Object.freeze({ name: 'Spotify', source: 'spsearch', color: 0x18191c, emoji: '<:spotify:1326702792269893752>', icon: '🎧', style: 3 })
});

// Constants
const INTERACTION_TIMEOUT = 30000;
const MAX_RESULTS = 5;
const DEFAULT_PLATFORM = 'YOUTUBE';
const BUTTON_STYLE_SELECTION = 2;

// Pre-built messages for better performance
const MESSAGES = Object.freeze({
    NO_VOICE_CHANNEL: '🎵 Join a voice channel first!',
    ALREADY_CONNECTED: (channel: string) => `🎵 I'm already playing music in ${channel}`,
    NO_RESULTS: (platform: string) => `🔍 No results found on ${platform}. Try another platform!`,
    TRACK_ADDED: (title: string) => `✅ Added **${title}** to the queue`,
    SEARCH_ERROR: '❌ Search failed. Please try again.',
    GENERIC_ERROR: '❌ An error occurred. Please try again.'
});

// Optimized duration formatter with caching
const durationCache = new Map<number, string>();
function formatDuration(ms: number): string {
    if (ms <= 0) return "0:00";

    // Check cache first
    if (durationCache.has(ms)) {
        return durationCache.get(ms)!;
    }

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Cache with size limit
    if (durationCache.size < 1000) {
        durationCache.set(ms, formatted);
    }

    return formatted;
}

// Optimized emoji parsing
function parseEmoji(emoji: string): { name: string; id?: string } | undefined {
    if (emoji.startsWith('<:')) {
        const match = emoji.match(/^<:([a-zA-Z0-9_]+):(\d+)>$/);
        return match ? { name: match[1], id: match[2] } : undefined;
    }
    return { name: emoji };
}

@Options({
    query: createStringOption({
        description: 'The song you want to search for',
        required: true,
    })
})
@Middlewares(["checkVoice"])
@Declare({
    name: 'search',
    description: 'Search for a song',
})
export default class SearchCommand extends Command {
    private activeCollectors = new Set<any>();

    public override async run(ctx: CommandContext): Promise<void> {
        const { query } = ctx.options as { query: string };

        try {
            const player = await this.getOrCreatePlayer(ctx);
            if (!player) return;

            const defaultPlatform = MUSIC_PLATFORMS.YOUTUBE;
            const tracks = await this.searchTracks(ctx, query, defaultPlatform.source);

            if (!tracks.length) {
                await ctx.write({ content: MESSAGES.NO_RESULTS(defaultPlatform.name), flags: 64 });
                return;
            }

            const searchContainer = this.createSearchContainer(query, tracks, defaultPlatform);
            const message = await ctx.write({ components: [searchContainer], flags: 32768 | 64 }, true);

            this.setupInteractionHandler(message, ctx, player, query, tracks, defaultPlatform);

        } catch (error) {
            console.error('Search command error:', error);
            await ctx.write({ content: MESSAGES.GENERIC_ERROR, flags: 64 });
        }
    }

    private async getOrCreatePlayer(ctx: CommandContext): Promise<any> {
        let player = ctx.client.aqua.players.get(ctx.interaction.guildId);

        if (!player) {
            const voiceChannel = (await ctx.interaction.member?.voice()).channelId;
            if (!voiceChannel) {
                await ctx.write({ content: MESSAGES.NO_VOICE_CHANNEL, flags: 64 });
                return null;
            }

            try {
                player = await ctx.client.aqua.createConnection({
                    guildId: ctx.guildId,
                    voiceChannel,
                    textChannel: ctx.channelId,
                    deaf: true,
                    defaultVolume: 65,
                });
            } catch (error) {
                console.error('Failed to create player:', error);
                await ctx.write({ content: '❌ Failed to join voice channel.', flags: 64 });
                return null;
            }
        }

        return player;
    }

    private async searchTracks(ctx: CommandContext, query: string, source: string): Promise<any[]> {
        try {
            const result = await ctx.client.aqua.resolve({
                query,
                source,
                requester: ctx.interaction.user
            });
            return result.tracks?.slice(0, MAX_RESULTS) || [];
        } catch (error) {
            console.error('Search tracks error:', error);
            return [];
        }
    }

    private createTrackList(tracks: any[], platform: any): string {
        return tracks.map((track, i) =>
            `**${i + 1}.** ${platform.emoji} [\`${track.info.title}\`](${track.info.uri}) \`[${formatDuration(track.info.length)}]\``
        ).join('\n');
    }

    private createSearchContainer(query: string, tracks: any[], platform: any): Container {
        return new Container({
            components: [
                { type: 10, content: `### ${platform.emoji} **${platform.name} Search**\n> \`${query}\`` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: this.createTrackList(tracks, platform) },
                { type: 14, divider: true, spacing: 2 },
                { type: 1, components: this.createSelectionButtons(tracks.length) },
                { type: 14, divider: true, spacing: 2 },
                { type: 1, components: this.createPlatformButtons(platform) }
            ],
            accent_color: platform.color,
        });
    }

    private createPlatformButtons(currentPlatform: any): any[] {
        return Object.entries(MUSIC_PLATFORMS).map(([key, platform]) => {
            const emoji = parseEmoji(platform.emoji) || parseEmoji(platform.icon);
            const isActive = key === currentPlatform.name.toUpperCase();

            return {
                type: 2,
                custom_id: `platform_${key.toLowerCase()}`,
                label: platform.name,
                ...(emoji && { emoji }),
                style: isActive ? 4 : platform.style,
                disabled: isActive
            };
        });
    }

    private createSelectionButtons(count: number): any[] {
        return Array.from({ length: count }, (_, i) => ({
            type: 2,
            custom_id: `select_${i}`,
            label: `${i + 1}`,
            emoji: { name: "▶️" },
            style: BUTTON_STYLE_SELECTION,
        }));
    }

    private setupInteractionHandler(message: any, ctx: CommandContext, player: any, query: string, tracks: any[], currentPlatform: any): void {
        const collector = message.createComponentCollector({
            filter: (i: any) => i.user.id === ctx.interaction.user.id,
            idle: INTERACTION_TIMEOUT + 1000,
            onStop: () => this.cleanup()
        });

        this.activeCollectors.add(collector);
        const handleInteraction = async (i: any) => {
            try {
                await i.deferUpdate();

                if (i.customId.startsWith('select_')) {
                    await this.handleTrackSelection(i, player, tracks);
                } else if (i.customId.startsWith('platform_')) {
                    await this.handlePlatformSwitch(i, ctx, query, tracks, currentPlatform);
                }
            } catch (error) {
                console.error('Interaction handler error:', error);
            }
        };

        for (let i = 0; i < MAX_RESULTS; i++) {
            collector.run(`select_${i}`, handleInteraction);
        }

        Object.keys(MUSIC_PLATFORMS).forEach(key => {
            collector.run(`platform_${key.toLowerCase()}`, handleInteraction);
        });

        const cleanup = () => {
            this.activeCollectors.delete(collector);
            message.delete?.().catch(() => message.edit?.({ components: [] }).catch(() => { }));
        };

        setTimeout(cleanup, INTERACTION_TIMEOUT + 1000);
    }

    private async handleTrackSelection(i: any, player: any, tracks: any[]): Promise<void> {
        const trackIndex = parseInt(i.customId.split('_')[1]);
        const track = tracks[trackIndex];

        if (track) {
            player.queue.add(track);
            await i.followup({ content: MESSAGES.TRACK_ADDED(track.info.title), flags: 64 }, true);

            if (!player.playing && !player.paused && player.queue.size > 0) {
                player.play();
            }
        }
    }

    private async handlePlatformSwitch(i: any, ctx: CommandContext, query: string, tracks: any[], currentPlatformKey: string): Promise<string> {
        const platformKey = i.customId.split('_')[1].toUpperCase() as keyof typeof MUSIC_PLATFORMS;
        const newPlatform = MUSIC_PLATFORMS[platformKey];

        if (!newPlatform || platformKey === currentPlatformKey) {
            return currentPlatformKey;
        }

        try {
            const newTracks = await this.searchTracks(ctx, query, newPlatform.source);

            if (newTracks.length) {
                tracks.length = 0;
                tracks.push(...newTracks);

                const searchContainer = this.createSearchContainer(query, tracks, newPlatform);
                await i.editOrReply({ components: [searchContainer], flags: 32768 });

                return platformKey;
            } else {
                await i.followup({ content: MESSAGES.NO_RESULTS(newPlatform.name), flags: 64 });
                return currentPlatformKey;
            }
        } catch (error) {
            console.error(`${newPlatform.name} search error:`, error);
            await i.followup({ content: MESSAGES.SEARCH_ERROR, flags: 64 });
            return currentPlatformKey;
        }
    }
    public cleanup(): void {
        this.activeCollectors.forEach(collector => {
            try {
                collector.stop();
            } catch (error) {
                console.error('Error stopping collector:', error);
            }
        });
        this.activeCollectors.clear();
        durationCache.clear();
    }
}