import {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';

export const Command = {
    name: "lyrics",
    description: "Get lyrics for the current track or search for specific lyrics",
    options: [{
        name: 'search',
        description: 'Search for lyrics by song title or artist',
        type: 3,
        required: false,
    }],
    run: async (client, interaction) => {
        await interaction.deferReply({ });

        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.editReply({
                embeds: [createErrorEmbed("No player found for this guild")]
            });
        }

        try {
            const searchQuery = interaction.options.getString('search');
            const lyricsResult = await (searchQuery ? 
                player.searchLyrics(searchQuery) : 
                player.lyrics()
            );

            if (!lyricsResult?.text && !lyricsResult?.lines) {
                return interaction.editReply({
                    embeds: [createErrorEmbed("No lyrics found for this track")]
                });
            }

            const { text: lyrics, track, source, lines } = lyricsResult;
            const hasSyncedLyrics = Array.isArray(lines) && lines.length > 0;

            return displayLyricsUI(interaction, {
                lyrics: lyrics || "",
                track,
                lines: hasSyncedLyrics ? lines : null,
                source: source || 'Unknown',
                albumArt: track?.albumArt?.[0]?.url || client.user.displayAvatarURL()
            });
        } catch (error) {
            console.error('Lyrics error:', error);
            const errorMessage = error.message.includes('missing plugins') ? 
                "Lyrics plugin not installed" : 
                "Failed to fetch lyrics";
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

function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatLyrics(lines, plainText) {
    if (!lines) return plainText;
    return lines.map(line => {
        const timestamp = line.range ? `\`[${formatTimestamp(line.range.start)}]\`` : '';
        const content = `**${line.line.trim()}**`;  // bold the synced line
        return `${timestamp} ${content}`.trim();
    }).join('\n');
}

function chunkContent(content, maxLength = 1800) {
    const lineSeparator = '\n';
    const lines = content.split(lineSeparator);
    const chunks = [];
    let currentChunk = [];

    for (const line of lines) {
        if ((currentChunk.join(lineSeparator).length + line.length) >= maxLength) {
            chunks.push(currentChunk.join(lineSeparator));
            currentChunk = [];
        }
        currentChunk.push(line);
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join(lineSeparator));
    return chunks;
}

function createNavigationRow(currentPage, totalPages) {
    return new ActionRowBuilder().addComponents(
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
            .setDisabled(currentPage === totalPages - 1),
        new ButtonBuilder()
            .setCustomId('lyrics_close')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger)
    );
}

async function displayLyricsUI(interaction, { lyrics, track, lines, source, albumArt }) {
    const formattedLyrics = formatLyrics(lines, lyrics);
    const chunks = chunkContent(formattedLyrics);
    const totalPages = chunks.length;
    let currentPage = 0;

    const createEmbed = (page) => {
        const embed = new EmbedBuilder()
            .setColor(0)
            .setTitle(track ? `🎵 ${track.title}` : '🎶 Current Track Lyrics')
            .setDescription(chunks[page])
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
            embed.addFields({ 
                name: 'Album', 
                value: track.album, 
                inline: true 
            });
        }

        return embed;
    };

    const response = await interaction.editReply({
        embeds: [createEmbed(0)],
        components: totalPages > 1 ? [createNavigationRow(0, totalPages)] : []
    });

    if (totalPages <= 1) return;

    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000
    });

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: "❌ These controls aren't for you", flags: 64 });
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
            embeds: [createEmbed(currentPage)],
            components: [createNavigationRow(currentPage, totalPages)]
        });
    });

    collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });
}