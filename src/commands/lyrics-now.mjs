// This will not be continued + Not public 
// This system is unstable, not synced, and not properly tested + made
// That shit was hard for me tho, its impossible to sync, make i try spotify system


export const Command = {
  name: "lyrics_now",
  description: "Real time stuff",
  options: [
    {
      name: 'search',
      description: 'Search for lyrics by song title or artist',
      type: 3,
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
    try {
      if (searchQuery) {
        lyricsResult = await player.searchLyrics(searchQuery);
      } else {
        lyricsResult = await player.lyrics();
      }
      if (!lyricsResult || (!lyricsResult.text && !lyricsResult.lines)) {
        return interaction.editReply("No lyrics found.").catch(console.error);
      }
      let lyrics;
      let currentLineIndex = 0;
      let updateInterval;
      if (lyricsResult.lines) {
        lyrics = lyricsResult.lines;
        updateInterval = (line) => {
          const delay = line.range.start - Date.now();
          return delay;
        };
      } else {
        lyrics = lyricsResult.text.split('\n');
        updateInterval = 5000; 
      }
      const updateLyrics = async () => {
        const contextLines = 5; 
        const startLine = Math.max(0, currentLineIndex - contextLines);
        const endLine = Math.min(lyrics.length - 1, currentLineIndex + contextLines);
        let displayLines;
        if (lyricsResult.lines) {
          displayLines = lyrics.map((line, index) => {
            return index === currentLineIndex ? `**${line.line}**` : line.line;
          }).slice(startLine, endLine + 1).join('\n');
        } else {
          displayLines = lyrics.map((line, index) => {
            return index === currentLineIndex ? `**${line}**` : line;
          }).slice(startLine, endLine + 1).join('\n');
        }
        const totalLines = lyrics.length; 
        await interaction.editReply(displayLines);
      };
      await updateLyrics();
      const lyricsInterval = setInterval(async () => {
        try {
          if (lyricsResult.lines) {
            if (currentLineIndex < lyrics.length - 1) {
              currentLineIndex++; 
              const delay = updateInterval(lyrics[currentLineIndex]);
              if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              await updateLyrics();
            } else {
              clearInterval(lyricsInterval);
              await interaction.deleteReply();
            }
          } else {
            if (currentLineIndex < lyrics.length - 1) {
              currentLineIndex++; 
              await updateLyrics();
            } else {
              clearInterval(lyricsInterval);
              await interaction.deleteReply();
            }
          }
        } catch (error) {
          console.error('Lyrics fetch error:', error);
          clearInterval(lyricsInterval);
          await interaction.editReply("Failed to update lyrics.").catch(console.error);
        }
      }, lyricsResult.lines ? updateInterval(lyrics[currentLineIndex]) : updateInterval);
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
