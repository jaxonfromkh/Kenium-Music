import {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';

const MAX_EMBED_LENGTH = 1800;
const EMBED_COLOR = 0x000000;
const COLLECTOR_TIMEOUT = 300_000;

export const Command = {
    name: "lyrics",
    description: "Retrieve lyrics for the current track or search by song/artist",
    options: [{
        name: 'search',
        description: 'Song title or artist to search lyrics for',
        type: 3,
        required: false,
    }],
    run: async (client, interaction) => {
        await interaction.deferReply();

        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.editReply({
                embeds: [createErrorEmbed("No active player found in this guild.")]
            });
        }

        try {
            const searchQuery = interaction.options.getString('search');
            const lyricsResult = await player.getLyrics({
                query: searchQuery,
                useCurrentTrack: !searchQuery,
                skipTrackSource: true
            });

            if (!lyricsResult?.text && !lyricsResult?.lines) {
                return interaction.editReply({
                    embeds: [createErrorEmbed("No lyrics found. Check the title or try another query.")]
                });
            }

            const { text: lyrics, track, source, lines } = lyricsResult;
            const hasSyncedLyrics = Array.isArray(lines) && lines.length > 0;

            return await displayLyricsUI(interaction, {
                lyrics: lyrics || "",
                track,
                lines: hasSyncedLyrics ? lines : null,
                source: source || 'Unknown',
                albumArt: track?.albumArt?.[0]?.url || client.user.displayAvatarURL()
            });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            await interaction.editReply({
                embeds: [createErrorEmbed(errorMessage)]
            });
        }
    },
};

function createErrorEmbed(message) {
    return new EmbedBuilder()
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
        const timestamp = line.range ? `\`[${formatTimestamp(line.range.start)}]\`` : '';
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
                        chunks.push(wordChunk.trim());
                        wordChunk = '';
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
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('lyrics_close')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        );

    if (totalPages > 1) {
        row.components.unshift(
            new ButtonBuilder()
                .setCustomId('lyrics_first')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('lyrics_prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('lyrics_page')
                .setLabel(`${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('lyrics_next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages - 1)
        );
    }
    return row;
}

function createEmbed(page, { chunks, track, source, albumArt, lines, totalPages }) {
    const embed = new EmbedBuilder()
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

async function displayLyricsUI(interaction, { lyrics, track, lines, source, albumArt }) {
    const formattedLyrics = formatLyrics(lines, lyrics);
    const chunks = chunkContent(formattedLyrics);
    const totalPages = chunks.length;
    let currentPage = 0;

    const embedData = { chunks, track, source, albumArt, lines, totalPages };
    const response = await interaction.editReply({
        embeds: [createEmbed(currentPage, embedData)],
        components: [createNavigationRow(currentPage, totalPages)]
    });

    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COLLECTOR_TIMEOUT
    });

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: "❌ These controls are not for you.", ephemeral: true });
        }

        switch (i.customId) {
            case 'lyrics_first': currentPage = 0; break;
            case 'lyrics_prev': currentPage = Math.max(0, currentPage - 1); break;
            case 'lyrics_next': currentPage = Math.min(totalPages - 1, currentPage + 1); break;
            case 'lyrics_close':
                collector.stop();
                return i.update({ components: [] });
        }

        await i.update({
            embeds: [createEmbed(currentPage, embedData)],
            components: [createNavigationRow(currentPage, totalPages)]
        });
    });

    collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });
}

