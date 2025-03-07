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
        try {
            await interaction.deferReply();
            
            const player = client.aqua.players.get(interaction.guildId);
            if (!player) return await interaction.editReply("No player found for this guild.");
            
            const searchQuery = interaction.options.getString('search');
            
            const lyricsResult = await (searchQuery ? 
                player.searchLyrics(searchQuery) : 
                player.lyrics());
            
            if (!lyricsResult?.text) 
                return await interaction.editReply("No lyrics found.");
            
            const { text: lyrics, track, provider, source } = lyricsResult;
            const currentTitle = track ? `${track.title} - ${track.author}` : "Current Track";
            const image = track?.albumArt?.url || client.user.avatarURL();
            const author = provider || source || 'Unknown';
            
            const embeds = splitLyricsIntoEmbeds(
                lyrics,
                currentTitle,
                image,
                interaction.user.tag,
                author
            );
            
            const isMultiPage = embeds.length > 1;
            const row = isMultiPage ? createPaginationButtons(true, false) : null;
            
            const response = await interaction.editReply({
                embeds: [embeds[0]],
                components: isMultiPage ? [row] : []
            });
            
            if (isMultiPage) {
                handlePagination(interaction, response, embeds);
            }
            
        } catch (error) {
            console.error('Lyrics fetch error:', error);
            
            const errorMessage = error.message?.includes('missing plugins')
                ? "This server doesn't have the required lyrics plugins installed."
                : "An error occurred while fetching the lyrics.";
            
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Error Fetching Lyrics')
                        .setDescription(errorMessage)
                        .setColor(0xED4245)
                ]
            }).catch(() => {});
        }
    },
};

function splitLyricsIntoEmbeds(lyrics, title, image, userTag, author) {
    const maxLength = 3800;
    
    if (lyrics.length <= maxLength) {
        return [createLyricsEmbed(lyrics, title, image, userTag, author, 1, 1)];
    }
    
    const embeds = [];
    let chunkStart = 0;
    
    while (chunkStart < lyrics.length) {
        let chunkEnd = chunkStart + maxLength;
        if (chunkEnd < lyrics.length) {
            const lastNewline = lyrics.lastIndexOf('\n', chunkEnd);
            if (lastNewline > chunkStart && lastNewline <= chunkEnd) {
                chunkEnd = lastNewline;
            }
        } else {
            chunkEnd = lyrics.length;
        }
        
        embeds.push(createLyricsEmbed(
            lyrics.slice(chunkStart, chunkEnd),
            title,
            image,
            userTag,
            author,
            embeds.length + 1,
            Math.ceil(lyrics.length / maxLength)
        ));
        
        chunkStart = chunkEnd;
    }
    
    return embeds;
}

function createLyricsEmbed(content, title, image, userTag, author, pageNum, totalPages) {
    return new EmbedBuilder()
        .setTitle(`🎵 ${title}`)
        .setDescription(content)
        .setColor(0x3498db)
        .setFooter({ 
            text: `Requested by ${userTag} • Source: ${author} • Page ${pageNum}/${totalPages}` 
        })
        .setThumbnail(image)
        .setTimestamp();
}

function createPaginationButtons(isFirstDisabled, isLastDisabled) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('lyrics_first')
                .setLabel('First')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏮️')
                .setDisabled(isFirstDisabled),
            new ButtonBuilder()
                .setCustomId('lyrics_back')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('◀️')
                .setDisabled(isFirstDisabled),
            new ButtonBuilder()
                .setCustomId('lyrics_next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(isLastDisabled),
            new ButtonBuilder()
                .setCustomId('lyrics_last')
                .setLabel('Last')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏭️')
                .setDisabled(isLastDisabled)
        );
}

function handlePagination(interaction, response, embeds) {
    let currentPage = 0;
    
    const collector = response.createMessageComponentCollector({ 
        componentType: ComponentType.Button,
        idle: 300000 // 5 minutes instead of 1 minute
    });
    
    collector.on('collect', async (i) => {
        // Validate that the button was clicked by the original user
        if (i.user.id !== interaction.user.id) {
            return i.reply({ 
                content: 'This pagination is not for you.', 
                ephemeral: true 
            });
        }
        
        let newPage = currentPage;
        
        switch (i.customId) {
            case 'lyrics_first':
                newPage = 0;
                break;
            case 'lyrics_back':
                newPage = Math.max(0, currentPage - 1);
                break;
            case 'lyrics_next':
                newPage = Math.min(embeds.length - 1, currentPage + 1);
                break;
            case 'lyrics_last':
                newPage = embeds.length - 1;
                break;
        }
        
        if (newPage !== currentPage) {
            currentPage = newPage;
            const isFirst = currentPage === 0;
            const isLast = currentPage === embeds.length - 1;
            
            await i.update({ 
                embeds: [embeds[currentPage]], 
                components: [createPaginationButtons(isFirst, isLast)]
            }).catch(() => {});
        } else {
            await i.deferUpdate().catch(() => {});
        }
    });
    
    collector.on('end', () => {
        collector.stop();
        interaction.deleteReply().catch(() => {});
    });
}
