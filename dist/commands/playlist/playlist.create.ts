import { type CommandContext, Declare, SubCommand, Options, createStringOption } from "seyfert";
import { Embed, ActionRow, Button } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";

// Modern Emoji Set
const ICONS = {
  music: '🎵',
  playlist: '🎧',
  add: '➕',
  tracks: '💿',
  info: 'ℹ️',
  star: '⭐'
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

@Declare({
  name: "create",
  description: "🎧 Create a new playlist"
})
@Options({
  name: createStringOption({ description: "Playlist name", required: true }),
})
export class CreateCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const {name} = ctx.options as { name: string };
    const userId = ctx.author.id;

    if (name.length > 50) {
       return await ctx.write({
            embeds: [createEmbed('error', 'Invalid Name', `Playlist name must be less than 50 characters.`)],
            flags: 64
        });
    }

    const existingPlaylists = playlistsCollection.find({ userId });
    if (existingPlaylists.length >= 6) {
        return await ctx.write({
            embeds: [createEmbed('error', 'Playlist Limit Reached', `You can only have a maximum of 6 playlists.`)],
            flags: 64
        });
    }

    const existing = playlistsCollection.findOne({ userId, name });
    if (existing) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Playlist Exists', `A playlist named "${name}" already exists!`)],
        flags: 64
      });
    }

    const playlist = {
      userId,
      name,
      tracks: [],
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      playCount: 0,
      totalDuration: 0
    };

    playlistsCollection.insert(playlist);

    const embed = createEmbed('success', 'Playlist Created', null, [
      { name: `${ICONS.playlist} Name`, value: `**${name}**`, inline: true },
      { name: `${ICONS.star} Status`, value: 'Ready for tracks!', inline: true }
    ]);

    const buttons = createModernButtons([
      { id: `add_track_${name}_${userId}`, label: 'Add Tracks', emoji: ICONS.add, style: ButtonStyle.Success },
      { id: `view_playlist_${name}_${userId}`, label: 'View Playlist', emoji: ICONS.playlist, style: ButtonStyle.Primary }
    ]);

    await ctx.write({ embeds: [embed], components: [buttons], flags: 64 });
  }
}
