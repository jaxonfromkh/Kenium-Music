import { SimpleDB } from '../utils/simpleDB.mjs';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

const EMBED_COLOR = '#000000'; 
const SUCCESS_COLOR = '#4cd964';
const ERROR_COLOR = '#ff3b30';
const FOOTER_TEXT = '🎵 Kenium Playlists';
const PAGE_SIZE = 10;

const EMOJIS = {
  playlist: '🎧',
  tracks: '💿',
  duration: '⏱️',
  created: '📅',
  artist: '🎤',
  source: '🔊',
  removed: '🗑️',
  added: '✅',
  loading: '⏳',
  youtube: '📺',
  spotify: '📗',
  soundcloud: '🔸',
  import: '📥',
  export: '📤'
};

export const Command = {
  name: "playlist",
  aliases: ["pl", "plist"],
  description: "Manage music playlists",
  usage: `
**Playlist Commands:**
\`playlist create <name>\` - Create a new playlist
\`playlist add <playlist> <track>\` - Add a track to a playlist
\`playlist remove <playlist> <index>\` - Remove a track from a playlist
\`playlist list [playlist] [page]\` - List all playlists or tracks in a specific playlist
\`playlist play <name>\` - Play a playlist
\`playlist delete <name>\` - Delete a playlist
\`playlist export <name>\` - Export a playlist as a JSON file
\`playlist import <name>\` - Import a playlist (attach JSON file)
  `,

  run: async (client, message) => {
    const prefix = "kk!";
    const commandName = "playlist";
    const content = message.content.trim();

    let args = [];
    if (content.toLowerCase().startsWith(prefix + commandName)) {
      args = content.slice((prefix + commandName).length).trim().split(/\s+/).filter(Boolean);
    } else {
      args = content.split(/\s+/).slice(1);
    }
    if (!args.length) {
      return await message.reply({ embeds: [createHelpEmbed()] });
    }

    const subcommand = args[0].toLowerCase();
    const userId = message.author.id;

    const commandHandlers = new Map([
      ['create', () => createPlaylist(message, userId, args.slice(1))],
      ['add', () => addTrackToPlaylist(message, userId, client, args.slice(1))],
      ['remove', () => removeTrackFromPlaylist(message, userId, args.slice(1))],
      ['list', () => listPlaylists(message, userId, args.slice(1))],
      ['play', () => playPlaylist(message, userId, client, args.slice(1))],
      ['delete', () => deletePlaylist(message, userId, args.slice(1))],
      ['export', () => exportPlaylist(message, userId, args.slice(1))],
      ['import', () => importPlaylist(message, userId, client, args.slice(1))],
      ['help', () => message.reply({ embeds: [createHelpEmbed()] })]
    ]);

    const handler = commandHandlers.get(subcommand);
    return handler ? await handler() : await message.reply({ embeds: [createErrorEmbed("Unknown subcommand. Use `playlist help` for available commands")] });
  }
};

function createHelpEmbed() {
  return createEmbed('Playlist Commands', Command.usage, EMBED_COLOR);
}

function createPaginationButtons(currentPage, totalPages, customIdPrev, customIdNext) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customIdPrev)
      .setLabel('Previous')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId(customIdNext)
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages)
  );
}

const createEmbed = (title, description = null, color = EMBED_COLOR) => {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${getEmojiForTitle(title)} ${title}`)
    .setTimestamp()
    .setFooter({ text: FOOTER_TEXT });

  if (description) embed.setDescription(description);
  return embed;
};

function getEmojiForTitle(title) {
  if (title.includes('Created')) return EMOJIS.playlist;
  if (title.includes('Added')) return EMOJIS.added;
  if (title.includes('Removed')) return EMOJIS.removed;
  if (title.includes('Playing')) return '▶️';
  if (title.includes('Your Playlists')) return EMOJIS.playlist;
  if (title.includes('Deleted')) return EMOJIS.removed;
  if (title.includes('Error')) return '❌';
  if (title.includes('Playlist:')) return EMOJIS.playlist;
  if (title.includes('Exported')) return EMOJIS.export;
  if (title.includes('Imported')) return EMOJIS.import;
  if (title.includes('Commands')) return '📋';
  return '🎵';
}

const createErrorEmbed = (errorMessage) => createEmbed('Error', errorMessage, ERROR_COLOR);

async function createPlaylist(message, userId, args) {
  if (!args.length) {
    return await message.reply({ embeds: [createErrorEmbed("Please provide a playlist name. Usage: `playlist create <name>`")] });
  }

  const name = args.join(' ');
  const existingPlaylist = playlistsCollection.findOne({ userId, name });
  if (existingPlaylist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${name}" already exists`)] });
  }

  playlistsCollection.insert({ userId, name, tracks: [], createdAt: new Date().toISOString() });
  const embed = createEmbed('Playlist Created', `Playlist **${name}** created successfully!`, SUCCESS_COLOR)
    .setThumbnail('https://img.icons8.com/nolan/64/playlist.png');
  await message.reply({ embeds: [embed] });
}

async function addTrackToPlaylist(message, userId, client, args) {
  if (args.length < 2) {
    return await message.reply({ embeds: [createErrorEmbed("Usage: `playlist add <playlist> <track>`")] });
  }

  const playlistName = args[0];
  const trackQuery = args.slice(1).join(' ');
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });

  if (!playlist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)] });
  }
  if (playlist.tracks.length >= 50) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" has reached the 50-track limit`)] });
  }

  const loadingMsg = await message.reply({ embeds: [createEmbed('Loading', `${EMOJIS.loading} Searching for "${trackQuery}"...`, EMBED_COLOR)] });

  try {
    const res = await client.aqua.resolve({ query: trackQuery, requester: message.author });
    if (res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") {
      return await loadingMsg.edit({
        embeds: [createErrorEmbed(res.loadType === "LOAD_FAILED" ? `Failed to load track: ${res.exception?.message || "Unknown error"}` : `No tracks found for "${trackQuery}"`)]
      });
    }

    for (const track of res.tracks.slice(0, 50 - playlist.tracks.length)) {
      playlist.tracks.push({
        title: track.info.title,
        uri: track.info.uri,
        author: track.info.author,
        duration: track.info.length,
        addedAt: new Date().toISOString()
      });
    }
    playlistsCollection.update({ _id: playlist._id }, playlist);

    const tracksAdded = Math.min(res.tracks.length, 50 - playlist.tracks.length);
    const embed = createEmbed('Tracks Added', `Added ${tracksAdded} track${tracksAdded > 1 ? 's' : ''} to **${playlistName}**`, SUCCESS_COLOR)
      .addFields(
        { name: 'Track', value: `**${res.tracks[0].info.title}**`, inline: false },
        { name: `${EMOJIS.artist} Artist`, value: res.tracks[0].info.author, inline: true },
        { name: `${EMOJIS.source} Source`, value: determineSource(res.tracks[0].info.uri), inline: true },
        { name: `${EMOJIS.tracks} Playlist Size`, value: `${playlist.tracks.length} tracks`, inline: true }
      );

    const videoId = extractYouTubeId(res.tracks[0].info.uri);
    if (videoId) embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);

    return await loadingMsg.edit({ embeds: [embed] });
  } catch (error) {
    console.error("Error adding track:", error);
    return await loadingMsg.edit({ embeds: [createErrorEmbed(`Error adding track: ${error.message || "Unknown error"}`)] });
  }
}

async function removeTrackFromPlaylist(message, userId, args) {
  if (args.length < 2) {
    return await message.reply({ embeds: [createErrorEmbed("Usage: `playlist remove <playlist> <index>`")] });
  }

  const playlistName = args[0];
  const index = parseInt(args[1]) - 1;
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });

  if (!playlist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)] });
  }
  if (isNaN(index) || index < 0 || index >= playlist.tracks.length) {
    return await message.reply({ embeds: [createErrorEmbed(`Invalid track index. Playlist has ${playlist.tracks.length} tracks`)] });
  }

  const removedTrack = playlist.tracks.splice(index, 1)[0];
  playlistsCollection.update({ _id: playlist._id }, playlist);

  const embed = createEmbed('Track Removed', `Removed **${removedTrack.title}** from **${playlistName}**`)
    .addFields(
      { name: `${EMOJIS.artist} Artist`, value: removedTrack.author || 'Unknown', inline: true },
      { name: `${EMOJIS.tracks} Remaining`, value: playlist.tracks.length.toString(), inline: true }
    );

  const videoId = extractYouTubeId(removedTrack.uri);
  if (videoId) embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);

  return await message.reply({ embeds: [embed] });
}

async function listPlaylists(message, userId, args) {
  const playlistName = args[0];
  const page = parseInt(args[1]) || 1;

  if (!playlistName) {
    const playlists = playlistsCollection.find({ userId });
    if (playlists.length === 0) {
      return await message.reply({ embeds: [createEmbed('Your Playlists', 'No playlists found. Use `playlist create <name>` to start!')] });
    }

    const totalPages = Math.ceil(playlists.length / PAGE_SIZE);
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, playlists.length);
    const visiblePlaylists = playlists.slice(startIdx, endIdx);

    const embed = createEmbed('Your Playlists', `You have **${playlists.length}** playlists • Page ${currentPage}/${totalPages}`);
    visiblePlaylists.forEach(playlist => {
      embed.addFields({ name: `${EMOJIS.playlist} ${playlist.name}`, value: `${EMOJIS.tracks} ${playlist.tracks.length} tracks` });
    });

    const components = [];
    if (totalPages > 1) {
      const customIdPrev = `playlist_prev_${currentPage}_${userId}`;
      const customIdNext = `playlist_next_${currentPage}_${userId}`;
      components.push(createPaginationButtons(currentPage, totalPages, customIdPrev, customIdNext));
    }

    return await message.reply({ embeds: [embed], components });
  } else {
    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
      return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)] });
    }
    if (playlist.tracks.length === 0) {
      return await message.reply({ embeds: [createEmbed(`Playlist: ${playlistName}`, 'This playlist is empty. Add tracks with `playlist add <playlist> <track>`')] });
    }

    const totalDuration = playlist.tracks.reduce((total, track) => total + track.duration, 0);
    const totalPages = Math.ceil(playlist.tracks.length / PAGE_SIZE);
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, playlist.tracks.length);
    const visibleTracks = playlist.tracks.slice(startIdx, endIdx);

    const embed = createEmbed(`Playlist: ${playlistName}`, `**${playlist.tracks.length} tracks** • Total Duration: ${formatDuration(totalDuration)} • Page ${currentPage}/${totalPages}`);
    visibleTracks.forEach((track, index) => {
      const source = determineSource(track.uri);
      embed.addFields({ name: `${startIdx + index + 1}. ${track.title}`, value: `${EMOJIS.artist} ${track.author || 'Unknown'} • ${EMOJIS.duration} ${formatDuration(track.duration)} • ${source}` });
    });

    const components = [];
    if (totalPages > 1) {
      const customIdPrev = `playlist_track_prev_${currentPage}_${playlistName}_${userId}`;
      const customIdNext = `playlist_track_next_${currentPage}_${playlistName}_${userId}`;
      components.push(createPaginationButtons(currentPage, totalPages, customIdPrev, customIdNext));
    }

    return await message.reply({ embeds: [embed], components });
  }
}

async function playPlaylist(message, userId, client, args) {
  if (!args.length) {
    return await message.reply({ embeds: [createErrorEmbed("Usage: `playlist play <name>`")] });
  }

  const playlistName = args.join(' ');
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)] });
  }
  if (playlist.tracks.length === 0) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" is empty. Add tracks with \`playlist add <playlist> <track>\``)] });
  }

  const member = message.guild.members.cache.get(message.author.id);
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    return await message.reply({ embeds: [createErrorEmbed("You need to be in a voice channel to play music!")] });
  }

  const loadingMsg = await message.reply({ embeds: [createEmbed('Loading Playlist', `${EMOJIS.loading} Loading tracks from **${playlistName}**...`, EMBED_COLOR)] });

  try {
    const player = client.aqua.createConnection({
      guildId: message.guild.id,
      voiceChannel: voiceChannel.id,
      textChannel: message.channel.id,
      defaultVolume: 65,
    });

    let loadedTracks = 0;
    const trackPromises = playlist.tracks.map(track =>
      client.aqua.resolve({ query: track.uri, requester: message.author })
        .then(res => {
          if (res.loadType !== "LOAD_FAILED" && res.tracks?.length) {
            player.queue.add(res.tracks[0]);
            loadedTracks++;
          }
        })
        .catch(error => console.error(`Failed to load track ${track.title}:`, error))
    );

    await Promise.all(trackPromises);
    if (!player.playing && !player.paused && player.queue.size) player.play();

    const totalDuration = playlist.tracks.reduce((total, track) => total + track.duration, 0);
    const embed = createEmbed('Now Playing Playlist', `Started playing **${playlistName}**`)
      .addFields(
        { name: `${EMOJIS.tracks} Tracks Queued`, value: `${loadedTracks}/${playlist.tracks.length}`, inline: true },
        { name: `${EMOJIS.duration} Total Duration`, value: formatDuration(totalDuration), inline: true },
        { name: '🔊 Voice Channel', value: voiceChannel.name, inline: true }
      );

    if (loadedTracks > 0) {
      embed.addFields({ name: `${EMOJIS.loading} Loading Progress`, value: createProgressBar(loadedTracks, playlist.tracks.length) });
    }

    if (playlist.tracks[0]?.uri) {
      const videoId = extractYouTubeId(playlist.tracks[0].uri);
      if (videoId) embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    }

    return await loadingMsg.edit({ embeds: [embed] });
  } catch (error) {
    console.error("Error playing playlist:", error);
    return await loadingMsg.edit({ embeds: [createErrorEmbed(`Error playing playlist: ${error.message || "Unknown error"}`)] });
  }
}

async function deletePlaylist(message, userId, args) {
  if (!args.length) {
    return await message.reply({ embeds: [createErrorEmbed("Usage: `playlist delete <name>`")] });
  }

  const playlistName = args.join(' ');
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)] });
  }

  const trackCount = playlist.tracks.length;
  const deleted = playlistsCollection.delete({ userId, name: playlistName });
  if (deleted === 0) {
    return await message.reply({ embeds: [createErrorEmbed(`Failed to delete playlist "${playlistName}"`)] });
  }

  const embed = createEmbed('Playlist Deleted', `Successfully deleted **${playlistName}**`, ERROR_COLOR)
    .addFields({ name: `${EMOJIS.removed} Tracks Removed`, value: trackCount.toString(), inline: true })
    .setThumbnail('https://img.icons8.com/nolan/64/delete-property.png');

  return await message.reply({ embeds: [embed] });
}

async function exportPlaylist(message, userId, args) {
  if (!args.length) {
    return await message.reply({ embeds: [createErrorEmbed("Usage: `playlist export <name>`")] });
  }

  const playlistName = args.join(' ');
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)] });
  }
  if (playlist.tracks.length === 0) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" is empty. Add tracks with \`playlist add <playlist> <track>\``)] });
  }

  const exportData = {
    name: playlist.name,
    tracks: playlist.tracks.map(track => ({ title: track.title, uri: track.uri, author: track.author, duration: track.duration }))
  };

  const jsonData = JSON.stringify(exportData, null, 2);
  const fileName = `${playlistName.replace(/\s+/g, '_')}_playlist.json`;
  const fileBuffer = Buffer.from(jsonData, 'utf-8');

  const embed = createEmbed('Playlist Exported', `Exported **${playlistName}** with ${playlist.tracks.length} tracks`, SUCCESS_COLOR)
    .addFields(
      { name: `${EMOJIS.export} Export File`, value: `Exported as \`${fileName}\`. Download and share!`, inline: false },
      { name: 'How to Import', value: `Use \`playlist import <name>\` and attach the JSON file`, inline: false },
      { name: `${EMOJIS.tracks} Tracks`, value: `${playlist.tracks.length}`, inline: true },
      { name: `${EMOJIS.duration} Duration`, value: formatDuration(playlist.tracks.reduce((total, track) => total + track.duration, 0)), inline: true }
    );

  if (playlist.tracks[0]?.uri) {
    const videoId = extractYouTubeId(playlist.tracks[0].uri);
    if (videoId) embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
  }

  return await message.reply({ embeds: [embed], files: [{ attachment: fileBuffer, name: fileName }] });
}

async function importPlaylist(message, userId, client, args) {
  if (!args.length) {
    return await message.reply({ embeds: [createErrorEmbed("Usage: `playlist import <name>` and attach a JSON file")] });
  }

  const playlistName = args.join(' ');
  const fileAttachment = message.attachments.first();

  if (!fileAttachment || !fileAttachment.name.endsWith('.json')) {
    return await message.reply({ embeds: [createErrorEmbed("Please attach a valid JSON file with your message")] });
  }

  const existingPlaylist = playlistsCollection.findOne({ userId, name: playlistName });
  if (existingPlaylist) {
    return await message.reply({ embeds: [createErrorEmbed(`Playlist "${playlistName}" already exists. Choose a different name`)] });
  }

  try {
    const response = await fetch(fileAttachment.url);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
    const fileContent = await response.text();
    const importData = JSON.parse(fileContent);

    if (!importData.name || !Array.isArray(importData.tracks)) {
      return await message.reply({ embeds: [createErrorEmbed("Invalid playlist format")] });
    }

    const validTracks = importData.tracks.filter(track => track.title && track.uri && typeof track.duration === 'number').slice(0, 50);
    if (validTracks.length === 0) {
      return await message.reply({ embeds: [createErrorEmbed("No valid tracks found in the playlist file")] });
    }

    const newPlaylist = { 
      userId, 
      name: playlistName, 
      tracks: validTracks, 
      createdAt: new Date().toISOString(), 
      importedAt: new Date().toISOString(), 
      originalName: importData.name 
    };
    playlistsCollection.insert(newPlaylist);

    const totalDuration = newPlaylist.tracks.reduce((total, track) => total + track.duration, 0);
    const embed = createEmbed('Playlist Imported', `Imported **${importData.name}** as **${playlistName}**`, SUCCESS_COLOR)
      .addFields(
        { name: `${EMOJIS.tracks} Tracks Imported`, value: `${newPlaylist.tracks.length}${importData.tracks.length > 50 ? ` (limited from ${importData.tracks.length})` : ''}`, inline: true },
        { name: `${EMOJIS.duration} Total Duration`, value: formatDuration(totalDuration), inline: true },
        { name: `${EMOJIS.created} Created`, value: new Date().toLocaleDateString(), inline: true }
      );

    if (newPlaylist.tracks[0]?.uri) {
      const videoId = extractYouTubeId(newPlaylist.tracks[0].uri);
      if (videoId) embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    }

    return await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error importing playlist:", error);
    return await message.reply({ embeds: [createErrorEmbed(`Error importing playlist: ${error.message || "Invalid file format"}`)] });
  }
}

// Utility functions
function formatDuration(ms) {
  if (!ms || ms === 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function determineSource(uri) {
  if (!uri) return '❓ Unknown';
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return `${EMOJIS.youtube} YouTube`;
  if (uri.includes('spotify.com')) return `${EMOJIS.spotify} Spotify`;
  if (uri.includes('soundcloud.com')) return `${EMOJIS.soundcloud} SoundCloud`;
  return '🎵 Music';
}

function extractYouTubeId(url) {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function createProgressBar(current, total, length = 20) {
  const percentage = Math.floor((current / total) * 100);
  const filledLength = Math.floor((current / total) * length);
  const emptyLength = length - filledLength;
  
  const filledBar = '█'.repeat(filledLength);
  const emptyBar = '░'.repeat(emptyLength);
  
  return `${filledBar}${emptyBar} ${percentage}%`;
}