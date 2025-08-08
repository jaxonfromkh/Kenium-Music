import { type CommandContext, Declare, SubCommand, Options, createStringOption } from "seyfert";
import { Embed, ActionRow, Button, StringSelectMenu } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";
import { createEmbed, createButtons, formatDuration, extractYouTubeId, handlePlaylistAutocomplete } from "../../shared/utils";
import { ICONS, LIMITS } from "../../shared/constants";

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

function createSelectMenu(customId: string, placeholder: string, options) {
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
    description: "Playlist name",
    required: true,
    autocomplete: async (interaction: any) => {
      return handlePlaylistAutocomplete(interaction, playlistsCollection);
    }
  })
})
export class ViewCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist: playlistName } = ctx.options as { playlist: string };
    const userId = ctx.author.id;

    if (!playlistName) {
      // Show all playlists
      const playlists = playlistsCollection.find({ userId });

      if (playlists.length === 0) {
        const embed = createEmbed('info', 'No Playlists', 'You haven\'t created any playlists yet!', [
          { name: `${ICONS.info} Getting Started`, value: 'Use `/playlist create` to make your first playlist!' }
        ]);

        const button = createButtons([
          { id: `create_playlist_${userId}`, label: 'Create Playlist', emoji: ICONS.add, style: ButtonStyle.Success }
        ]);

        return ctx.write({ embeds: [embed], components: [button], flags: 64 });
      }

      const embed = createEmbed('primary', 'Your Playlists', `You have **${playlists.length}** playlist${playlists.length !== 1 ? 's' : ''}`);

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

      const components = selectOptions.length > 0 
        ? [createSelectMenu(`select_playlist_${userId}`, 'Choose a playlist to view...', selectOptions)]
        : [];

      return ctx.write({ embeds: [embed], components, flags: 64 });
    } else {
      // Show specific playlist
      const playlist = playlistsCollection.findOne({ userId, name: playlistName });

      if (!playlist) {
        return ctx.write({
          embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
          flags: 64
        });
      }

      if (playlist.tracks.length === 0) {
        const embed = createEmbed('info', `Playlist: ${playlistName}`, 'This playlist is empty', [
          { name: `${ICONS.info} Description`, value: playlist.description || 'No description' }
        ]);

        const button = createButtons([
          { id: `add_track_${playlistName}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success }
        ]);

        return ctx.write({ embeds: [embed], components: [button], flags: 64 });
      }

      const page = 1;
      const totalPages = Math.ceil(playlist.tracks.length / LIMITS.PAGE_SIZE);
      const startIdx = (page - 1) * LIMITS.PAGE_SIZE;
      const endIdx = Math.min(startIdx + LIMITS.PAGE_SIZE, playlist.tracks.length);
      const tracks = playlist.tracks.slice(startIdx, endIdx);

      const embed = createEmbed('primary', `${ICONS.playlist} ${playlistName}`, undefined, [
        { name: `${ICONS.info} Info`, value: playlist.description || 'No description', inline: false },
        { name: `${ICONS.tracks} Tracks`, value: playlist.tracks.length.toString(), inline: true },
        { name: `${ICONS.duration} Duration`, value: formatDuration(playlist.totalDuration || 0), inline: true },
        { name: `${ICONS.info} Plays`, value: playlist.playCount?.toString() || '0', inline: true }
      ]);

      if (tracks.length > 0) {
        const trackList = tracks.map((track: any, idx: number) => {
          const position = startIdx + idx + 1;
          const duration = formatDuration(track.duration || 0);
          const source = getSourceIcon(track.uri);
          return `\`${position.toString().padStart(2, '0')}.\` **${track.title}**\n     ${ICONS.artist} ${track.author || 'Unknown'} • ${ICONS.duration} ${duration} ${source}`;
        }).join('\n\n');

        embed.addFields({ name: `${ICONS.music} Tracks (Page ${page}/${totalPages})`, value: trackList, inline: false });

        const videoId = extractYouTubeId(tracks[0].uri);
        if (videoId) {
          embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
        }
      }

      const actionButtons = createButtons([
        { id: `play_playlist_${playlistName}_${userId}`, label: 'Play', emoji: ICONS.play, style: ButtonStyle.Success },
        { id: `shuffle_playlist_${playlistName}_${userId}`, label: 'Shuffle', emoji: ICONS.shuffle, style: ButtonStyle.Primary },
        { id: `manage_playlist_${playlistName}_${userId}`, label: 'Manage', emoji: '⚙️', style: ButtonStyle.Secondary }
      ]);

      const components = [actionButtons];

      if (totalPages > 1) {
        const navButtons = createButtons([
          { id: `playlist_prev_${page}_${playlistName}_${userId}`, label: 'Previous', emoji: '◀️', disabled: page === 1 },
          { id: `playlist_next_${page}_${playlistName}_${userId}`, label: 'Next', emoji: '▶️', disabled: page === totalPages }
        ]);
        components.push(navButtons);
      }

      return ctx.write({ embeds: [embed], components, flags: 64 });
    }
  }
}