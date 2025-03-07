import { EmbedBuilder } from "discord.js";

const MAX_AUTOCOMPLETE_RESULTS = 4;
const MAX_RECENT_ITEMS = 4;
const EMBED_COLOR = 0x000000;
const ERROR_MESSAGES = {
  NO_VOICE: "You must be in a voice channel to use this command.",
  DIFFERENT_CHANNEL: (id) => `I'm already in <#${id}>`,
  NO_TRACKS: "No tracks found for the given query.",
  TIMEOUT: "The request timed out. Please try again.",
  GENERIC: "An error occurred while processing your request. Please try again later.",
  UNSUPPORTED: "Unsupported content type."
};

const userRecentSelections = new Map();
const RECENT_SELECTIONS_MAX = 10;

export const Command = {
  name: "play",
  description: "Play a song by search query or URL.",
  options: [
    {
      name: "query",
      description: "The song you want to search for",
      type: 3,
      required: true,
      autocomplete: true,
    },
  ],

  _state: {
    lastAutocomplete: 0,
  },
  
  async autocomplete(client, interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    const focused = interaction.options.getFocused()?.trim();
    const userId = interaction.user.id;
    
    if (!voiceChannel) {
      return interaction.respond([]);
    }
    
    const recentSelections = userRecentSelections.get(userId) || [];
    
    if (!focused) {
      const recentItems = this.formatRecentSelections(recentSelections);
      return interaction.respond(recentItems);
    }
    
    try {
      const result = await client.aqua.resolve({ 
        query: focused, 
        requester: interaction.user 
      });
      
      if (!result?.tracks?.length) {
        const recentItems = this.formatRecentSelections(recentSelections);
        return interaction.respond(recentItems);
      }
      
      const suggestions = result.tracks
        .slice(0, MAX_AUTOCOMPLETE_RESULTS)
        .map(track => ({
          name: `${track.info.title.slice(0, 80)}${track.info.author ? ` - ${track.info.author.slice(0, 20)}` : ""}`.slice(0, 100),
          value: track.info.uri
        }));
      
      const combinedResults = this.combineResultsWithRecent(suggestions, recentSelections, focused);
      
      return interaction.respond(combinedResults);
      
    } catch (error) {
      console.error("Autocomplete error:", error);
      const recentItems = this.formatRecentSelections(recentSelections);
      return interaction.respond(recentItems);
    }
  },

  formatRecentSelections(recentSelections) {
    return recentSelections
      .slice(0, MAX_RECENT_ITEMS)
      .map(item => ({
        name: `🕒 Recently played: ${item.title}`,
        value: item.uri
      }));
  },

  combineResultsWithRecent(suggestions, recentSelections, query) {
    const recentUris = new Set(suggestions.map(s => s.value));
    const filteredRecent = recentSelections
      .filter(item => !recentUris.has(item.uri) && 
                      (!query || item.title.toLowerCase().includes(query.toLowerCase())))
      .slice(0, MAX_RECENT_ITEMS)
      .map(item => ({
        name: `🕒 Recently played: ${item.title}`,
        value: item.uri
      }));
    
    return [...filteredRecent, ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS);
  },

  async run(client, interaction) {
    const { guild, member } = interaction;
    const voiceChannel = member?.voice?.channel;
    const userId = interaction.user.id;
    
    if (!voiceChannel) {
      return this.sendError(interaction, ERROR_MESSAGES.NO_VOICE);
    }

    const currentVoiceChannel = guild.channels.cache.find(
      ch => ch.type === 2 && ch.members.has(client.user.id)
    );
    
    if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
      return this.sendError(interaction, ERROR_MESSAGES.DIFFERENT_CHANNEL(currentVoiceChannel.id));
    }

    await interaction.deferReply({ flags: 64 });
    
    try {
      const [player, result] = await Promise.all([
        this.getOrCreatePlayer(client, guild, voiceChannel, interaction.channel),
        client.aqua.resolve({ 
          query: interaction.options.getString("query"), 
          requester: interaction.user 
        })
      ]);
      
      if (!result?.tracks?.length) {
        return interaction.editReply(ERROR_MESSAGES.NO_TRACKS);
      }

      const embed = this.createEmbed(result, player, interaction);
      
      this.updateRecentSelections(userId, result);
      
      await interaction.editReply({ embeds: [embed] });

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }
    } catch (error) {
      this.handleError(interaction, error);
    }
  },
  
  updateRecentSelections(userId, result) {
    if (!userRecentSelections.has(userId)) {
      userRecentSelections.set(userId, []);
    }
    
    const userSelections = userRecentSelections.get(userId);
    
    if (["track", "search"].includes(result.loadType)) {
      const track = result.tracks[0];
      
      const existingIndex = userSelections.findIndex(item => item.uri === track.info.uri);
      if (existingIndex !== -1) {
        userSelections.splice(existingIndex, 1);
      }
      
      userSelections.unshift({
        title: track.info.title,
        uri: track.info.uri,
        author: track.info.author
      });
    } else if (result.loadType === "playlist") {
      userSelections.unshift({
        title: `${result.playlistInfo.name} (Playlist)`,
        uri: result.tracks[0].info.uri,
      });
    }
    
    if (userSelections.length > RECENT_SELECTIONS_MAX) {
      userSelections.length = RECENT_SELECTIONS_MAX;
    }

    const now = Date.now();
    const inactiveThreshold = 6000;
    for (const [userId, { lastAccessed }] of userRecentSelections.entries()) {
      if (now - lastAccessed > inactiveThreshold) {
        userRecentSelections.delete(userId);
      }
    }
  },

  getOrCreatePlayer(client, guild, voiceChannel, channel) {
    const existingPlayer = client.aqua.players.get(guild.id);
    
    if (existingPlayer) {
      return existingPlayer;
    }
    
    return client.aqua.createConnection({
      guildId: guild.id,
      voiceChannel: voiceChannel.id,
      textChannel: channel.id,
      deaf: true,
      shouldDeleteMessage: true,
    });
  },

  createEmbed(result, player, interaction) {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTimestamp();
    const query = interaction.options.getString("query");
    
    switch(result.loadType) {
      case "track":
      case "search": {
        const track = result.tracks[0];
        player.queue.add(track);
        embed.setDescription(`Added [${track.info.title}](${track.info.uri}) to the queue.`);
        break;
      }
      case "playlist": {
        player.queue.add(result.tracks);
        embed.setDescription(
          `Added [${result.playlistInfo.name}](${query}) playlist (${result.tracks.length} tracks) to the queue.`
        );
        break;
      }
      default:
        throw new Error(ERROR_MESSAGES.UNSUPPORTED);
    }
    
    return embed;
  },

  sendError(interaction, content) {
    return interaction.reply({ content, flags: 64 });
  },

  handleError(interaction, error) {
    console.error("Play command error:", error);
    const message = error.message === "Query timeout" 
      ? ERROR_MESSAGES.TIMEOUT 
      : ERROR_MESSAGES.GENERIC;
      
    return this.sendError(interaction, message);
  },
};
