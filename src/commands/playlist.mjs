import { SimpleDB } from '../utils/simpleDB.mjs';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

// Modern Black Theme Colors
const COLORS = {
  primary: '#000000',     // Pure black
  secondary: '#1a1a1a',   // Dark gray
  accent: '#000000',      // Black for contrast
  success: '#000000',     // Black
  error: '#000000',       // Black
  warning: '#000000',     // Black
  info: '#000000',        // Black
  premium: '#000000'      // Black accent
};

const PAGE_SIZE = 8; // Reduced for cleaner look

// Modern Emoji Set
const ICONS = {
  playlist: '🎧',
  music: '🎵',
  play: '▶️',
  pause: '⏸️',
  stop: '⏹️',
  shuffle: '🔀',
  repeat: '🔁',
  volume: '🔊',
  tracks: '💿',
  duration: '⏱️',
  artist: '🎤',
  source: '📡',
  add: '➕',
  remove: '➖',
  delete: '🗑️',
  export: '📤',
  import: '📥',
  search: '🔍',
  loading: '⚡',
  success: '✨',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  youtube: '🎥',
  spotify: '🟢',
  soundcloud: '🟠',
  premium: '👑',
  fire: '🔥',
  star: '⭐',
  diamond: '💎'
};

export const PlaylistButtonHandler = {
  name: 'playlistButtons',

  async run(client, interaction) {
    if (
      !(
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isModalSubmit()
      )
    )
      return;

    const customId = interaction.customId;

    const fastHandlers = [
      ['add_track_', handleAddTrack],
      ['view_playlist_', handleViewPlaylist],
      ['play_playlist_', handlePlayPlaylist],
      ['shuffle_playlist_', handleShufflePlaylist],
      ['manage_playlist_', handleManagePlaylist],
      ['add_more_', handleAddMore],
      ['create_playlist_', handleCreatePlaylist],
      ['remove_track_', handleRemoveTrackModal],
      ['edit_description_', handleEditDescription],
      ['playlist_prev_', handlePagination],
      ['playlist_next_', handlePagination],
      ['select_playlist_', handlePlaylistSelect],
      ['modal_add_track_', handleAddTrackModal],
      ['modal_remove_track_', handleRemoveTrackSubmit],
      ['modal_edit_description_', handleEditDescriptionSubmit],
      ['modal_create_playlist_', handleCreatePlaylistSubmit]
    ];

    try {
      for (let i = 0; i < fastHandlers.length; i++) {
        const [prefix, fn] = fastHandlers[i];
        if (customId.startsWith(prefix)) {
          if (fn.length === 2) {
            await fn(client, interaction);
          } else {
            await fn(interaction);
          }
          return;
        }
      }
    } catch (error) {
      console.error('Playlist button handler error:', error);
      const errorEmbed = createEmbed('error', 'Button Error', `An error occurred: ${error.message}`);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
      }
    }
  }
};

export const Command = {
  name: "playlist",
  description: "🎧 Advanced playlist management system",
  options: [
    {
      name: "create",
      description: "✨ Create a new playlist",
      type: 1,
      options: [
        { name: "name", description: "Name of your playlist", type: 3, required: true },
        { name: "description", description: "Optional description", type: 3, required: false }
      ]
    },
    {
      name: "add",
      description: "➕ Add tracks to playlist",
      type: 1,
      options: [
        { name: "playlist", description: "Target playlist", type: 3, required: true, autocomplete: true },
        { name: "track", description: "Track name or URL", type: 3, required: true, autocomplete: true }
      ]
    },
    {
      name: "remove",
      description: "➖ Remove track from playlist",
      type: 1,
      options: [
        { name: "playlist", description: "Target playlist", type: 3, required: true, autocomplete: true },
        { name: "index", description: "Track position (1-based)", type: 4, required: true, autocomplete: true }
      ]
    },
    {
      name: "view",
      description: "👀 Browse playlists and tracks",
      type: 1,
      options: [
        { name: "playlist", description: "Specific playlist to view", type: 3, required: false, autocomplete: true }
      ]
    },
    {
      name: "play",
      description: "▶️ Play a playlist",
      type: 1,
      options: [
        { name: "name", description: "Playlist to play", type: 3, required: true, autocomplete: true },
        { name: "shuffle", description: "Shuffle playback", type: 5, required: false }
      ]
    },
    {
      name: "delete",
      description: "🗑️ Delete a playlist",
      type: 1,
      options: [
        { name: "name", description: "Playlist to delete", type: 3, required: true, autocomplete: true }
      ]
    },
    {
      name: "export",
      description: "📤 Export playlist data",
      type: 1,
      options: [
        { name: "name", description: "Playlist to export", type: 3, required: true, autocomplete: true },
        {
          name: "format", description: "Export format", type: 3, required: false, choices: [
            { name: "JSON", value: "json" },
            { name: "Plain Text", value: "txt" }
          ]
        }
      ]
    },
    {
      name: "import",
      description: "📥 Import playlist data",
      type: 1,
      options: [
        { name: "file", description: "JSON file to import", type: 11, required: true },
        { name: "name", description: "New playlist name", type: 3, required: false }
      ]
    },
    {
      name: "manage",
      description: "⚙️ Advanced playlist management",
      type: 1,
      options: [
        { name: "playlist", description: "Playlist to manage", type: 3, required: true, autocomplete: true }
      ]
    }
  ],

  run: async (client, interaction) => {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Voice channel validation for music commands
    if (['play'].includes(subcommand)) {
      if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
        return await interaction.reply({
          embeds: [createEmbed('error', 'Voice Channel Required', 'You must be in the same voice channel as the bot!')],
          flags: 64
        });
      }
    }


    const handlers = {
      create: () => createPlaylist(interaction, userId),
      add: () => addTrackToPlaylist(interaction, userId, client),
      remove: () => removeTrackFromPlaylist(interaction, userId),
      view: () => viewPlaylists(interaction, userId),
      play: () => playPlaylist(client, interaction, userId, interaction.options.getString("name"), interaction.options.getBoolean("shuffle") || false),
      delete: () => deletePlaylist(interaction, userId),
      export: () => exportPlaylist(interaction, userId),
      import: () => importPlaylist(interaction, userId, client),
      manage: () => managePlaylist(interaction, userId)
    };

    const handler = handlers[subcommand];
    if (!handler) {
      return await interaction.reply({
        embeds: [createEmbed('error', 'Unknown Command', 'This subcommand is not recognized.')],
        flags: 64
      });
    }

    try {
      await handler();
      if (interaction.customId && interaction.customId.startsWith('add_track_')) {
      console.warn(`Deprecated interaction ID: ${interaction.customId}. Use subcommands instead.`);
    }
    } catch (error) {
      console.error(`Playlist command error [${subcommand}]:`, error);
      const errorEmbed = createEmbed('error', 'System Error', `An unexpected error occurred: ${error.message}`);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
      }
    }
  },

  autocomplete: async (client, interaction) => {
    const focusedOption = interaction.options.getFocused(true);
    const userId = interaction.user.id;
    let choices = [];

    try {
      switch (focusedOption.name) {
        case "playlist":
        case "name": {
          const playlists = playlistsCollection.find({ userId });
          choices = playlists.map(p => ({
            name: `${ICONS.playlist} ${p.name} (${p.tracks.length} tracks)`,
            value: p.name
          }));
          break;
        }

        case "track": {
          const query = focusedOption.value.toLowerCase();

          if (/spotify\.com|youtube\.com|youtu\.be|soundcloud\.com/.test(query)) {
            const source = query.includes("spotify.com") ? "Spotify" :
              query.includes("youtube.com") || query.includes("youtu.be") ? "YouTube" : "SoundCloud";
            choices = [{ name: `${getSourceIcon(source)} Use ${source} link`, value: focusedOption.value }];
          } else if (query.length > 2) {
            choices = [{ name: `${ICONS.search} Search: ${focusedOption.value}`, value: focusedOption.value }];

            if (client.aqua?.search) {
              try {
                const results = await client.aqua.resolve({ query: focusedOption.value });
                if (results?.tracks?.length) {
                  choices = results.tracks.slice(0, 8).map(track => ({
                    name: `${getSourceIcon(track.info.uri)} ${track.info.title} - ${track.info.author}`.substring(0, 100),
                    value: track.info.uri
                  }));
                }
              } catch (error) {
                console.error("Autocomplete search error:", error);
              }
            }
          }
          break;
        }

        case "index": {
          const playlistName = interaction.options.getString("playlist");
          if (playlistName) {
            const playlist = playlistsCollection.findOne({ userId, name: playlistName });
            if (playlist?.tracks?.length) {
              choices = playlist.tracks.map((track, index) => ({
                name: `${index + 1}. ${track.title} - ${track.author || 'Unknown'}`.substring(0, 100),
                value: index + 1
              }));
            }
          }
          break;
        }
      }

      // Smart filtering
      const searchTerm = focusedOption.value.toLowerCase();
      let filtered = choices.filter(choice =>
        choice.name.toLowerCase().includes(searchTerm)
      );

      await interaction.respond(filtered.slice(0, 25));
    } catch (error) {
      console.error("Autocomplete error:", error);
      await interaction.respond([]);
    }
  }
};





function createSelectMenu(customId, placeholder, options) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options.map(opt => ({
        label: opt.label,
        value: opt.value,
        description: opt.description || null,
        emoji: opt.emoji || null
      })))
  );
}

// Helper Functions
function createEmbed(type, title, description = null, fields = []) {
  const colors = {
    default: COLORS.primary,
    success: COLORS.success,
    error: COLORS.error,
    warning: COLORS.warning,
    info: COLORS.info,
    premium: COLORS.premium
  };

  const icons = {
    default: ICONS.music,
    success: ICONS.success,
    error: ICONS.error,
    warning: ICONS.warning,
    info: ICONS.info,
    premium: ICONS.premium
  };

  const embed = new EmbedBuilder()
    .setColor(colors[type] || colors.default)
    .setTitle(`${icons[type] || icons.default} ${title}`)
    .setTimestamp()
    .setFooter({
      text: `${ICONS.diamond} Kenium Music • Playlist System`,
      iconURL: 'https://toddythenoobdud.github.io/0a0f3c0476c8b495838fa6a94c7e88c2.png'
    });

  if (description) {
    embed.setDescription(`\`\`\`fix\n${description}\n\`\`\``);
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

function createModernButtons(buttonConfigs) {
  const row = new ActionRowBuilder();
  buttonConfigs.forEach(config => {
    const button = new ButtonBuilder()
      .setCustomId(config.id)
      .setLabel(config.label)
      .setStyle(config.style || ButtonStyle.Secondary);

    if (config.emoji) button.setEmoji(config.emoji);
    if (config.disabled) button.setDisabled(true);

    row.addComponents(button);
  });
  return row;
}

// Button Handler Functions
async function handleAddTrack(client, interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_add_track_${playlistName}_${userId}`)
    .setTitle(`Add Track to ${playlistName}`);

  const trackInput = new TextInputBuilder()
    .setCustomId('track_query')
    .setLabel('Track Name or URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter song name or paste YouTube/Spotify URL...')
    .setRequired(true)
    .setMaxLength(500);

  const row = new ActionRowBuilder().addComponents(trackInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleViewPlaylist(client, interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only view your own playlists!')],
      flags: 64
    });
  }

  await showPlaylistDetails(interaction, userId, playlistName);
}

async function handlePlayPlaylist(client, interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only play your own playlists!')],
      flags: 64
    });
  }

  await playPlaylist(client, interaction, userId, playlistName, false);
}

async function handleShufflePlaylist(client, interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only play your own playlists!')],
      flags: 64
    });
  }

  await playPlaylist(client, interaction, userId, playlistName, true);
}

async function handleManagePlaylist(interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `Playlist "${playlistName}" no longer exists!`)],
      flags: 64
    });
  }

  const embed = createEmbed('info', 'Playlist Management', `Managing "${playlistName}"`, [
    { name: `${ICONS.tracks} Tracks`, value: playlist.tracks.length.toString(), inline: true },
    { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration || 0), inline: true },
    { name: `${ICONS.star} Plays`, value: (playlist.playCount || 0).toString(), inline: true }
  ]);

  const buttons = createModernButtons([
    { id: `add_track_${playlistName}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success },
    { id: `remove_track_${playlistName}_${userId}`, label: 'Remove Tracks', emoji: ICONS.remove, style: ButtonStyle.Danger },
    { id: `edit_description_${playlistName}_${userId}`, label: 'Edit Info', emoji: ICONS.info, style: ButtonStyle.Primary }
  ]);

  await interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
}

async function handleAddMore(interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  await handleAddTrack(interaction);
}

async function handleCreatePlaylist(interaction) {
  const userId = interaction.customId.split('_')[2];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'This button is not for you!')],
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_create_playlist_${userId}`)
    .setTitle('Create New Playlist');

  const nameInput = new TextInputBuilder()
    .setCustomId('playlist_name')
    .setLabel('Playlist Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter playlist name...')
    .setRequired(true)
    .setMaxLength(50);

  const descInput = new TextInputBuilder()
    .setCustomId('playlist_description')
    .setLabel('Description (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe your playlist...')
    .setRequired(false)
    .setMaxLength(200);

  const nameRow = new ActionRowBuilder().addComponents(nameInput);
  const descRow = new ActionRowBuilder().addComponents(descInput);
  
  modal.addComponents(nameRow, descRow);

  await interaction.showModal(modal);
}

async function handleRemoveTrackModal(interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist || playlist.tracks.length === 0) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'No Tracks', 'This playlist has no tracks to remove!')],
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_remove_track_${playlistName}_${userId}`)
    .setTitle(`Remove Track from ${playlistName}`);

  const indexInput = new TextInputBuilder()
    .setCustomId('track_index')
    .setLabel('Track Number to Remove')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Enter track number (1-${playlist.tracks.length})...`)
    .setRequired(true)
    .setMaxLength(3);

  const row = new ActionRowBuilder().addComponents(indexInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleEditDescription(interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(2, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `Playlist "${playlistName}" no longer exists!`)],
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_edit_description_${playlistName}_${userId}`)
    .setTitle(`Edit ${playlistName}`);

  const descInput = new TextInputBuilder()
    .setCustomId('new_description')
    .setLabel('New Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter new description...')
    .setValue(playlist.description || '')
    .setRequired(false)
    .setMaxLength(200);

  const row = new ActionRowBuilder().addComponents(descInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handlePagination(interaction) {
  const parts = interaction.customId.split('_');
  const direction = parts[1]; // 'prev' or 'next'
  const currentPage = parseInt(parts[2]);
  const playlistName = parts.slice(3, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only navigate your own playlists!')],
      flags: 64
    });
  }

  const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
  await showPlaylistDetailsWithPage(interaction, userId, playlistName, newPage);
}

async function handlePlaylistSelect(interaction) {
  const userId = interaction.customId.split('_')[2];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only select your own playlists!')],
      flags: 64
    });
  }

  const selectedPlaylist = interaction.values[0];
  await showPlaylistDetails(interaction, userId, selectedPlaylist);
}

// Modal Submit Handlers
async function handleAddTrackModal(client, interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(3, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const trackQuery = interaction.fields.getTextInputValue('track_query');
  await addTrackToPlaylistModal(interaction, userId, client, playlistName, trackQuery);
}

async function handleRemoveTrackSubmit(interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(3, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const indexStr = interaction.fields.getTextInputValue('track_index');
  const index = parseInt(indexStr) - 1;

  if (isNaN(index)) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Invalid Input', 'Please enter a valid track number!')],
      flags: 64
    });
  }

  await removeTrackFromPlaylistModal(interaction, userId, playlistName, index);
}

async function handleEditDescriptionSubmit(interaction) {
  const parts = interaction.customId.split('_');
  const playlistName = parts.slice(3, -1).join('_');
  const userId = parts[parts.length - 1];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'You can only manage your own playlists!')],
      flags: 64
    });
  }

  const newDescription = interaction.fields.getTextInputValue('new_description');
  await updatePlaylistDescription(interaction, userId, playlistName, newDescription);
}

async function handleCreatePlaylistSubmit(interaction) {
  const userId = interaction.customId.split('_')[3];

  if (interaction.user.id !== userId) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Access Denied', 'This modal is not for you!')],
      flags: 64
    });
  }

  const name = interaction.fields.getTextInputValue('playlist_name');
  const description = interaction.fields.getTextInputValue('playlist_description') || 'No description provided';

  await createPlaylistModal(interaction, userId, name, description);
}

// Modal-based playlist creation
async function createPlaylistModal(interaction, userId, name, description) {
  const existing = playlistsCollection.findOne({ userId, name });
  if (existing) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Exists', `A playlist named "${name}" already exists!`)],
      flags: 64
    });
  }

  const playlist = {
    userId,
    name,
    description,
    tracks: [],
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    playCount: 0,
    totalDuration: 0
  };

  playlistsCollection.insert(playlist);

  const embed = createEmbed('success', 'Playlist Created', null, [
    { name: `${ICONS.playlist} Name`, value: `**${name}**`, inline: true },
    { name: `${ICONS.info} Description`, value: description, inline: true },
    { name: `${ICONS.star} Status`, value: 'Ready for tracks!', inline: true }
  ]);

  const buttons = createModernButtons([
    { id: `add_track_${name}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success },
    { id: `view_playlist_${name}_${userId}`, label: 'View Playlist', emoji: ICONS.playlist, style: ButtonStyle.Primary }
  ]);

  await interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
}

async function showPlaylistDetailsWithPage(interaction, userId, playlistName, page) {
  await interaction.deferUpdate();
  await showPlaylistDetails(interaction, userId, playlistName, page);
}

async function addTrackToPlaylistModal(interaction, userId, client, playlistName, trackQuery) {
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `Playlist "${playlistName}" no longer exists!`)],
      flags: 64
    });
  }

  if (playlist.tracks.length >= 100) {
    return await interaction.reply({
      embeds: [createEmbed('warning', 'Playlist Full', 'This playlist has reached the 100-track limit!')],
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const res = await client.aqua.resolve({ query: trackQuery, requester: interaction.user });

    if (res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") {
      const errorMsg = res.loadType === "LOAD_FAILED"
        ? `Failed to load: ${res.exception?.message || "Unknown error"}`
        : `No results found for "${trackQuery}"`;

      return await interaction.editReply({
        embeds: [createEmbed('error', 'Track Load Failed', errorMsg)]
      });
    }

    console.log("Resolved tracks:", res.tracks);

    const tracksToAdd = res.tracks.slice(0, Math.min(10, 100 - playlist.tracks.length));
    let addedCount = 0;

    for (const track of tracksToAdd) {
      const exists = playlist.tracks.some(t => t.uri === track.info.uri);
      if (!exists) {
        playlist.tracks.push({
          title: track.info.title,
          uri: track.info.uri,
          author: track.info.author,
          duration: track.info.length,
          addedAt: new Date().toISOString(),
          addedBy: userId,
          source: determineSource(track.info.uri)
        });
        addedCount++;
      }
    }

    playlist.lastModified = new Date().toISOString();
    playlist.totalDuration = playlist.tracks.reduce((sum, track) => sum + track.duration, 0);
    playlistsCollection.update({ _id: playlist._id }, playlist);

    const primaryTrack = tracksToAdd[0];
    const embed = createEmbed('success', 'Tracks Added', null, [
      { name: `${ICONS.music} Track`, value: `**${primaryTrack.info.title}**`, inline: false },
      { name: `${ICONS.artist} Artist`, value: primaryTrack.info.author || 'Unknown', inline: true },
      { name: `${ICONS.source} Source`, value: determineSource(primaryTrack.info.uri), inline: true },
      { name: `${ICONS.tracks} Added`, value: `${addedCount} track${addedCount !== 1 ? 's' : ''}`, inline: true },
      { name: `${ICONS.playlist} Total`, value: `${playlist.tracks.length} tracks`, inline: true },
      { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration), inline: true }
    ]);
    const videoId = extractYouTubeId(primaryTrack.info.uri);
if (videoId) {
  embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
}

const buttons = createModernButtons([
  { id: `add_more_${playlistName}_${userId}`, label: 'Add More', emoji: ICONS.add, style: ButtonStyle.Secondary },
  { id: `play_playlist_${playlistName}_${userId}`, label: 'Play Now', emoji: ICONS.play, style: ButtonStyle.Success },
  { id: `view_playlist_${playlistName}_${userId}`, label: 'View All', emoji: ICONS.playlist, style: ButtonStyle.Primary }
]);

await interaction.editReply({ embeds: [embed], components: [buttons] });
  } catch (error) {
console.error("Add track (modal) error:", error);
await interaction.editReply({
  embeds: [createEmbed('error', 'Add Failed', `Could not add track: ${error.message}`)]
});
  }
}



// Command Implementations
async function createPlaylist(interaction, userId) {
  const name = interaction.options.getString("name");
  const description = interaction.options.getString("description") || "No description provided";

  const existing = playlistsCollection.findOne({ userId, name });
  if (existing) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Exists', `A playlist named "${name}" already exists!`)],
      flags: 64
    });
  }

  const playlist = {
    userId,
    name,
    description,
    tracks: [],
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    playCount: 0,
    totalDuration: 0
  };

  playlistsCollection.insert(playlist);

  const embed = createEmbed('success', 'Playlist Created', null, [
    { name: `${ICONS.playlist} Name`, value: `**${name}**`, inline: true },
    { name: `${ICONS.info} Description`, value: description, inline: true },
    { name: `${ICONS.star} Status`, value: 'Ready for tracks!', inline: true }
  ]);

  const buttons = createModernButtons([
    { id: `add_track_${name}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success },
    { id: `view_playlist_${name}_${userId}`, label: 'View Playlist', emoji: ICONS.playlist, style: ButtonStyle.Primary }
  ]);

  await interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
}

async function addTrackToPlaylist(interaction, userId, client) {
  const playlistName = interaction.options.getString("playlist");
  const trackQuery = interaction.options.getString("track");

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  if (playlist.tracks.length >= 100) {
    return await interaction.reply({
      embeds: [createEmbed('warning', 'Playlist Full', 'This playlist has reached the 100-track limit!')],
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const res = await client.aqua.resolve({ query: trackQuery, requester: interaction.user });

    if (res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") {
      const errorMsg = res.loadType === "LOAD_FAILED"
        ? `Failed to load: ${res.exception?.message || "Unknown error"}`
        : `No results found for "${trackQuery}"`;

      return await interaction.editReply({
        embeds: [createEmbed('error', 'Track Load Failed', errorMsg)]
      });
    }

    const tracksToAdd = res.tracks.slice(0, Math.min(10, 100 - playlist.tracks.length));
    let addedCount = 0;

    for (const track of tracksToAdd) {
      // Check for duplicates
      const exists = playlist.tracks.some(t => t.uri === track.info.uri);
      if (!exists) {
        playlist.tracks.push({
          title: track.info.title,
          uri: track.info.uri,
          author: track.info.author,
          duration: track.info.length,
          addedAt: new Date().toISOString(),
          addedBy: userId,
          source: determineSource(track.info.uri)
        });
        addedCount++;
      }
    }

    playlist.lastModified = new Date().toISOString();
    playlist.totalDuration = playlist.tracks.reduce((sum, track) => sum + track.duration, 0);
    playlistsCollection.update({ _id: playlist._id }, playlist);

    const primaryTrack = tracksToAdd[0];
    const embed = createEmbed('success', 'Tracks Added', null, [
      { name: `${ICONS.music} Track`, value: `**${primaryTrack.info.title}**`, inline: false },
      { name: `${ICONS.artist} Artist`, value: primaryTrack.info.author || 'Unknown', inline: true },
      { name: `${ICONS.source} Source`, value: determineSource(primaryTrack.info.uri), inline: true },
      { name: `${ICONS.tracks} Added`, value: `${addedCount} track${addedCount !== 1 ? 's' : ''}`, inline: true },
      { name: `${ICONS.playlist} Total`, value: `${playlist.tracks.length} tracks`, inline: true },
      { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration), inline: true }
    ]);

    const videoId = extractYouTubeId(primaryTrack.info.uri);
    if (videoId) {
      embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
    }

    const buttons = createModernButtons([
      { id: `add_more_${playlistName}_${userId}`, label: 'Add More', emoji: ICONS.add, style: ButtonStyle.Secondary },
      { id: `play_playlist_${playlistName}_${userId}`, label: 'Play Now', emoji: ICONS.play, style: ButtonStyle.Success },
      { id: `view_playlist_${playlistName}_${userId}`, label: 'View All', emoji: ICONS.playlist, style: ButtonStyle.Primary }
    ]);

    await interaction.editReply({ embeds: [embed], components: [buttons] });
  } catch (error) {
    console.error("Add track error:", error);
    await interaction.editReply({
      embeds: [createEmbed('error', 'Add Failed', `Could not add track: ${error.message}`)]
    });
  }
}

async function removeTrackFromPlaylist(interaction, userId) {
  const playlistName = interaction.options.getString("playlist");
  const index = interaction.options.getInteger("index") - 1;

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  if (index < 0 || index >= playlist.tracks.length) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Invalid Index', `Track index must be between 1 and ${playlist.tracks.length}`)],
      flags: 64
    });
  }

  const removedTrack = playlist.tracks.splice(index, 1)[0];
  playlist.lastModified = new Date().toISOString();
  playlist.totalDuration = playlist.tracks.reduce((sum, track) => sum + track.duration, 0);
  playlistsCollection.update({ _id: playlist._id }, playlist);

  const embed = createEmbed('success', 'Track Removed', null, [
    { name: `${ICONS.remove} Removed`, value: `**${removedTrack.title}**`, inline: false },
    { name: `${ICONS.artist} Artist`, value: removedTrack.author || 'Unknown', inline: true },
    { name: `${ICONS.source} Source`, value: removedTrack.source || 'Unknown', inline: true },
    { name: `${ICONS.tracks} Remaining`, value: `${playlist.tracks.length} tracks`, inline: true }
  ]);

  const videoId = extractYouTubeId(removedTrack.uri);
  if (videoId) {
    embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
  }

  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function viewPlaylists(interaction, userId) {
  const playlistName = interaction.options.getString("playlist");

  if (!playlistName) {
    const playlists = playlistsCollection.find({ userId });

    if (playlists.length === 0) {
      const embed = createEmbed('info', 'No Playlists', 'You haven\'t created any playlists yet!', [
        { name: `${ICONS.info} Getting Started`, value: 'Use `/playlist create` to make your first playlist!' }
      ]);

      const button = createModernButtons([
        { id: `create_playlist_${userId}`, label: 'Create Playlist', emoji: ICONS.add, style: ButtonStyle.Success }
      ]);

      return await interaction.reply({ embeds: [embed], components: [button], flags: 64 });
    }

    const embed = createEmbed('default', 'Your Playlists', `You have **${playlists.length}** playlist${playlists.length !== 1 ? 's' : ''}`);

    playlists.slice(0, 10).forEach(playlist => {
      const duration = formatDuration(playlist.totalDuration || 0);
      const lastModified = new Date(playlist.lastModified || playlist.createdAt).toLocaleDateString();

      embed.addFields({
        name: `${ICONS.playlist} ${playlist.name}`,
        value: `${ICONS.tracks} ${playlist.tracks.length} tracks • ${ICONS.duration} ${duration}\n${ICONS.info} Modified: ${lastModified}`,
        inline: true
      });
    });

    // Create selection menu for playlists
    const selectOptions = playlists.slice(0, 25).map(playlist => ({
      label: playlist.name,
      value: playlist.name,
      description: `${playlist.tracks.length} tracks • ${formatDuration(playlist.totalDuration || 0)}`,
      emoji: ICONS.playlist
    }));

    const components = [];
    if (selectOptions.length > 0) {
      components.push(createSelectMenu(`select_playlist_${userId}`, 'Choose a playlist to view...', selectOptions));
    }

    await interaction.reply({ embeds: [embed], components, flags: 64 });
  } else {
    // Show specific playlist
    await showPlaylistDetails(interaction, userId, playlistName);
  }
}

async function showPlaylistDetails(interaction, userId, playlistName) {
  const playlist = playlistsCollection.findOne({ userId, name: playlistName });

  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  if (playlist.tracks.length === 0) {
    const embed = createEmbed('info', `Playlist: ${playlistName}`, 'This playlist is empty', [
      { name: `${ICONS.info} Description`, value: playlist.description || 'No description' }
    ]);

    const button = createModernButtons([
      { id: `add_track_${playlistName}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success }
    ]);

    return await interaction.reply({ embeds: [embed], components: [button], flags: 64 });
  }

  // Create paginated view
  const page = 1;
  const totalPages = Math.ceil(playlist.tracks.length / PAGE_SIZE);
  const startIdx = (page - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, playlist.tracks.length);
  const tracks = playlist.tracks.slice(startIdx, endIdx);

  const embed = createEmbed('default', `${ICONS.playlist} ${playlistName}`, null, [
    { name: `${ICONS.info} Info`, value: playlist.description || 'No description', inline: false },
    { name: `${ICONS.tracks} Tracks`, value: playlist.tracks.length.toString(), inline: true },
    { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration || 0), inline: true },
    { name: `${ICONS.star} Plays`, value: playlist.playCount?.toString() || '0', inline: true }
  ]);

  // Add track listing
  let trackList = '';
  tracks.forEach((track, idx) => {
    const position = startIdx + idx + 1;
    const duration = formatDuration(track.duration);
    const source = getSourceIcon(track.uri);
    trackList += `\`${position.toString().padStart(2, '0')}.\` **${track.title}**\n`;
    trackList += `     ${ICONS.artist} ${track.author || 'Unknown'} • ${ICONS.duration} ${duration} ${source}\n\n`;
  });

  if (trackList) {
    embed.addFields({ name: `${ICONS.music} Tracks (Page ${page}/${totalPages})`, value: trackList, inline: false });
  }

  // Set thumbnail from first track
  if (tracks[0]) {
    const videoId = extractYouTubeId(tracks[0].uri);
    if (videoId) {
      embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
    }
  }

  // Create action buttons
  const actionButtons = createModernButtons([
    { id: `play_playlist_${playlistName}_${userId}`, label: 'Play', emoji: ICONS.play, style: ButtonStyle.Success },
    { id: `shuffle_playlist_${playlistName}_${userId}`, label: 'Shuffle', emoji: ICONS.shuffle, style: ButtonStyle.Primary },
    { id: `manage_playlist_${playlistName}_${userId}`, label: 'Manage', emoji: '⚙️', style: ButtonStyle.Secondary }
  ]);

  const components = [actionButtons];

  // Add pagination if needed
  if (totalPages > 1) {
    const navButtons = createModernButtons([
      { id: `playlist_prev_${page}_${playlistName}_${userId}`, label: 'Previous', emoji: '◀️', disabled: page === 1 },
      { id: `playlist_next_${page}_${playlistName}_${userId}`, label: 'Next', emoji: '▶️', disabled: page === totalPages }
    ]);
    components.push(navButtons);
  }

  const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[method]({ embeds: [embed], components, flags: 64 });
}

async function playPlaylist(client, interaction, userId, playlistName, shuffle) {

  if (!playlistName) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'No Playlist Selected', 'You must specify a playlist to play.')],
      flags: 64
    });
  }

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  if (playlist.tracks.length === 0) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Empty Playlist', 'This playlist has no tracks to play!')],
      flags: 64
    });
  }

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'No Voice Channel', 'You need to be in a voice channel to play music!')],
      flags: 64
    });
  }

  await interaction.deferReply();

  try {
    const player = client.aqua.createConnection({
      guildId: interaction.guild.id,
      voiceChannel: voiceChannel.id,
      textChannel: interaction.channel.id,
      defaultVolume: 65,
      deaf: true
    });

    let tracksToPlay = [...playlist.tracks];
    if (shuffle) {
      // Fisher-Yates shuffle
      for (let i = tracksToPlay.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
      }
    }

    let loadedCount = 0;
    const loadPromises = tracksToPlay.map(async (track) => {
      try {
        const res = await client.aqua.resolve({ query: track.uri, requester: interaction.user });
        if (res.loadType !== "LOAD_FAILED" && res.tracks?.length) {
          player.queue.add(res.tracks[0]);
          loadedCount++;
        }
      } catch (error) {
        console.error(`Failed to load track ${track.title}:`, error);
      }
    });

    await Promise.all(loadPromises);

    if (loadedCount === 0) {
      return await interaction.editReply({
        embeds: [createEmbed('error', 'Load Failed', 'Could not load any tracks from this playlist')]
      });
    }

    // Update play count
    playlist.playCount = (playlist.playCount || 0) + 1;
    playlistsCollection.update({ _id: playlist._id }, playlist);

    if (!player.playing && !player.paused && player.queue.size) {
      player.play();
    }

    const embed = createEmbed('success', shuffle ? 'Shuffling Playlist' : 'Playing Playlist', null, [
      { name: `${ICONS.playlist} Playlist`, value: `**${playlistName}**`, inline: true },
      { name: `${ICONS.tracks} Loaded`, value: `${loadedCount}/${playlist.tracks.length} tracks`, inline: true },
      { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration), inline: true },
      { name: `${ICONS.volume} Channel`, value: voiceChannel.name, inline: true },
      { name: `${ICONS.shuffle} Mode`, value: shuffle ? 'Shuffled' : 'Sequential', inline: true }
    ]);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Play playlist error:", error);
    await interaction.editReply({
      embeds: [createEmbed('error', 'Play Failed', `Could not play playlist: ${error.message}`)]
    });
  }
}

// Implement deletePlaylist function
async function deletePlaylist(interaction, userId) {
  const playlistName = interaction.options.getString("name");

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  playlistsCollection.delete({ userId, name: playlistName });

  const embed = createEmbed('success', 'Playlist Deleted', `Successfully deleted playlist "${playlistName}"`);

  await interaction.reply({ embeds: [embed], flags: 64 });
}

// Implement exportPlaylist function
async function exportPlaylist(interaction, userId) {
  const playlistName = interaction.options.getString("name");
  const format = interaction.options.getString("format") || "json";

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  let content;
  let fileName;
  if (format === "json") {
    content = JSON.stringify(playlist, null, 2);
    fileName = `${playlistName}.json`;
  } else if (format === "txt") {
    content = `Playlist: ${playlist.name}\nDescription: ${playlist.description || 'None'}\n\nTracks:\n`;
    playlist.tracks.forEach((track, index) => {
      content += `${index + 1}. ${track.title} - ${track.author || 'Unknown'} - ${formatDuration(track.duration)}\n`;
    });
    fileName = `${playlistName}.txt`;
  } else {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Invalid Format', 'Please choose a valid format: json or txt')],
      flags: 64
    });
  }

  const buffer = Buffer.from(content, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: fileName });

  await interaction.reply({ files: [attachment], flags: 64 });
}

// Implement importPlaylist function
async function importPlaylist(interaction, userId, client) {
  const attachment = interaction.options.getAttachment("file");
  const providedName = interaction.options.getString("name");

  try {
    const response = await fetch(attachment.url);
    const data = await response.json();

    // Validate the imported data
    if (!data.name || !Array.isArray(data.tracks)) {
      return await interaction.reply({
        embeds: [createEmbed('error', 'Invalid File', 'The file must contain a valid playlist with name and tracks array.')],
        flags: 64
      });
    }

    // Determine the playlist name
    let playlistName = providedName || data.name;

    // Check if playlist name already exists
    const existing = playlistsCollection.findOne({ userId, name: playlistName });
    if (existing) {
      return await interaction.reply({
        embeds: [createEmbed('error', 'Name Conflict', `A playlist named "${playlistName}" already exists!`)],
        flags: 64
      });
    }

    // Create new playlist
    const newPlaylist = {
      userId,
      name: playlistName,
      description: data.description || "Imported playlist",
      tracks: data.tracks.map(track => ({
        title: track.title,
        uri: track.uri,
        author: track.author,
        duration: track.duration,
        addedAt: new Date().toISOString(),
        addedBy: userId,
        source: determineSource(track.uri)
      })),
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      playCount: 0,
      totalDuration: data.tracks.reduce((sum, track) => sum + (track.duration || 0), 0)
    };

    playlistsCollection.insert(newPlaylist);

    const embed = createEmbed('success', 'Playlist Imported', null, [
      { name: `${ICONS.playlist} Name`, value: `**${playlistName}**`, inline: true },
      { name: `${ICONS.tracks} Tracks`, value: `${newPlaylist.tracks.length}`, inline: true },
      { name: `${ICONS.duration} Duration`, value: formatDuration(newPlaylist.totalDuration), inline: true }
    ]);

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (error) {
    console.error("Import playlist error:", error);
    await interaction.reply({
      embeds: [createEmbed('error', 'Import Failed', `Could not import playlist: ${error.message}`)],
      flags: 64
    });
  }
}

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
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return `${ICONS.youtube} YouTube`;
  if (uri.includes('spotify.com')) return `${ICONS.spotify} Spotify`;
  if (uri.includes('soundcloud.com')) return `${ICONS.soundcloud} SoundCloud`;
  return '🎵 Music';
}

function extractYouTubeId(url) {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getSourceIcon(uri) {
  if (!uri) return ICONS.music;
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return ICONS.youtube;
  if (uri.includes('spotify.com')) return ICONS.spotify;
  if (uri.includes('soundcloud.com')) return ICONS.soundcloud;
  return ICONS.music; // Default icon for unknown sources
}


// Implement managePlaylist function
async function managePlaylist(interaction, userId) {
  const playlistName = interaction.options.getString("playlist");

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist) {
    return await interaction.reply({
      embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
      flags: 64
    });
  }

  const embed = createEmbed('info', 'Manage Playlist', `Options for managing "${playlistName}"`, [
    { name: `${ICONS.add} Add Tracks`, value: 'Add more tracks to the playlist', inline: true },
    { name: `${ICONS.remove} Remove Tracks`, value: 'Remove tracks by index', inline: true },
    { name: `${ICONS.info} Edit Description`, value: 'Change the playlist description', inline: true }
  ]);

  const buttons = createModernButtons([
    { id: `add_track_${playlistName}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success },
    { id: `remove_track_${playlistName}_${userId}`, label: 'Remove Tracks', emoji: ICONS.remove, style: ButtonStyle.Danger },
    { id: `edit_description_${playlistName}_${userId}`, label: 'Edit Description', emoji: ICONS.info, style: ButtonStyle.Primary }
  ]);

  await interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
}
