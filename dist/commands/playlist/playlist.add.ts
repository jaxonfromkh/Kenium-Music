import { type CommandContext, Declare, SubCommand, Options, createStringOption } from "seyfert";
import { Embed, ActionRow, Button, AttachmentBuilder } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";

// Modern Emoji Set
const ICONS = {
  music: '🎵',
  play: '▶️',
  add: '➕',
  playlist: '🎧',
  artist: '🎤',
  source: '📡',
  tracks: '💿',
  duration: '⏱️',
  youtube: '🎥',
  spotify: '🟢',
  soundcloud: '🟠'
};

// Modern Black Theme Colors
const COLORS = {
  primary: '#000000',
  success: '#000000',
  error: '#000000',
  warning: '#000000',
  info: '#000000'
};

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

function createEmbed(type: string, title: string, description: string | null = null, fields: Array<{ name: string; value: string; inline?: boolean }> = []) {
  const colors = {
    default: COLORS.primary,
    success: COLORS.success,
    error: COLORS.error,
    warning: COLORS.warning,
    info: COLORS.info
  };

  const icons = {
    default: ICONS.music,
    success: '✨',
    error: '❌',
    warning: '⚠️',
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

function determineSource(uri: string): string {
  if (!uri) return '❓ Unknown';
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return `${ICONS.youtube} YouTube`;
  if (uri.includes('spotify.com')) return `${ICONS.spotify} Spotify`;
  if (uri.includes('soundcloud.com')) return `${ICONS.soundcloud} SoundCloud`;
  return '🎵 Music';
}

function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

@Declare({
  name: "add",
  description: "➕ Add tracks to playlist"
})
@Options({
  playlist: createStringOption({ description: "Playlist name", required: true,
    autocomplete: async (interaction: any) => {
      const userId = interaction.user.id;
      const options = playlistsCollection.find({ userId }).map((playlist: any) => ({ name: playlist.name, value: playlist.name }));
      if(options.length === 0) options.push({ name: 'No Playlists', value: 'No Playlists' });
      return interaction.respond(options);
    }
   }),
  tracks: createStringOption({ description: "Tracks to add", required: true,
    autocomplete: async (interaction: any) => {
      const userId = interaction.user.id;
      const query = interaction.getInput().toLowerCase();

      const res = await interaction.client.aqua.resolve({ query, requester: interaction.author });
      const options = res.tracks.map((track: any, index: number) => ({ name: `${index + 1}. ${track.title.substring(0, 99)}`, value: track.uri }));
      if(options.length === 0) options.push({ name: 'No Tracks', value: 'No Tracks' });
      return interaction.respond(options);
    }
   })
})


export class AddCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist } = ctx.options as {playlist: string};
    const { tracks } = ctx.options as {tracks: string};

    const playlistName = playlist;
    const trackQuery = tracks;
    const userId = ctx.author.id;

    const playlistDb = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlistDb) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
        flags: 64
      });
    }

    if (playlistDb.tracks.length >= 100) {
      return await ctx.write({
        embeds: [createEmbed('warning', 'Playlist Full', 'This playlist has reached the 100-track limit!')],
        flags: 64
      });
    }

    await ctx.deferReply(true);

    try {
      const res = await ctx.client.aqua.resolve({ query: trackQuery, requester: ctx.author });

      if (res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") {
        const errorMsg = res.loadType === "LOAD_FAILED"
          ? `Failed to load: ${res.exception?.message || "Unknown error"}`
          : `No results found for "${trackQuery}"`;

        return await ctx.editOrReply({
          embeds: [createEmbed('error', 'Track Load Failed', errorMsg)]
        });
      }

      const remainingSlots = 100 - playlistDb.tracks.length;
      const tracksToAdd = res.tracks.slice(0, remainingSlots);
      let addedCount = 0;

      for (const track of tracksToAdd) {
        const exists = playlistDb.tracks.some(t => t.uri === track.info.uri);
        if (!exists) {
          playlistDb.tracks.push({
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

      playlistDb.lastModified = new Date().toISOString();
      playlistDb.totalDuration = playlistDb.tracks.reduce((sum: number, track: any) => sum + track.duration, 0);
      playlistsCollection.update({ _id: playlistDb._id }, playlistDb);

      const primaryTrack = tracksToAdd[0];
      const embed = createEmbed('success', 'Tracks Added', null, [
        { name: `${ICONS.music} Track`, value: `**${primaryTrack.info.title}**`, inline: false },
        { name: `${ICONS.artist} Artist`, value: primaryTrack.info.author || 'Unknown', inline: true },
        { name: `${ICONS.source} Source`, value: determineSource(primaryTrack.info.uri), inline: true },
        { name: `${ICONS.tracks} Added`, value: `${addedCount} track${addedCount !== 1 ? 's' : ''}`, inline: true },
        { name: `${ICONS.playlist} Total`, value: `${playlistDb.tracks.length} tracks`, inline: true },
        { name: `${ICONS.duration} Duration`, value: formatDuration(playlistDb.totalDuration), inline: true }
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

      await ctx.editOrReply({ embeds: [embed], components: [buttons] });
    } catch (error) {
      console.error("Add track error:", error);
      await ctx.editOrReply({
        embeds: [createEmbed('error', 'Add Failed', `Could not add track: ${(error as Error).message}`)]
      });
    }
  }
}