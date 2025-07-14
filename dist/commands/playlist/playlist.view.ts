import { type CommandContext, Declare, SubCommand, Options, createStringOption } from "seyfert";
import { Embed, ActionRow, Button, StringSelectMenu } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";

// Modern Emoji Set
const ICONS = {
  music: '🎵',
  playlist: '🎧',
  add: '➕',
  play: '▶️',
  shuffle: '🔀',
  tracks: '💿',
  duration: '⏱️',
  info: 'ℹ️',
  artist: '🎤',
  source: '📡',
  youtube: '🎥',
  spotify: '🟢',
  soundcloud: '🟠'
};

// Modern Black Theme Colors
const COLORS = {
  primary: '#000000',
  error: '#000000',
  info: '#000000'
};

const PAGE_SIZE = 8; // Number of tracks per page
const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

function createEmbed(type: string, title: string, description: string | null = null, fields: Array<{ name: string; value: string; inline?: boolean }> = []) {
  const colors = {
    default: COLORS.primary,
    error: COLORS.error,
    info: COLORS.info
  };

  const icons = {
    default: ICONS.music,
    error: '❌',
    info: 'ℹ️'
  };

  const embed = new Embed()
    .setColor(colors[type] || colors.default)
    .setTitle(`${icons[type] || icons.default} ${title}`)
    .setTimestamp()
    .setFooter({
      text: `${ICONS.tracks} Kenium Music • Playlist System`,
      iconUrl: 'https://toddythenoobdud.github.io/0a0f3c0476c8b495838fa6a94c7e88c2.png'
    });

  if (description) {
    embed.setDescription(`\`\`\`fix\n${description}\n\`\`\``);
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

function createModernButtons(buttonConfigs: Array<{ id: string; label: string; emoji?: string; style?: ButtonStyle; disabled?: boolean }>) {
  const row = new ActionRow();
  buttonConfigs.forEach(config => {
    const button = new Button()
      .setCustomId(config.id)
      .setLabel(config.label)
      .setStyle(config.style || ButtonStyle.Secondary);

    if (config.emoji) button.setEmoji(config.emoji);
    if (config.disabled) button.setDisabled(true);

    row.addComponents(button);
  });
  return row;
}
function createSelectMenu(customId, placeholder, options) {
  return new ActionRow().addComponents(
    new StringSelectMenu()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOption(options.map(opt => ({
        label: opt.label,
        value: opt.value,
        description: opt.description || null,
        emoji: opt.emoji || null
      })))
  );
}

function formatDuration(ms: number): string {
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

function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getSourceIcon(uri: string): string {
  if (!uri) return ICONS.music;
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return ICONS.youtube;
  if (uri.includes('spotify.com')) return ICONS.spotify;
  if (uri.includes('soundcloud.com')) return ICONS.soundcloud;
  return ICONS.music;
}

@Declare({
  name: "view",
  description: "🎧 View your playlists or a specific playlist"
})
@Options({
  playlist: createStringOption({
    description: "Playlist name", required: true,
    autocomplete: async (interaction) => {
      const userId = interaction.user.id;
      const playlists = playlistsCollection.find({ userId });
      const options = playlists.map(playlist => ({ name: playlist.name, value: playlist.name }));
      if(options.length === 0) options.push({ name: 'No Playlists', value: 'No Playlists' });
      return interaction.respond(options);
    }
  })
})
export class ViewCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist: playlistName } = ctx.options as { playlist: string };
    const userId = ctx.author.id;

    if (!playlistName) {
      const playlists = playlistsCollection.find({ userId });

      if (playlists.length === 0) {
        const embed = createEmbed('info', 'No Playlists', 'You haven\'t created any playlists yet!', [
          { name: `${ICONS.info} Getting Started`, value: 'Use `/playlist create` to make your first playlist!' }
        ]);

        const button = createModernButtons([
          { id: `create_playlist_${userId}`, label: 'Create Playlist', emoji: ICONS.add, style: ButtonStyle.Success }
        ]);

        return await ctx.write({ embeds: [embed], components: [button], flags: 64 });
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

      await ctx.write({ embeds: [embed], components, flags: 64 });
    } else {
      const playlist = playlistsCollection.findOne({ userId, name: playlistName });

      if (!playlist) {
        return await ctx.write({
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

        return await ctx.write({ embeds: [embed], components: [button], flags: 64 });
      }

      const page = 1;
      const totalPages = Math.ceil(playlist.tracks.length / PAGE_SIZE);
      const startIdx = (page - 1) * PAGE_SIZE;
      const endIdx = Math.min(startIdx + PAGE_SIZE, playlist.tracks.length);
      const tracks = playlist.tracks.slice(startIdx, endIdx);

      const embed = createEmbed('default', `${ICONS.playlist} ${playlistName}`, null, [
        { name: `${ICONS.info} Info`, value: playlist.description || 'No description', inline: false },
        { name: `${ICONS.tracks} Tracks`, value: playlist.tracks.length.toString(), inline: true },
        { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration || 0), inline: true },
        { name: `${ICONS.info} Plays`, value: playlist.playCount?.toString() || '0', inline: true }
      ]);

      let trackList = '';
      tracks.forEach((track: any, idx: number) => {
        const position = startIdx + idx + 1;
        const duration = formatDuration(track.duration);
        const source = getSourceIcon(track.uri);
        trackList += `\`${position.toString().padStart(2, '0')}.\` **${track.title}**\n`;
        trackList += `     ${ICONS.artist} ${track.author || 'Unknown'} • ${ICONS.duration} ${duration} ${source}\n\n`;
      });

      if (trackList) {
        embed.addFields({ name: `${ICONS.music} Tracks (Page ${page}/${totalPages})`, value: trackList, inline: false });
      }

      if (tracks[0]) {
        const videoId = extractYouTubeId(tracks[0].uri);
        if (videoId) {
          embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
        }
      }

      const actionButtons = createModernButtons([
        { id: `play_playlist_${playlistName}_${userId}`, label: 'Play', emoji: ICONS.play, style: ButtonStyle.Success },
        { id: `shuffle_playlist_${playlistName}_${userId}`, label: 'Shuffle', emoji: ICONS.shuffle, style: ButtonStyle.Primary },
        { id: `manage_playlist_${playlistName}_${userId}`, label: 'Manage', emoji: '⚙️', style: ButtonStyle.Secondary }
      ]);

      const components = [actionButtons];

      if (totalPages > 1) {
        const navButtons = createModernButtons([
          { id: `playlist_prev_${page}_${playlistName}_${userId}`, label: 'Previous', emoji: '◀️', disabled: page === 1 },
          { id: `playlist_next_${page}_${playlistName}_${userId}`, label: 'Next', emoji: '▶️', disabled: page === totalPages }
        ]);
        components.push(navButtons);
      }

      await ctx.write({ embeds: [embed], components, flags: 64 });
    }
  }
}