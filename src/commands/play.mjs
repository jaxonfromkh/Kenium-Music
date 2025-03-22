import { EmbedBuilder } from "discord.js";

const MAX_AUTOCOMPLETE_RESULTS = 4;
const MAX_RECENT_ITEMS = 4;
const EMBED_COLOR = 0x000000;
const RECENT_SELECTIONS_MAX = 10;
const AUTOCOMPLETE_THROTTLE_MS = 500;
const INACTIVE_THRESHOLD_MS = 6000;

const ERROR_MESSAGES = {
  NO_VOICE: "You must be in a voice channel to use this command.",
  NO_TRACKS: "No tracks found for the given query.",
  TIMEOUT: "The request timed out. Please try again.",
  GENERIC: "An error occurred while processing your request. Please try again later.",
  UNSUPPORTED: "Unsupported content type.",
  getDifferentChannel: (id) => `I'm already in <#${id}>`
};

const userRecentSelections = new Map();
const lastCleanupTime = { value: Date.now() };

const URL_REGEX = /^https?:\/\/.+/i;

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
    
    if (!voiceChannel) {
      return interaction.respond([]);
    }
    
    const focused = interaction.options.getFocused()?.trim() || "";
    const userId = interaction.user.id;
    const recentSelectionObject = userRecentSelections.get(userId) || { items: [], lastAccessed: null };
    const recentSelections = recentSelectionObject.items || [];
    
    if (URL_REGEX.test(focused)) {
      return interaction.respond([]);
    }
    
    const now = Date.now();
    if (now - this._state.lastAutocomplete < AUTOCOMPLETE_THROTTLE_MS) {
      return interaction.respond([]);
    }
    this._state.lastAutocomplete = now;
    
    if (now - lastCleanupTime.value > INACTIVE_THRESHOLD_MS) {
      this.cleanupInactiveUsers(now);
      lastCleanupTime.value = now;
    }
    
    try {
      if (!focused) {
        return interaction.respond(this.getFormattedRecentSelections(recentSelections));
      }
      
      const result = await client.aqua.search(focused, interaction.user);
  
      if (!result?.length) {
        return interaction.respond(this.getFormattedRecentSelections(recentSelections));
      }
      
      const suggestions = result
        .slice(0, MAX_AUTOCOMPLETE_RESULTS)
        .map(track => ({
          name: this.truncateTrackName(track.info.title, track.info.author),
          value: track.info.uri.slice(0, 97)
        }));
      
      return interaction.respond(
        this.combineResultsWithRecent(suggestions, recentSelections, focused)
      );
    } catch (error) {
      console.error("Autocomplete error:", error);
      return interaction.respond(this.getFormattedRecentSelections(recentSelections));
    }
  },
  
  truncateTrackName(title, author) {
    const titlePart = title?.slice(0, 97) || "";
    const authorPart = author ? ` - ${author.slice(0, 20)}` : "";
    
    const combined = `${titlePart}${authorPart}`;
    return combined.length > 100 ? combined.slice(0, 97) + "..." : combined;
  },
  
  getFormattedRecentSelections(recentSelections) {
    return (recentSelections || [])
      .slice(0, MAX_RECENT_ITEMS)
      .map(item => ({
        name: `🕒 Recently played: ${item.title?.slice(0, 97) || "Unknown"}`,
        value: (item.uri || "").slice(0, 97)
      }));
  },
  
  combineResultsWithRecent(suggestions, recentSelections, query) {
    const queryLower = query.toLowerCase();
    const recentUris = new Set(suggestions.map(s => s.value));
    
    const filteredRecent = recentSelections
      .filter(item => !recentUris.has(item.uri) && (!query || item.title.toLowerCase().includes(queryLower)))
      .map(item => ({ name: ` ${item.title.slice(0, 97)}`, value: item.uri.slice(0, 97) }));
    
    return [...filteredRecent.slice(0, MAX_RECENT_ITEMS), ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS);
  },
  
  cleanupInactiveUsers(now) {
    for (const [userId, selections] of userRecentSelections.entries()) {
      if (selections.lastAccessed && now - selections.lastAccessed > INACTIVE_THRESHOLD_MS) {
        userRecentSelections.delete(userId);
      }
    }
  },

  async run(client, interaction) {
    const { guild, member } = interaction;
    const voiceChannel = member?.voice?.channel;
    
    if (!voiceChannel) {
      return this.sendError(interaction, ERROR_MESSAGES.NO_VOICE);
    }

    const currentVoiceChannel = this.getCurrentVoiceChannel(guild, client.user.id);
    if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
      return this.sendError(interaction, ERROR_MESSAGES.getDifferentChannel(currentVoiceChannel.id));
    }

    await interaction.deferReply({ flags: 64 });
    
    try {
      const [player, result] = await Promise.all([
        this.getOrCreatePlayer(client, guild.id, voiceChannel.id, interaction.channel.id),
        client.aqua.resolve({ 
          query: interaction.options.getString("query"), 
          requester: interaction.user 
        })
      ]);


      
      if (!result?.tracks?.length) {
        return interaction.editReply(ERROR_MESSAGES.NO_TRACKS);
      }

      this.updateRecentSelections(interaction.user.id, result);
      const embed = this.createEmbed(result, player, interaction);
      
      await interaction.editReply({ embeds: [embed] });

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }
    } catch (error) {
      this.handleError(interaction, error);
    }
  },
  
  getCurrentVoiceChannel(guild, userId) {
    return guild.channels.cache.find(
      ch => ch.type === 2 && ch.members.has(userId)
    );
  },
  
  updateRecentSelections(userId, result) {
    let userSelections = userRecentSelections.get(userId);
    
    if (!userSelections) {
      userSelections = { items: [], lastAccessed: Date.now() };
      userRecentSelections.set(userId, userSelections);
    } else {
      userSelections.lastAccessed = Date.now();
    }
    
    // Add new selection based on result type
    if (["track", "search"].includes(result.loadType)) {
      this.addTrackToRecentSelections(userSelections.items, result.tracks[0]);
    } else if (result.loadType === "playlist") {
      this.addPlaylistToRecentSelections(userSelections.items, result);
    }
    
    // Truncate if needed
    if (userSelections.items.length > RECENT_SELECTIONS_MAX) {
      userSelections.items.length = RECENT_SELECTIONS_MAX;
    }
  },
  
  addTrackToRecentSelections(selections, track) {
    // Remove existing entry if present
    const existingIndex = selections.findIndex(item => item.uri === track.info.uri);
    if (existingIndex !== -1) {
      selections.splice(existingIndex, 1);
    }
    
    // Add to front
    selections.unshift({
      title: track.info.title,
      uri: track.info.uri,
      author: track.info.author
    });
  },
  
  addPlaylistToRecentSelections(selections, result) {
    selections.unshift({
      title: `${result.playlistInfo.name} (Playlist)`,
      uri: result.tracks[0].info.uri,
    });
  },

  getOrCreatePlayer(client, guildId, voiceChannelId, textChannelId) {
    const existingPlayer = client.aqua.players.get(guildId);
    
    if (existingPlayer) {
      return existingPlayer;
    }
    
    return client.aqua.createConnection({
      guildId,
      voiceChannel: voiceChannelId,
      textChannel: textChannelId,
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
        for (const track of result.tracks) {
          player.queue.add(track);
        }
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
      
    return interaction.editReply(message);
  },
};
