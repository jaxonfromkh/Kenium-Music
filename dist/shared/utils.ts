import { Embed, ActionRow, Button } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { ICONS, COLORS } from "./constants";

// Optimized regex patterns (compiled once)
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
const SOURCE_PATTERNS = {
  youtube: /youtube\.com|youtu\.be/,
  spotify: /spotify\.com/,
  soundcloud: /soundcloud\.com/
};

export function createEmbed(
  type: keyof typeof COLORS,
  title: string,
  description?: string,
  fields: Array<{ name: string; value: string; inline?: boolean }> = []
) {
  const iconMap = {
    primary: ICONS.music,
    success: '✨',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const embed = new Embed()
    .setColor(COLORS[type])
    .setTitle(`${iconMap[type]} ${title}`)
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

export function createButtons(configs: Array<{
  id: string;
  label: string;
  emoji?: string;
  style?: ButtonStyle;
  disabled?: boolean;
}>) {
  const row = new ActionRow();
  configs.forEach(config => {
    const button = new Button()
      .setCustomId(config.id)
      .setLabel(config.label)
      .setStyle(config.style ?? ButtonStyle.Secondary);

    if (config.emoji) button.setEmoji(config.emoji);
    if (config.disabled) button.setDisabled(true);

    row.addComponents(button);
  });
  return row;
}

export function formatDuration(ms: number): string {
  if (!ms) return '00:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function determineSource(uri: string): string {
  if (!uri) return '❓ Unknown';
  
  if (SOURCE_PATTERNS.youtube.test(uri)) return `${ICONS.youtube} YouTube`;
  if (SOURCE_PATTERNS.spotify.test(uri)) return `${ICONS.spotify} Spotify`;
  if (SOURCE_PATTERNS.soundcloud.test(uri)) return `${ICONS.soundcloud} SoundCloud`;
  
  return '🎵 Music';
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = YOUTUBE_REGEX.exec(url);
  return match?.[1] ?? null;
}

export async function handlePlaylistAutocomplete(interaction: any, playlistsCollection: any) {
  const userId = interaction.user.id;
  const playlists = playlistsCollection.find({ userId });
  const options = playlists.length > 0
    ? playlists.map((p: any) => ({ name: p.name, value: p.name }))
    : [{ name: 'No Playlists', value: 'No Playlists' }];
  
  return interaction.respond(options);
}

export async function handleTrackAutocomplete(interaction: any) {
  try {
    const query = interaction.getInput().toLowerCase();
    if (!query.trim()) {
      return interaction.respond([{ name: 'Start typing to search...', value: 'empty' }]);
    }

    const res = await interaction.client.aqua.resolve({ query, requester: interaction.author });

    const options = res.tracks?.length > 0
      ? res.tracks.slice(0, 25).map((track: any) => ({
          name: track.title.substring(0, 100),
          value: track.uri
        }))
      : [{ name: 'No Tracks Found', value: 'no_tracks' }];
    
    return interaction.respond(options);
  } catch (error) {
    return interaction.respond([{ name: 'Search Error', value: 'search_error' }]);
  }
}

export async function handleTrackIndexAutocomplete(interaction: any, playlistsCollection: any) {
  const userId = interaction.user.id;
  const playlistName = interaction.options.getString('playlist');
  
  if (!playlistName) {
    return interaction.respond([{ name: 'Select playlist first', value: '0' }]);
  }

  const playlist = playlistsCollection.findOne({ userId, name: playlistName });
  if (!playlist || !playlist.tracks.length) {
    return interaction.respond([{ name: 'No Tracks', value: '0' }]);
  }

  const options = playlist.tracks.slice(0, 25).map((track: any, index: number) => ({
    name: `${index + 1}. ${track.title.substring(0, 80)}`,
    value: (index + 1).toString()
  }));

  return interaction.respond(options);
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}