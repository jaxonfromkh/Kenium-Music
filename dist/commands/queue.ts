import { Command, Declare, type CommandContext, Embed, Middlewares, Container } from "seyfert";
import { CooldownType, Cooldown } from "@slipher/cooldown";

const durationCache = new Map();

function formatDuration(ms: number): string {
    if (ms <= 0) return "0:00";
    
    if (durationCache.has(ms)) {
        return durationCache.get(ms);
    }
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (durationCache.size < 1000) {
        durationCache.set(ms, formatted);
    }
    
    return formatted;
}

const QUEUE_BUTTONS = {
    first: { type: 2, label: "⏮️", style: 2, custom_id: "queue_first" },
    prev: { type: 2, label: "⏪", style: 1, custom_id: "queue_prev" },
    refresh: { type: 2, label: "🔄", style: 3, custom_id: "queue_refresh" },
    next: { type: 2, label: "⏩", style: 1, custom_id: "queue_next" },
    last: { type: 2, label: "⏭️", style: 2, custom_id: "queue_last" }
};

function getCurrentPage(message: any): number {
    try {
        const pageComponent = message.components?.[0]?.components?.[1];
        if (!pageComponent?.content) return 1;
        
        const match = pageComponent.content.match(/Page (\d+)/);
        return match ? parseInt(match[1], 10) : 1;
    } catch {
        return 1;
    }
}

function createQueueEmbed(client: any, ctx: CommandContext, player: any, page: number): Container {
    const tracksPerPage = 10;
    const queueLength = player.queue.length;
    const maxPages = Math.ceil(queueLength / tracksPerPage) || 1;
    
    const validPage = Math.max(1, Math.min(page, maxPages));
    const startIndex = (validPage - 1) * tracksPerPage;
    const endIndex = Math.min(startIndex + tracksPerPage, queueLength);
    
    const currentTrack = player.current;
    const queueSlice = player.queue.slice(startIndex, endIndex);
    
    const totalDuration = player.queue.reduce((total: number, track: any) => total + track.info.length, 0);
    
    const content: string[] = [];
    
    if (currentTrack) {
        const currentTitle = currentTrack.info.title.length > 50 ? currentTrack.info.title.substring(0, 47) + '...' : currentTrack.info.title;
        content.push(`**### ▶️ Now Playing: [${currentTitle}](${currentTrack.info.uri}) \`${formatDuration(currentTrack.info.length)}\`**`);
    }
    
    if (queueLength > 0) {
        content.push("**__Queue:__**\n");
        
        const queueItems = queueSlice.map((track: any, i: number) => {
            const title = track.info.title.length > 50 ? track.info.title.substring(0, 47) + '...' : track.info.title;
            return `**${startIndex + i + 1}.** [**\`${title}\`**](${track.info.uri}) \`${formatDuration(track.info.length)}\``;
        });
        
        content.push(...queueItems);
        content.push(
            `\n**Total:** \`${queueLength}\` track${queueLength > 1 ? "s" : ""} • **Duration:** \`${formatDuration(totalDuration)}\``
        );
    }
    
    content.push(`\n*Last updated: <t:${Math.floor(Date.now() / 1000)}:R>*`);
    
    const isFirstPage = validPage === 1;
    const isLastPage = validPage === maxPages;
    
    const buttons = [
        { ...QUEUE_BUTTONS.first, disabled: isFirstPage },
        { ...QUEUE_BUTTONS.prev, disabled: isFirstPage },
        QUEUE_BUTTONS.refresh,
        { ...QUEUE_BUTTONS.next, disabled: isLastPage },
        { ...QUEUE_BUTTONS.last, disabled: isLastPage }
    ];
    
    return new Container({
        components: [
            {
                type: 9,
                components: [
                    { type: 10, content: content.join('\n') },
                    { type: 10, content: `Page ${validPage} of ${maxPages}` }
                ],
                accessory: {
                    type: 11,
                    media: {
                        url: currentTrack?.thumbnail || currentTrack?.info?.artworkUrl || client.user.displayAvatarURL({ size: 256 })
                    }
                }
            },
            { type: 14, divider: true, spacing: 2 },
            { type: 1, components: buttons }
        ],
        accent_color: 0
    });
}

async function handleQueueNavigation(interaction: any, client: any, ctx: CommandContext, player: any, newPage: number): Promise<void> {
    try {
        await interaction.deferUpdate();
        const newEmbed = createQueueEmbed(client, ctx, player, newPage);
        await interaction.editOrReply({ components: [newEmbed], flags: 32768 });
    } catch (error) {
        console.error("Navigation error:", error);
        if (error.message?.includes("already been acknowledged")) {
            try {
                await interaction.editOrReply({
                    components: [createQueueEmbed(client, ctx, player, newPage)],
                    flags: 32768
                });
            } catch (editError) {
                console.error("Failed to edit after defer error:", editError);
            }
        }
    }
}

async function handleShowQueue(client: any, ctx: CommandContext, player: any): Promise<void> {
    const queueLength = player.queue.length;
    
    if (queueLength === 0) {
        const emptyEmbed = new Embed()
            .setTitle('🎵 Queue')
            .setDescription("📭 Queue is empty. Add some tracks!")
            .setColor(0x000000)
            .setTimestamp();
        await ctx.write({ embeds: [emptyEmbed] });
        return void 0;
    }
    
    const embed = createQueueEmbed(client, ctx, player, 1);
    const message = await ctx.write({ components: [embed], flags: 32768 }, true);
    
    const collector = message.createComponentCollector({
        idle: 300000,
        filter: (i: any) => i.user.id === ctx.interaction.user.id && i.customId.startsWith('queue_')
    });
    
    const navigationHandler = async (i: any) => {
        if (!i.isButton()) return;
        
        const currentPage = getCurrentPage(i.message);
        const maxPages = Math.ceil(player.queue.length / 10);
        
        let newPage: number;
        switch (i.customId) {
            case 'queue_first':
                newPage = 1;
                break;
            case 'queue_prev':
                newPage = Math.max(1, currentPage - 1);
                break;
            case 'queue_next':
                newPage = Math.min(maxPages, currentPage + 1);
                break;
            case 'queue_last':
                newPage = maxPages;
                break;
            case 'queue_refresh':
                newPage = currentPage;
                break;
            default:
                return;
        }
        
        await handleQueueNavigation(i, client, ctx, player, newPage);
    };
    
    ['queue_first', 'queue_prev', 'queue_next', 'queue_last', 'queue_refresh'].forEach(id => {
        collector.run(id, navigationHandler);
    });
    
    const messageRef = new globalThis.WeakRef(message);
    setTimeout(async () => {
        const msg = messageRef.deref();
        if (msg) {
            try {
                await msg.delete();
            } catch (error) {
                console.error("Failed to delete message:", error);
            }
        }
    }, 300000);
}

@Cooldown({
    type: CooldownType.User,
    interval: 60000,
    uses: { default: 2 }
})
@Declare({
    name: "queue",
    description: "Show the music queue"
})
@Middlewares(["cooldown", "checkPlayer", "checkVoice"])
export default class queuecmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const player = ctx.client.aqua.players.get(ctx.interaction.guildId);
            if (!player) {
                return;
            }
            await handleShowQueue(ctx.client, ctx, player);
        } catch (error) {
            if(error.code === 10065) return;
            console.error("Queue command error:", error);
        }
    }
}