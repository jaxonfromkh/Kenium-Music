import { Declare, Command, type CommandContext, Embed, ActionRow, Button, Middlewares, Options, createStringOption } from 'seyfert';
import { ButtonStyle, ComponentType } from 'seyfert/lib/types';
import { CooldownType, Cooldown } from '@slipher/cooldown';

const MAX_EMBED_LENGTH = 1800;
const EMBED_COLOR = 0x000000;
const COLLECTOR_TIMEOUT = 300_000;

function createErrorEmbed(message) {
    return new Embed()
        .setColor(0xE74C3C)
        .setTitle('❌ Lyrics Error')
        .setDescription(message);
}

function getErrorMessage(error) {
    if (error.message.includes('missing plugins')) {
        return "Lyrics plugin missing. Install the required plugins and retry.";
    } else if (error.message.includes('rate limit')) {
        return "Rate limit reached. Please wait and try again.";
    }
    return "Unable to fetch lyrics. Try again later.";
}

function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatLyrics(lines, plainText) {
    if (!lines || !Array.isArray(lines)) return plainText || '';
    const formatted = [];
    for (const line of lines) {
        const timestamp = line.range?.start ? `\`[${formatTimestamp(line.range.start)}]\`` : '';
        const content = `**${line.line.trim()}**`;
        formatted.push(`${timestamp} ${content}`.trim());
    }
    return formatted.join('\n');
}

function chunkContent(content, maxLength = MAX_EMBED_LENGTH) {
    const lines = content.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentLength = 0;

    for (const line of lines) {
        const lineLength = line.length + 1;
        if (currentLength + lineLength > maxLength) {
            if (currentChunk.length) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentLength = 0;
            }
            if (lineLength > maxLength) {
                const words = line.split(' ');
                let wordChunk = '';
                for (const word of words) {
                    if (wordChunk.length + word.length + 1 > maxLength) {
                        if (wordChunk) {
                            chunks.push(wordChunk.trim());
                            wordChunk = '';
                        }
                    }
                    wordChunk += (wordChunk ? ' ' : '') + word;
                }
                if (wordChunk) chunks.push(wordChunk.trim());
                continue;
            }
        }
        currentChunk.push(line);
        currentLength += lineLength;
    }
    if (currentChunk.length) chunks.push(currentChunk.join('\n'));
    return chunks;
}

function createNavigationRow(currentPage, totalPages) {
    const row = new ActionRow()
        .addComponents(
            new Button()
                .setCustomId('lyrics_close')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        );

    if (totalPages > 1) {
        row.components.unshift(
            new Button()
                .setCustomId('lyrics_first')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new Button()
                .setCustomId('lyrics_prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0),
            new Button()
                .setCustomId('lyrics_page')
                .setLabel(`${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new Button()
                .setCustomId('lyrics_next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages - 1)
        );
    }
    return row;
}

function createEmbed(page, { chunks, track, source, albumArt, lines, totalPages }) {
    const embed = new Embed()
        .setColor(EMBED_COLOR)
        .setTitle(track ? `🎵 ${track.title}` : '🎶 Current Track Lyrics')
        .setDescription(chunks[page] || 'No lyrics available')
        .setThumbnail(albumArt)
        .setFooter({
            text: [
                source,
                track?.author ? `Artist: ${track.author}` : '',
                lines ? 'Synced Lyrics' : 'Text Lyrics',
                `Page ${page + 1}/${totalPages}`
            ].filter(Boolean).join(' • ')
        });

    if (track?.album) {
        embed.addFields({ name: 'Album', value: track.album, inline: true });
    }
    return embed;
}

async function displayLyricsUI(ctx, { lyrics, track, lines, source, albumArt }) {    
    const formattedLyrics = formatLyrics(lines, lyrics);
    const chunks = chunkContent(formattedLyrics);
    const totalPages = chunks.length;
    let currentPage = 0;

    const embedData = { chunks, track, source, albumArt, lines, totalPages };
    const response = await ctx.editOrReply({
        embeds: [createEmbed(currentPage, embedData)],
        components: [createNavigationRow(currentPage, totalPages)]
    });

    const collector = response.createComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === ctx.interaction.user.id,
        idle: COLLECTOR_TIMEOUT
    });

    const activeCollectors = new Set();
    activeCollectors.add(collector);

    const handleInteraction = async (i) => {
        try {
            await i.deferUpdate();

            if (i.customId === 'lyrics_first' && currentPage > 0) {
                currentPage = 0;
            } else if (i.customId === 'lyrics_prev' && currentPage > 0) {
                currentPage--;
            } else if (i.customId === 'lyrics_next' && currentPage < totalPages - 1) {
                currentPage++;
            } else if (i.customId === 'lyrics_close') {
                await response.delete().catch(() => {});
                return;
            } else {
                return;
            }

            await response.edit({
                embeds: [createEmbed(currentPage, embedData)],
                components: [createNavigationRow(currentPage, totalPages)]
            });
        } catch (error) {
            console.error('Lyrics interaction handler error:', error);
        }
    };

    ['lyrics_first', 'lyrics_prev', 'lyrics_next', 'lyrics_close'].forEach(id => {
        collector.run(id, handleInteraction);
    });

    const cleanup = () => {
        activeCollectors.delete(collector);
        response.edit({ components: [] }).catch(() => {});
    };

    setTimeout(cleanup, COLLECTOR_TIMEOUT);
}

@Cooldown({
    type: CooldownType.User,
    interval: 1000 * 60,
    uses: { default: 2 },
})
@Options({
    search: createStringOption({
        description: 'If you want to try searching.',
        required: false
    })
})
@Declare({
    name: 'lyrics',
    description: 'Get the lyrics of a song',
})
@Middlewares(['cooldown', 'checkPlayer', 'checkVoice'])
export default class lyricsCmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        await ctx.deferReply();

        const client = ctx.client;
        const player = client.aqua.players.get(ctx.guildId);

        if (!player) {
            await ctx.editOrReply({
                embeds: [createErrorEmbed("No active player found in this guild.")]
            });
            return;
        }

        try {
            const { searchQuery } = ctx.options as { searchQuery: string };
            const lyricsResult = await player.getLyrics({
                query: searchQuery,
                useCurrentTrack: !searchQuery,
                skipTrackSource: true
            });

            if (!lyricsResult?.text && !lyricsResult?.lines) {
                await ctx.editOrReply({
                    embeds: [createErrorEmbed("No lyrics found. Check the title or try another query.")]
                });
                return;
            }

            const { text: lyrics, track, source, lines } = lyricsResult;
            const hasSyncedLyrics = Array.isArray(lines) && lines.length > 0;

            return await displayLyricsUI(ctx, {
                lyrics: lyrics || "",
                track,
                lines: hasSyncedLyrics ? lines : null,
                source: source || 'Unknown',
                albumArt: track?.albumArt?.[0]?.url || client.me.avatarURL()
            });
        } catch (error) {
            console.error('Error fetching lyrics:', error);
            const errorMessage = getErrorMessage(error);
            await ctx.editOrReply({
                embeds: [createErrorEmbed(errorMessage)]
            });
        }
    }
}