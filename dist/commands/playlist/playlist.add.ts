import { type CommandContext, Declare, SubCommand, Options, createStringOption } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";
import { createEmbed, createButtons, formatDuration, determineSource, extractYouTubeId, handlePlaylistAutocomplete, handleTrackAutocomplete } from "../../shared/utils";
import { ICONS, LIMITS } from "../../shared/constants";

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

@Declare({
  name: "add",
  description: "➕ Add tracks to playlist"
})
@Options({
  playlist: createStringOption({
    description: "Playlist name",
    required: true,
    autocomplete: async (interaction: any) => {
      return handlePlaylistAutocomplete(interaction, playlistsCollection);
    }
  }),
  tracks: createStringOption({
    description: "Tracks to add",
    required: true,
    autocomplete: async (interaction: any) => {
      return handleTrackAutocomplete(interaction);
    }
  })
})
export class AddCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist: playlistName, tracks: trackQuery } = ctx.options as { playlist: string; tracks: string };
    const userId = ctx.author.id;

    const playlistDb = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlistDb) {
      return ctx.write({
        embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
        flags: 64
      });
    }

    if (playlistDb.tracks.length >= LIMITS.MAX_TRACKS) {
      return ctx.write({
        embeds: [createEmbed('warning', 'Playlist Full', `This playlist has reached the ${LIMITS.MAX_TRACKS}-track limit!`)],
        flags: 64
      });
    }

    await ctx.deferReply(true);

    try {
      // Parse selected tracks (assuming comma-separated titles/URIs)
      const selectedTracks = trackQuery.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

      const res = await ctx.client.aqua.resolve({ query: trackQuery, requester: ctx.author });

      if (res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") {
        const errorMsg = res.loadType === "LOAD_FAILED"
          ? `Failed to load: ${res.exception?.message ?? "Unknown error"}`
          : `No results found for "${trackQuery}"`;

        return ctx.editOrReply({
          embeds: [createEmbed('error', 'Track Load Failed', errorMsg)]
        });
      }

      const remainingSlots = LIMITS.MAX_TRACKS - playlistDb.tracks.length;
      const existingUris = new Set(playlistDb.tracks.map(t => t.uri));
      const timestamp = new Date().toISOString();

      // Filter resolved tracks to only those selected by the user
      const tracksToAdd = res.tracks
        .filter(track =>
          selectedTracks.some(sel =>
            track.info.title.toLowerCase() === sel.toLowerCase() ||
            track.info.uri === sel
          )
        )
        .slice(0, remainingSlots);

      let addedCount = 0;
      for (const track of tracksToAdd) {
        if (!existingUris.has(track.info.uri)) {
          playlistDb.tracks.push({
            title: track.info.title,
            uri: track.info.uri,
            author: track.info.author,
            duration: track.info.length,
            addedAt: timestamp,
            addedBy: userId,
            source: determineSource(track.info.uri)
          });
          addedCount++;
        }
      }

      playlistDb.lastModified = timestamp;
      playlistDb.totalDuration = playlistDb.tracks.reduce((sum: number, track: any) => sum + (track.duration || 0), 0);
      playlistsCollection.update({ _id: playlistDb._id }, playlistDb);

      const primaryTrack = tracksToAdd[0];
      const embed = createEmbed('success', 'Tracks Added', undefined, [
        { name: `${ICONS.music} Track`, value: primaryTrack ? `**${primaryTrack.info.title}**` : 'None', inline: false },
        { name: `${ICONS.artist} Artist`, value: primaryTrack ? (primaryTrack.info.author || 'Unknown') : 'Unknown', inline: true },
        { name: `${ICONS.source} Source`, value: primaryTrack ? determineSource(primaryTrack.info.uri) : 'Unknown', inline: true },
        { name: `${ICONS.tracks} Added`, value: `${addedCount} track${addedCount !== 1 ? 's' : ''}`, inline: true },
        { name: `${ICONS.playlist} Total`, value: `${playlistDb.tracks.length} tracks`, inline: true },
        { name: `${ICONS.duration} Duration`, value: formatDuration(playlistDb.totalDuration), inline: true }
      ]);

      const videoId = primaryTrack ? extractYouTubeId(primaryTrack.info.uri) : null;
      if (videoId) {
        embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
      }

      const buttons = createButtons([
        { id: `add_more_${playlistName}_${userId}`, label: 'Add More', emoji: ICONS.add, style: ButtonStyle.Secondary },
        { id: `play_playlist_${playlistName}_${userId}`, label: 'Play Now', emoji: ICONS.play, style: ButtonStyle.Success },
        { id: `view_playlist_${playlistName}_${userId}`, label: 'View All', emoji: ICONS.playlist, style: ButtonStyle.Primary }
      ]);

      return ctx.editOrReply({ embeds: [embed], components: [buttons] });
    } catch (error) {
      console.error("Add track error:", error);
      return ctx.editOrReply({
        embeds: [createEmbed('error', 'Add Failed', `Could not add track: ${(error as Error).message}`)]
      });
    }
  }
}
