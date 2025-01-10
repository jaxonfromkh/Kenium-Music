import { EmbedBuilder, MessageFlags } from "discord.js";

export const Command = {
  name: "play",
  description: "Play a song by search query or URL.",
  options: [
    {
      name: 'query',
      description: 'The song you want to search for',
      type: 3,
      required: true,
      autocomplete: true,
    },
  ],
  async autocomplete(client, interaction) {
    try {
      const focused = interaction.options.getFocused() || '';
      if (focused.length < 2) return interaction.respond([]);
      const now = Date.now();
      if ((this.lastAutocomplete || 0) + 300 > now) return interaction.respond([]); // Reduced delay
      this.lastAutocomplete = now;

      const { tracks } = await client.aqua.resolve({ query: focused, requester: interaction.user }) || {};
      if (!tracks?.length) return interaction.respond([]);
      return interaction.respond(tracks.slice(0, 9).map(({ info: { title, uri } }) => ({
        name: title.slice(0, 100),
        value: uri
      })));
    } catch (error) {
      console.error('Autocomplete error:', error);
      return interaction.respond([]);
    }
  },
  async run(client, interaction) {
    try {
      const { guild, member, channel } = interaction;
      const voiceChannel = member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: 'You must be in a voice channel to use this command.',
          flags: MessageFlags.Ephemeral
        });
      }

      const currentVoiceChannel = guild.channels.cache.find(
        ch => ch.type === 2 && ch.members.has(client.user.id)
      );

      if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
        return interaction.reply({
          content: `I'm already in <#${currentVoiceChannel.id}>`,
          flags: MessageFlags.Ephemeral
        });
      }

      interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Removed await

      const player = client.aqua.createConnection({
        guildId: guild.id,
        voiceChannel: voiceChannel.id,
        textChannel: channel.id,
        deaf: true,
      });

      const query = interaction.options.getString('query');
      const result = await client.aqua.resolve({ query, requester: interaction.user });

      if (!result?.tracks?.length) {
        return interaction.editReply('No tracks found for the given query.');
      }

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTimestamp();

      switch (result.loadType) {
        case "track":
        case "search": {
          const track = result.tracks[0];
          player.queue.add(track);
          embed.setDescription(`Added [${track.info.title}](${track.info.uri}) to the queue.`);
          break;
        }
        case "playlist": {
          const { tracks } = result;
          player.queue.add(tracks);
          embed.setDescription(`Added ${result.playlistInfo.name} playlist (${tracks.length} tracks) to the queue.`);
          break;
        }
        default:
          return interaction.editReply('Unsupported content type.');
      }

      await interaction.editReply({ embeds: [embed] });
      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }
    } catch (error) {
      console.error('Play command error:', error);
      const errorMessage = error.message === 'Query timeout' 
        ? 'The request timed out. Please try again.'
        : 'An error occurred while processing your request. Please try again later.';
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  },
};
