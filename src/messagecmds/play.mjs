import { EmbedBuilder } from "discord.js";

const EMBED_COLOR = 0x000000;
const RECENT_SELECTIONS_MAX = 10;

const ERROR_MESSAGES = {
  NO_VOICE: "You must be in a voice channel to use this command.",
  NO_TRACKS: "No tracks found for the given query.",
  TIMEOUT: "The request timed out. Please try again.",
  GENERIC: "An error occurred while processing your request. Please try again later.",
  UNSUPPORTED: "Unsupported content type.",
  getDifferentChannel: (id) => `I'm already in <#${id}>`
};

const userRecentSelections = new Map();

export const Command = {
  name: "play",
  description: "Play a song by search query or URL.",
  options: [
    {
      name: "query",
      description: "The song you want to search for",
      type: 3,
      required: true,
    },
  ],
  
  _state: {
    lastAutocomplete: 0,
  },
  

  async run(client, message) {
    const voiceChannel = message.member?.voice?.channel;
    
    if (!voiceChannel) {
      return this.sendError(message.channel, ERROR_MESSAGES.NO_VOICE);
    }

    const currentVoiceChannel = this.getCurrentVoiceChannel(message.guild, message.client.user.id);
    if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
      return this.sendError(message.channel, ERROR_MESSAGES.getDifferentChannel(currentVoiceChannel.id));
    }
    
    try {
      const [player, result] = await Promise.all([
        this.getOrCreatePlayer(message.client, message.guild.id, voiceChannel.id, message.channel.id),
        
        message.client.aqua.resolve({ 
          query: message.content.trim().replace(/^kk!play\s*/i, ""),
          requester: message.author 
        })
      ]);

      if (!result?.tracks?.length) {
        return message.reply(ERROR_MESSAGES.NO_TRACKS);
      }

      this.updateRecentSelections(message.author.id, result);
      const embed = this.createEmbed(result, player, message);
      
      await message.reply({ embeds: [embed] });

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }
    } catch (error) {
      this.handleError(message, error);
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
      defaultVolume: 65,
    });
  },

  createEmbed(result, player, message) {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTimestamp();
    const query = message.content.trim().split(/\s+/).slice(1).join(' ');
    
    
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

  sendError(channel, content) {
    return channel.send({ content });
  },

  handleError(message, error) {
    console.error("Play command error:", error);
    const errorMessage = error.message === "Query timeout" 
      ? ERROR_MESSAGES.TIMEOUT 
      : ERROR_MESSAGES.GENERIC;
      
    return message.reply(errorMessage);
  },
};

