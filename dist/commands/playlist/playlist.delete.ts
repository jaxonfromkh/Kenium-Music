import { type CommandContext, Declare, SubCommand, Options, createStringOption } from "seyfert";
import { Embed } from "seyfert";
import { SimpleDB } from "../../utils/simpleDB";

// Modern Emoji Set
const ICONS = {
  music: '🎵',
  tracks: '💿',
  delete: '🗑️'
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

@Declare({
  name: "delete",
  description: "🗑️ Delete a playlist"
})
@Options({
  name: createStringOption({ description: "Playlist name", required: true, 
    autocomplete: async (interaction: any) => {      
      const userId = interaction.user.id;
      const playlists = playlistsCollection.find({ userId });
      const options = playlists.map(playlist => ({ name: playlist.name, value: playlist.name }));
      if(options.length === 0) options.push({ name: 'No Playlists', value: 'No Playlists' });
      return interaction.respond(options);
    }
   })
})
export class DeleteCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { name } = ctx.options as { name: string };
    const playlistName = name;
    const userId = ctx.author.id;

    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
        flags: 64
      });
    }

    playlistsCollection.delete({ userId, name: playlistName });

    const embed = createEmbed('success', 'Playlist Deleted', `Successfully deleted playlist "${playlistName}"`);

    await ctx.write({ embeds: [embed], flags: 64 });
  }
}
