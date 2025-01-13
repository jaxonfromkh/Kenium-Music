import { EmbedBuilder } from 'discord.js';

export const Command = {
    name: "lyrics",
    description: "Get the lyrics of the current playing song",
    run: async (client, interaction) => {
        await interaction.deferReply();

        const node = [...client.aqua.nodeMap.values()][0];
        if (!node) {
            return interaction.editReply("No connected nodes available.");
        }

        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.editReply("No player found for this guild.");
        }

        try {

            const lyricsResult = await player.lyrics(); 
            console.log(lyricsResult);

            const lyrics = lyricsResult.text;
            const author = lyricsResult.source || "Unknown";
            console.log(lyrics); 

            const embed = new EmbedBuilder()
                .setTitle(`Lyrics for ${player.queue.current?.title || 'Current Song'}`)
                .setDescription(lyrics) 
                .setColor(0x3498db)
                .setFooter({ text: `Requested by ${interaction.user.tag} | Artist: ${author}` });


            await interaction.editReply({ embeds: [embed] });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Lyrics fetch error:', error);
            if (error.message?.includes('missing plugins')) {
                return interaction.editReply("This server doesn't have the required lyrics plugins installed.");
            }
            await interaction.editReply("An error occurred while fetching the lyrics.");
        }
    },
};

