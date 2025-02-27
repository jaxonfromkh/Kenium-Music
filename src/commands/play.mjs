import { EmbedBuilder } from "discord.js";

const AUTOCOMPLETE_DELAY = 300;
const MAX_AUTOCOMPLETE_RESULTS = 6;
const EMBED_COLOR = 0x000000;

export const Command = {
  name: "play",
  description: "Play a song by search query or URL.",
  options: [{
    name: 'query',
    description: 'The song you want to search for',
    type: 3,
    required: true,
    autocomplete: true,
  }],

  // Prevent concurrent autocomplete requests
  _state: {
    lastAutocomplete: 0,
    isRequestInProgress: false
  },

  async autocomplete(client, interaction) {
    const focused = interaction.options.getFocused()?.trim() || '';
    
    const now = Date.now();
    if ((this._state.lastAutocomplete || 0) + 300 > now) {
      return interaction.respond([]);
    }
    this._state.lastAutocomplete = now;

    if (this._state.isRequestInProgress) {
      return interaction.respond([]);
    }

    this._state.isRequestInProgress = true;
    try {
      const { tracks = [] } = await client.aqua.resolve({
        query: focused,
        requester: interaction.user
      }) || {};

      const suggestions = tracks
        .slice(0, 6)
        .map(({ info: { title, uri, author } }) => {
          let name = `${title.slice(0, 80)}${author ? ` - ${author.slice(0, 20)}` : ''}`;
          if (name.length > 100) {
            name = name.substring(0, 97) + '...';
          }
          return {
            name: name,
            value: uri
          };
        });

      return interaction.respond(suggestions);
    } catch (error) {
      console.error('Autocomplete error:', error);
      return interaction.respond([]);
    } finally {
      this._state.isRequestInProgress = false;
    }
  },
  async run(client, interaction) {
    const { guild, member, channel } = interaction;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) return this.sendError(interaction, 'You must be in a voice channel to use this command.');

    const currentVoiceChannel = guild.channels.cache.find(
      ch => ch.type === 2 && ch.members.has(client.user.id)
    );
    if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
      return this.sendError(interaction, `I'm already in <#${currentVoiceChannel.id}>`);
    }

    await interaction.deferReply({ flags: 64 });
    try {
      const player = this.createPlayer(client, guild, voiceChannel, channel);
      const result = await this.resolveTrack(client, interaction);
      if (!result?.tracks?.length) {
        return interaction.editReply('No tracks found for the given query.');
      }

      const embed = this.handleTrackResult(result, player, interaction);
      await interaction.editReply({ embeds: [embed] });

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }
    } catch (error) {
      this.handleError(interaction, error);
    }
  },

  createPlayer(client, guild, voiceChannel, channel) {
    return client.aqua.createConnection({
      guildId: guild.id,
      voiceChannel: voiceChannel.id,
      textChannel: channel.id,
      deaf: true,
      shouldDeleteMessage: true
    });
  },

  async resolveTrack(client, interaction) {
    const query = interaction.options.getString('query');
    return client.aqua.resolve({ query, requester: interaction.user });
  },

  handleTrackResult(result, player, interaction) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
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
        for (const track of result.tracks) {
          player.queue.add(track);
        }
        embed.setDescription(
          `Added [${result.playlistInfo.name}](${interaction.options.getString('query')}) playlist (${result.tracks.length} tracks) to the queue.`
        );
        break;
      }
      default:
        throw new Error('Unsupported content type.');
    }
    return embed;
  },
  sendError(interaction, content) {
    return interaction.reply({ content, flags: 64 });
  },

  handleError(interaction, error) {
    console.error('Play command error:', error);
    const errorMessage = error.message === 'Query timeout'
      ? 'The request timed out. Please try again.'
      : 'An error occurred while processing your request. Please try again later.';
    return this.sendError(interaction, errorMessage);
  }
};
