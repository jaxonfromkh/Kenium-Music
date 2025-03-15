import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } from 'discord.js';

export const Command = {
    name: "lyrics",
    description: "Get the lyrics of the current playing song or search for lyrics.",
    options: [{
        name: 'search',
        description: 'Search for lyrics by song title or artist',
        type: 3,
        required: false,
    }],
    run: async (client, interaction) => {
        await interaction.deferReply();
        
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) return await interaction.editReply({ 
            embeds: [createEmbed('❌ Error', "No player found for this guild.", 0x992D22)] 
        });
        
        try {
            const searchQuery = interaction.options.getString('search');
            const lyricsResult = await (searchQuery ? player.searchLyrics(searchQuery) : player.lyrics());
            
            if (!lyricsResult?.text) {
                return await interaction.editReply({ 
                    embeds: [createEmbed('❌ Error', "No lyrics found.", 0x992D22)] 
                });
            }
            
            const { text: lyrics, track, provider, source, lines } = lyricsResult;
            const title = track ? `${track.title} - ${track.author}` : "Current Track";
            const image = track?.albumArt?.url || client.user.avatarURL();
            const author = provider || source || 'Unknown';
            
            const hasSyncedLyrics = lines && Array.isArray(lines) && lines.length > 0;
            
            return await displayLyrics(interaction, lyrics, title, image, author, hasSyncedLyrics ? lines : null, player);
        } catch (error) {
            console.error('Lyrics fetch error:', error);
            
            const errorMessage = error.message?.includes('missing plugins')
                ? "This server doesn't have the required lyrics plugins installed."
                : "An error occurred while fetching the lyrics.";
            
            await interaction.editReply({
                embeds: [createEmbed('❌ Error', errorMessage, 0x992D22)]
            }).catch(() => {});
        }
    },
};

function createEmbed(title, description, color, footer = null, thumbnail = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
        
    if (footer) embed.setFooter({ text: footer });
    if (thumbnail) embed.setThumbnail(thumbnail);
    
    return embed;
}

function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
}

function formatLyricsWithTimestamps(lines, rawLyrics) {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return rawLyrics;
    }
    
    return lines.map(line => {
        const timestamp = line.range ? formatTimestamp(line.range.start) : '';
        return timestamp ? `[${timestamp}] ${line.line}` : line.line;
    }).join('\n');
}

async function displayLyrics(interaction, lyrics, title, image, author, lines, player) {
    const formattedLyrics = lines ? formatLyricsWithTimestamps(lines, lyrics) : lyrics;
    const chunks = splitText(formattedLyrics, 1024);
    const pages = chunks.map((chunk, i) => 
        createEmbed(
            `🎵 ${title}`, 
            chunk, 
            0x0a1929, 
            `${interaction.user.tag} • ${author} • ${i+1}/${chunks.length}`,
            image
        )
    );
    
    let currentPage = 0;
    const hasSyncedLyrics = lines && Array.isArray(lines) && lines.length > 0;
    
    const getButtons = (page, total) => {
        const buttons = [
            { id: 'first', emoji: '⏮️', style: ButtonStyle.Secondary, disabled: page === 0 },
            { id: 'prev', emoji: '◀️', style: ButtonStyle.Primary, disabled: page === 0 },
            { id: 'next', emoji: '▶️', style: ButtonStyle.Primary, disabled: page === total - 1 },
            { id: 'last', emoji: '⏭️', style: ButtonStyle.Secondary, disabled: page === total - 1 }
        ];
        
        return new ActionRowBuilder().addComponents(
            buttons.map(btn => 
                new ButtonBuilder()
                    .setCustomId(`lyrics_${btn.id}`)
                    .setEmoji(btn.emoji)
                    .setStyle(btn.style)
                    .setDisabled(btn.disabled)
            )
        );
    };
    
    const sourceIndicator = hasSyncedLyrics ? "Synced Lyrics" : "Genius Lyrics";
    
    const updatedPages = pages.map(page => {
        const footer = page.data.footer.text;
        page.data.footer.text = `${footer} • ${sourceIndicator}`;
        return page;
    });
    
    const response = await interaction.editReply({
        embeds: [updatedPages[0]],
        components: pages.length > 1 ? [getButtons(0, pages.length)] : []
    });
    
    if (pages.length <= 1) return response;
    
    const collector = response.createMessageComponentCollector({ 
        componentType: ComponentType.Button,
        time: 300000
    });
    
    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'This pagination is not for you.', ephemeral: true });
        }
        
        const navMap = {
            'lyrics_first': 0,
            'lyrics_prev': Math.max(0, currentPage - 1),
            'lyrics_next': Math.min(pages.length - 1, currentPage + 1),
            'lyrics_last': pages.length - 1
        };
        
        const newPage = navMap[i.customId];
        
        if (newPage !== undefined && newPage !== currentPage) {
            currentPage = newPage;
            await i.update({ 
                embeds: [updatedPages[currentPage]], 
                components: [getButtons(currentPage, pages.length)]
            }).catch(() => {});
        } else {
            await i.deferUpdate().catch(() => {});
        }
    });
    
    collector.on('end', async () => {
        try {
            await interaction.editReply({ components: [] }).catch(() => {});
        } catch (error) {
        }
    });
    
    return response;
}

function splitText(text, maxLength) {
    const chunks = [];
    let currentPosition = 0;
    
    while (currentPosition < text.length) {
        let chunkEnd = Math.min(currentPosition + maxLength, text.length);
        
        if (chunkEnd < text.length) {
            const lastNewline = text.lastIndexOf('\n', chunkEnd);
            if (lastNewline > currentPosition) {
                chunkEnd = lastNewline + 1;
            }
        }
        
        chunks.push(text.substring(currentPosition, chunkEnd));
        currentPosition = chunkEnd;
    }
    
    return chunks;
}
