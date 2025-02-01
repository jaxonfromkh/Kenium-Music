import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

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
            
            // Early validation of required resources
            const node = [...client.aqua.nodeMap.values()][0];
            if (!node) throw new Error("No connected nodes available.");
            
            const player = client.aqua.players.get(interaction.guildId);
            if (!player) throw new Error("No player found for this guild.");
            
            const searchQuery = interaction.options.getString('search');
            const lyricsResult = searchQuery ? 
                await player.searchLyrics(searchQuery) : 
                await player.lyrics();
            
            if (!lyricsResult?.text) throw new Error("No lyrics found.");
            
            const currentTitle = lyricsResult.track ? 
                `${lyricsResult.track.title} - ${lyricsResult.track.author}` : 
                "Current Track";
            
            const image = lyricsResult.track?.albumArt?.url || client.user.avatarURL();
            const author = lyricsResult?.provider || lyricsResult?.source || 'Unknown';
            const userTag = interaction.user.tag;
            
            const embeds = createLyricsEmbeds(
                lyricsResult.text,
                currentTitle,
                image,
                userTag,
                author
            );
            
            const row = createButtonRow(embeds.length === 1);
            

            const response = await interaction.editReply({
                embeds: [embeds[0]],
                components: embeds.length > 1 ? [row] : []
            });
            
            if (embeds.length > 1) {
                setupPaginationCollector(
                    interaction,
                    response,
                    embeds,
                    row
                );
            }
            
        } catch (error) {
            console.error('Lyrics fetch error:', error);
            const errorMessage = error.message?.includes('missing plugins')
                ? "This server doesn't have the required lyrics plugins installed."
                : error.message || "An error occurred while fetching the lyrics.";
            
            await interaction.editReply(errorMessage).catch(console.error);
        }
    },
};

function createLyricsEmbeds(lyrics, title, image, userTag, author) {
    const chunkSize = 1024;
    const chunks = [];
    
    for (let i = 0; i < lyrics.length; i += chunkSize) {
        chunks.push(lyrics.slice(i, i + chunkSize));
    }
    
    return chunks.map((chunk, index) => 
        new EmbedBuilder()
            .setTitle(`Lyrics for ${title}`)
            .setDescription(chunk)
            .setColor(0x3498db)
            .setFooter({ 
                text: `Requested by ${userTag} | Provider: ${author} | Page ${index + 1}/${chunks.length}` 
            })
            .setThumbnail(image)
    );
}

function createButtonRow(singlePage = false) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('lyrics_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('lyrics_next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(singlePage)
        );
}

function setupPaginationCollector(interaction, response, embeds, row) {
    let page = 0;
    
    const collector = interaction.channel.createMessageComponentCollector({ 
        filter: (i) => i.customId.startsWith('lyrics_'),
        time: 60000 
    });
    
    collector.on('collect', async (i) => {
        const newPage = i.customId === 'lyrics_back' ? 
            Math.max(0, page - 1) : 
            Math.min(embeds.length - 1, page + 1);
            
        if (newPage !== page) {
            page = newPage;
            row.components[0].setDisabled(page === 0);
            row.components[1].setDisabled(page === embeds.length - 1);
            
            await i.update({ 
                embeds: [embeds[page]], 
                components: [row] 
            }).catch(console.error);
        }
    });
    
    collector.on('end', () => {
        response.delete().catch(console.error);
    });
}
