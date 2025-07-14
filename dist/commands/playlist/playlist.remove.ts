import { type CommandContext, Declare, SubCommand, Options, createStringOption, createIntegerOption } from "seyfert";
import { Embed } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";

// Modern Emoji Set
const ICONS = {
  music: '🎵',
  remove: '➖',
  artist: '🎤',
  source: '📡',
  tracks: '💿',
  youtube: '🎥',
  spotify: '🟢',
  soundcloud: '🟠'
};

// Modern Black Theme Colors
const COLORS = {
  primary: '#000000',
  success: '#000000',
  error: '#000000'
};

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

function createEmbed(type: string, title: string, description: string | null = null, fields: Array<{ name: string; value: string; inline?: boolean }> = []) {
  const colors = {
    default: COLORS.primary,
    success: COLORS.success,
    error: COLORS.error
  };

  const icons = {
    default: ICONS.music,
    success: '✨',
    error: '❌'
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

function determineSource(uri: string): string {
  if (!uri) return '❓ Unknown';
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return `${ICONS.youtube} YouTube`;
  if (uri.includes('spotify.com')) return `${ICONS.spotify} Spotify`;
  if (uri.includes('soundcloud.com')) return `${ICONS.soundcloud} SoundCloud`;
  return '🎵 Music';
}

@Declare({
  name: "remove",
  description: "➖ Remove a track from a playlist"
})
@Options({
  playlist: createStringOption({ description: "Playlist name", required: true, 
    autocomplete: async(interaction: any) => {
      const userId = interaction.user.id;
      const playlists = playlistsCollection.find({ userId });
      const playlistsss = playlists.map((playlist: any) => ({ name: playlist.name, value: playlist.name }));
      if(playlistsss.length === 0) playlistsss.push({ name: 'No Playlists', value: 'No Playlists' });
      return interaction.respond(playlistsss);
    }
   }),
  index: createIntegerOption({ description: "Track number to remove", required: true, min_value: 1, max_value: 1, 
    autocomplete: async(interaction: any) => {
      const userId = interaction.user.id;
      const playlistName = interaction.options.getString('playlist');
      const playlist = playlistsCollection.findOne({ userId, name: playlistName });
      const options = playlist.tracks.map((track: any, index: number) => ({ name: `${index + 1}. ${track.title}`, value: index + 1 }));
      if(options.length === 0) options.push({ name: 'No Tracks', value: 'No Tracks' });
      return interaction.respond(options);
    }
   })
})
export class RemoveCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist: playlistName } = ctx.options as { playlist: string };
    const {index} = ctx.options as { index: -1 };
    const userId = ctx.author.id;

    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
        flags: 64
      });
    }

    if (index < 0 || index >= playlist.tracks.length) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Invalid Index', `Track index must be between 1 and ${playlist.tracks.length}`)],
        flags: 64
      });
    }

    const removedTrack = playlist.tracks.splice(index - 1, 1)[0];
    playlist.lastModified = new Date().toISOString();
    playlist.totalDuration = playlist.tracks.reduce((sum: number, track: any) => sum + track.duration, 0);
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

    await ctx.write({ embeds: [embed], flags: 64 });
  }
}