import { ChannelType, EmbedBuilder, ApplicationCommandOptionType } from "discord.js";

export const Command = {
  name: "play",
  description: "Play a song by search query or URL.",
  options: [
    {
      name: 'query',
      description: 'The song you want to search for',
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    },
  ],
  async autocomplete(client, interaction) {
    // Clear previous references
    const focused = interaction.options.getFocused();
    
    // Get query directly from the focused interaction
    const query = focused ? focused : interaction.options.getString('query');
    if (query) {
        try {
            // Fetch results while maintaining minimal data in memory
            const results = await client.aqua.resolve({ query, requester: interaction.user });
            if (results.tracks) {
                // We map and create options only when we have tracks
                const options = results.tracks.slice(0, 9).map(track => ({
                    name: track.info.title,
                    value: track.info.uri
                }));
                await interaction.respond(options);
            }
        } catch (error) {
            console.error('Error fetching autocomplete data:', error);
            // It's important to handle errors; either send a response or log it
        }
    }
  },
//   async autocomplete(client, interaction) {
//     try {
//       // Early return if no focused option
//       if (!interaction.options.getFocused()) return interaction.respond([]);
  
//       const query = interaction.options.getString('query');
//       if (!query) return interaction.respond([]);
  
//       // Set a reasonable limit for results
//       const RESULTS_LIMIT = 9;
      
//       // Stream results instead of loading all at once
//       const results = await client.aqua.resolve({ 
//         query, 
//         requester: interaction.user,
//         limit: RESULTS_LIMIT // Only fetch what we need
//       });
  
//       // Map directly without storing full track objects
//       const options = results.tracks.map(track => ({
//         name: track.info.title,
//         value: track.info.uri
//       })).slice(0, RESULTS_LIMIT);
  
//       // Clear any references
//       results.tracks = null;
  
//       return interaction.respond(options);
//     } catch (error) {
//       console.error('Autocomplete error:', error);
// //       return interaction.respond([]);
// //    }
//  }

  run: async (client, interaction) => {
    try {
      const { guild, member } = interaction;
      const voiceChannel = member.voice.channel;

      if (!voiceChannel) return;
      if (guild.members.me.voice.channelId !== voiceChannel.id) return await interaction.reply({ content: 'You must be in the same voice channel as me to use this command.', ephemeral: true });
      const player =  client.aqua.createConnection({
        guildId: guild.id,
        voiceChannel: voiceChannel.id,
        textChannel: interaction.channel.id,
        deaf: true,
      });

      const query = interaction.options.getString('query');
      const result = await client.aqua.resolve({ query, requester: member });

      if (!result.tracks.length) {
        return interaction.reply({ content: 'No tracks found for the given query.', ephemeral: true });
      }

      const embed = new EmbedBuilder().setColor(0x000000);
      const { loadType, tracks, playlistInfo } = result;

      if (loadType === "track" || loadType === "search") {
        player.queue.add(tracks[0]);
        embed.setDescription(`Added [${tracks[0].info.title}](${tracks[0].info.uri}) to the queue.`);
      } else if (loadType === "playlist") {
        tracks.forEach(track => player.queue.add(track));
        embed.setDescription(`Added ${playlistInfo.name} playlist to the queue.`);
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }
    } catch (error) {
      console.error('An error occurred while executing the play command:', error);
      await interaction.reply({ content: 'An error occurred while trying to play the song. Please try again later.', ephemeral: true });
    }
  },
};
