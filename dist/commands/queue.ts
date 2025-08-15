import { Command, Declare, type CommandContext, Embed, Middlewares, Container } from "seyfert";
import { CooldownType, Cooldown } from "@slipher/cooldown";


const TRACKS_PER_PAGE = 5;
const MAX_DURATION_CACHE = 1000;
const EPHEMERAL_FLAG = 64 as const;


const durationCache: Map<number, string> = new Map();
const queueViewState = new Map<string, { page: number; maxPages: number; totalMs: number }>();


function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "0:00";

    const cached = durationCache.get(ms);
    if (cached) return cached;

    const totalSeconds = (ms / 1000) | 0;
    const hours = (totalSeconds / 3600) | 0;
    const minutes = ((totalSeconds % 3600) / 60) | 0;
    const seconds = totalSeconds % 60;

    const formatted = hours > 0
        ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        : `${minutes}:${seconds.toString().padStart(2, "0")}`;

    if (durationCache.size < MAX_DURATION_CACHE) {
        durationCache.set(ms, formatted);
    }
    return formatted;
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 3)) + "...";
}

function calcPagination(queueLength: number, page: number) {
    const maxPages = Math.max(1, Math.ceil(queueLength / TRACKS_PER_PAGE));
    const validPage = Math.min(Math.max(1, page), maxPages);
    const startIndex = (validPage - 1) * TRACKS_PER_PAGE;
    const endIndex = Math.min(startIndex + TRACKS_PER_PAGE, queueLength);
    return { validPage, maxPages, startIndex, endIndex };
}


function createProgressBar(current: number, total: number, length: number = 12): string {
    const percentage = total > 0 ? current / total : 0;
    const progress = Math.round(percentage * length);
    const emptyProgress = length - progress;

    const progressText = '▰'.repeat(progress);
    const emptyProgressText = '▱'.repeat(emptyProgress);

    return `${progressText}${emptyProgressText}`;
}


const createButtons = (page: number, maxPages: number, isPaused: boolean = false) => {
    const isFirstPage = page === 1;
    const isLastPage = page === maxPages;

    return [
        {
            type: 1,
            components: [
                {
                    type: 2,
                    style: 2,
                    emoji: { name: "⏮️" },
                    custom_id: "queue_first",
                    disabled: isFirstPage
                },
                {
                    type: 2,
                    style: 2,
                    emoji: { name: "◀️" },
                    custom_id: "queue_prev",
                    disabled: isFirstPage
                },
                {
                    type: 2,
                    style: isPaused ? 3 : 4,
                    emoji: { name: isPaused ? "▶️" : "⏸️" },
                    custom_id: "queue_playpause"
                },
                {
                    type: 2,
                    style: 2,
                    emoji: { name: "▶️" },
                    custom_id: "queue_next",
                    disabled: isLastPage
                },
                {
                    type: 2,
                    style: 2,
                    emoji: { name: "⏭️" },
                    custom_id: "queue_last",
                    disabled: isLastPage
                }
            ]
        },
        {
            type: 1,
            components: [
                {
                    type: 2,
                    style: 2,
                    emoji: { name: "🔀" },
                    custom_id: "queue_shuffle",
                    label: "Shuffle"
                },
                {
                    type: 2,
                    style: 2,
                    emoji: { name: "🔁" },
                    custom_id: "queue_loop",
                    label: "Loop"
                },
                {
                    type: 2,
                    style: 1,
                    emoji: { name: "🔄" },
                    custom_id: "queue_refresh",
                    label: "Refresh"
                },
                {
                    type: 2,
                    style: 4,
                    emoji: { name: "🗑️" },
                    custom_id: "queue_clear",
                    label: "Clear"
                }
            ]
        }
    ];
};

function createQueueEmbed(
    player: any,
    page: number,
    precomputedTotalMs?: number
): Embed {
    const queueLength = player.queue.length;
    const { validPage, maxPages, startIndex, endIndex } = calcPagination(queueLength, page);

    const currentTrack = player.current;
    const queueSlice = player.queue.slice(startIndex, endIndex);

    const totalMs = precomputedTotalMs ??
        player.queue.reduce((total: number, track: any) => total + (track?.info?.length ?? 0), 0);

    const embed = new Embed()
        .setColor(0x000000)
        .setAuthor({
            name: `Queue • Page ${validPage}/${maxPages}`,
        });

    // Now Playing Section
    if (currentTrack) {
        const title = truncate(currentTrack.info?.title ?? "Unknown", 45);
        const artist = currentTrack.info?.author ?? "Unknown Artist";
        const lengthMs = currentTrack.info?.length ?? 0;
        const posMs = player.position ?? 0;

        const progressBar = createProgressBar(posMs, lengthMs);
        const percentComplete = lengthMs > 0 ? Math.round((posMs / lengthMs) * 100) : 0;

        embed.addFields({
            name: "🎵 Now Playing",
            value: [
                `**[${title}](${currentTrack.info?.uri ?? "#"})**`,
                `*by ${truncate(artist, 30)}*`,
                "",
                `${progressBar} **${percentComplete}%**`,
                `\`${formatDuration(posMs)}\` / \`${formatDuration(lengthMs)}\``
            ].join("\n"),
            inline: false
        });
    }

    // Queue Section - More compact display
    if (queueLength > 0) {
        const queueLines: string[] = [];

        for (let i = 0; i < queueSlice.length; i++) {
            const track = queueSlice[i];
            const num = startIndex + i + 1;
            const title = truncate(track?.info?.title ?? "Unknown", 35)
            const duration = formatDuration(track?.info?.length ?? 0);

            // Use different indicators for position
            const indicator = num === 1 ? "🎯" : num === 2 ? "⏭️" : `${num}.`;
            queueLines.push(`${indicator} **\`${title}\`** \`${duration}\``);
        }

        embed.addFields({
            name: `📋 Coming Up${queueLength > TRACKS_PER_PAGE ? ` (${startIndex + 1}-${endIndex} of ${queueLength})` : ""}`,
            value: queueLines.join("\n") || "*No tracks in queue*",
            inline: false
        });
    }

    // Stats Footer - Compact info bar
    const stats = [
        `🎵 ${queueLength} track${queueLength !== 1 ? "s" : ""}`,
        `⏱️ ${formatDuration(totalMs)}`,
        `🔊 ${player.volume ?? 100}%`
    ];

    // Add loop/shuffle indicators if active
    if (player.loop) stats.push("🔁 Loop");
    if (player.shuffle) stats.push("🔀 Shuffle");

    embed.setFooter({
        text: stats.join(" • "),
        iconUrl: "https://cdn.discordapp.com/emojis/987643956609781781.gif"
    });

    // Add thumbnail if available
    if (currentTrack?.info?.artworkUrl || currentTrack?.thumbnail) {
        embed.setThumbnail(currentTrack.info?.artworkUrl ?? currentTrack.thumbnail);
    }

    return embed;
}

/**
 * Navigation Handler
 */
async function handleQueueNavigation(
    interaction: any,
    player: any,
    action: string
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const messageId = interaction?.message?.id;
        const state = messageId ? queueViewState.get(messageId) : undefined;

        if (!state) return;

        let newPage = state.page;
        const { maxPages } = calcPagination(player.queue.length, state.page);

        switch (action) {
            case "queue_first":
                newPage = 1;
                break;
            case "queue_prev":
                newPage = Math.max(1, state.page - 1);
                break;
            case "queue_next":
                newPage = Math.min(maxPages, state.page + 1);
                break;
            case "queue_last":
                newPage = maxPages;
                break;
            case "queue_refresh":
                // Refresh stays on same page
                break;
            case "queue_playpause":
                // Toggle play/pause
                if (player.paused) {
                    await player.resume();
                } else {
                    await player.pause();
                }
                break;
            case "queue_shuffle":
                // Shuffle queue
                if (player.queue.length > 1) {
                    for (let i = player.queue.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [player.queue[i], player.queue[j]] = [player.queue[j], player.queue[i]];
                    }
                }
                break;
            case "queue_loop":
                // Toggle loop
                player.loop = !player.loop;
                break;
            case "queue_clear":
                // Clear queue
                player.queue = [];
                break;
            default:
                return;
        }

        // Update state
        const totalMs = player.queue.reduce((total: number, track: any) =>
            total + (track?.info?.length ?? 0), 0);

        queueViewState.set(messageId, {
            page: newPage,
            maxPages: Math.ceil(player.queue.length / TRACKS_PER_PAGE),
            totalMs
        });

        // Create updated embed
        const embed = createQueueEmbed(player, newPage, totalMs);
        const components = createButtons(newPage, maxPages, player.paused);

        await interaction.editOrReply({
            embeds: [embed],
            components,
            flags: EPHEMERAL_FLAG
        });
    } catch (err) {
        console.error("Navigation error:", err);
    }
}

/**
 * Main Queue Display
 */
async function handleShowQueue(ctx: CommandContext, player: any): Promise<void> {
    const queueLength = player.queue.length;

    if (queueLength === 0 && !player.current) {
        const emptyEmbed = new Embed()
            .setColor(0x000000)
            .setAuthor({
                name: "Queue Empty",
                iconUrl: (await ctx.me()).avatarURL()
            })
            .setDescription("📭 **No tracks in queue**\n\nUse `/play` to add some music!")
            .setFooter({ text: "Tip: You can search or use URLs" });

        await ctx.write({ embeds: [emptyEmbed], flags: EPHEMERAL_FLAG });
        return;
    }

    const totalMs = player.queue.reduce((total: number, track: any) =>
        total + (track?.info?.length ?? 0), 0);

    const embed = createQueueEmbed(player, 1, totalMs);
    const { maxPages } = calcPagination(queueLength, 1);
    const components = createButtons(1, maxPages, player.paused);

    const message = await ctx.write({
        embeds: [embed],
        components,
        flags: EPHEMERAL_FLAG
    }, true);

    if (!message?.id) return;

    queueViewState.set(message.id, { page: 1, maxPages, totalMs });

    // Create collector
    const collector = message.createComponentCollector?.({
        idle: 180000, // 3 minutes
        filter: (i: any) => i.user.id === ctx.interaction.user.id
    });

    if (collector) {
        collector.run("queue_first", (i: any) => handleQueueNavigation(i, player, "queue_first"));
        collector.run("queue_prev", (i: any) => handleQueueNavigation(i, player, "queue_prev"));
        collector.run("queue_next", (i: any) => handleQueueNavigation(i, player, "queue_next"));
        collector.run("queue_last", (i: any) => handleQueueNavigation(i, player, "queue_last"));
        collector.run("queue_refresh", (i: any) => handleQueueNavigation(i, player, "queue_refresh"));
        collector.run("queue_playpause", (i: any) => handleQueueNavigation(i, player, "queue_playpause"));
        collector.run("queue_shuffle", (i: any) => handleQueueNavigation(i, player, "queue_shuffle"));
        collector.run("queue_loop", (i: any) => handleQueueNavigation(i, player, "queue_loop"));
        collector.run("queue_clear", (i: any) => handleQueueNavigation(i, player, "queue_clear"));
    }

    // Cleanup
    setTimeout(() => queueViewState.delete(message.id), 180000);
}

/**
 * Command
 */
@Cooldown({
    type: CooldownType.User,
    interval: 60000,
    uses: { default: 2 }
})
@Declare({
    name: "queue",
    description: "Show the music queue with controls"
})
@Middlewares(["cooldown", "checkPlayer", "checkVoice"])
export default class QueueCommand extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const player = ctx.client?.aqua?.players?.get(ctx.interaction.guildId);
            if (!player) {
                await ctx.write({
                    content: "❌ No active player found",
                    flags: EPHEMERAL_FLAG
                });
                return;
            }
            await handleShowQueue(ctx, player);
        } catch (error: any) {
            if (error?.code === 10065) return;
            console.error("Queue command error:", error);
            await ctx.write({
                content: "❌ An error occurred while displaying the queue",
                flags: EPHEMERAL_FLAG
            });
        }
    }
}