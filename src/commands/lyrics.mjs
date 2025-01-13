import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

export const Command = {
    name: "lyrics",
    description: "Get the lyrics of the current playing song or search for lyrics.",
    options: [
        {
            name: 'search',
            description: 'Search for lyrics by song title or artist',
            type: 3, // Ensure this is the correct type for STRING
            required: false,
        },
    ],
    run: async (client, interaction) => {
        await interaction.deferReply();
        const node = client.aqua.nodeMap.values().next().value; 
        if (!node) {
            return interaction.editReply("No connected nodes available.").catch(console.error);
        }
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.editReply("No player found for this guild.").catch(console.error);
        }
        const searchQuery = interaction.options.getString('search');
        let lyricsResult;
        let currentTitle;
        try {
            if (searchQuery) {
                lyricsResult = await player.searchLyrics(searchQuery);
                currentTitle = searchQuery;
            } else {
                lyricsResult = await player.lyrics();
            }
            if (!lyricsResult || !lyricsResult.text) {
                console.log(lyricsResult);
                return interaction.editReply("No lyrics found.").catch(console.error);
            }
            const lyrics = lyricsResult.text;
            const author = lyricsResult?.provider || lyricsResult?.source || 'Unknown'; 
            const currentTrack = lyricsResult.track;
            if (!currentTitle) {
                currentTitle = "Current Track";
            }

            const image = currentTrack?.albumArt?.url || client.user.avatarURL();
            const embeds = [];
            const chunkSize = 1024;
            for (let i = 0; i < lyrics.length; i += chunkSize) {
                const chunk = lyrics.substring(i, i + chunkSize);
                const embed = new EmbedBuilder()
                    .setTitle(`Lyrics for ${currentTitle}`)
                    .setDescription(chunk)
                    .setColor(0x3498db)
                    .setFooter({ text: `Requested by ${interaction.user.tag} | Provider: ${author} | Page ${Math.floor(i / chunkSize) + 1}` })
                    .setThumbnail(image);
                embeds.push(embed);
            }
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lyrics_back')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('lyrics_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary),
                );
            let page = 0;
            const filter = (i) => i.customId === 'lyrics_back' || i.customId === 'lyrics_next';
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });
            collector.on('collect', async (i) => {
                if (i.customId === 'lyrics_back') {
                    page = Math.max(page - 1, 0);
                } else {
                    page = Math.min(page + 1, embeds.length - 1);
                }
                row.components[0].setDisabled(page === 0);
                row.components[1].setDisabled(page === embeds.length - 1);
                await i.update({ embeds: [embeds[page]], components: [row] }).catch(console.error);
            });
            await interaction.editReply({ embeds: [embeds[0]], components: [row] }).catch(console.error);
            collector.on('end', async () => {
                await interaction.deleteReply().catch(console.error);
            })
        } catch (error) {
            console.error('Lyrics fetch error:', error);
            let errorMessage = "An error occurred while fetching the lyrics.";
            if (error.message?.includes('missing plugins')) {
                errorMessage = "This server doesn't have the required lyrics plugins installed.";
            }
            await interaction.editReply(errorMessage).catch(console.error);
        }
    },
};
