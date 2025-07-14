import { type CommandContext, Declare, SubCommand, Options, createStringOption, createBooleanOption, Middlewares } from "seyfert";
import { Embed, ActionRow, Button } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { SimpleDB } from "../../utils/simpleDB";

// Modern Emoji Set
const ICONS = {
  music: '🎵',
  playlist: '🎧',
  play: '▶️',
  shuffle: '🔀',
  tracks: '💿',
  duration: '⏱️',
  volume: '🔊'
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

@Declare({
  name: "play",
  description: "▶️ Play a playlist"
})
@Options({
  playlist: createStringOption({ description: "Playlist name", required: true,
    autocomplete: async (interaction: any) => {
      const userId = interaction.user.id;
      const playlists = playlistsCollection.find({ userId });
      const playlistsss = playlists.map((playlist: any) => ({ name: playlist.name, value: playlist.name }));
      if(playlistsss.length === 0) playlistsss.push({ name: 'No Playlists', value: 'No Playlists' });
      return interaction.respond(playlistsss);
    }
   }),
  shuffle: createBooleanOption({ description: "Shuffle the playlist", required: false })
})
@Middlewares(["checkVoice"])
export class PlayCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist } = ctx.options as {playlist: string};
    const shuffle = ctx.options as { shuffle: boolean } || false;
    const userId = ctx.author.id;

    const playlistName = playlist;

    if (!playlistName) {
      return await ctx.write({
        embeds: [createEmbed('error', 'No Playlist Selected', 'You must specify a playlist to play.')],
        flags: 64
      });
    }

    const playlistDb = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlistDb) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Playlist Not Found', `No playlist named "${playlistName}" exists!`)],
        flags: 64
      });
    }

    if (playlistDb.tracks.length === 0) {
      return await ctx.write({
        embeds: [createEmbed('error', 'Empty Playlist', 'This playlist has no tracks to play!')],
        flags: 64
      });
    }

    const member = ctx?.member
    const voiceChannel = (await member?.voice());

    await ctx.deferReply();

    try {
      const player = ctx.client.aqua.createConnection({
        guildId: ctx.guildId!,
        voiceChannel: voiceChannel.channelId,
        textChannel: ctx.channelId!,
        defaultVolume: 65,
        deaf: true
      });

      let tracksToPlay = [...playlistDb.tracks];
      if (shuffle) {
        for (let i = tracksToPlay.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
        }
      }

      let loadedCount = 0;
      const loadPromises = tracksToPlay.map(async (track: any) => {
        try {
          const res = await ctx.client.aqua.resolve({ query: track.uri, requester: ctx.author });
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
        return await ctx.editOrReply({
          embeds: [createEmbed('error', 'Load Failed', 'Could not load any tracks from this playlist')]
        });
      }

      playlistDb.playCount = (playlistDb.playCount || 0) + 1;
      playlistsCollection.update({ _id: playlistDb._id }, playlistDb);

      if (!player.playing && !player.paused && player.queue.size) {
        player.play();
      }



      const embed = createEmbed('success', shuffle ? 'Shuffling Playlist' : 'Playing Playlist', null, [
        { name: `${ICONS.playlist} Playlist`, value: `**${playlistName}**`, inline: true },
        { name: `${ICONS.tracks} Loaded`, value: `${loadedCount}/${playlistDb.tracks.length} tracks`, inline: true },
        { name: `${ICONS.duration} Duration`, value: formatDuration(playlistDb.totalDuration), inline: true },
        { name: `${ICONS.volume} Channel`, value: voiceChannel.channel.name, inline: true },
        { name: `${ICONS.shuffle} Mode`, value: shuffle ? 'Shuffled' : 'Sequential', inline: true }
      ]);

      await ctx.editOrReply({ embeds: [embed] });
    } catch (error) {
      console.error("Play playlist error:", error);
      await ctx.editOrReply({
        embeds: [createEmbed('error', 'Play Failed', `Could not play playlist: ${(error as Error).message}`)]
      });
    }
  }
}