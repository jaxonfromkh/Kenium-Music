import { type CommandContext, Declare, SubCommand, Options, createStringOption, createBooleanOption, Middlewares } from "seyfert";
import { CooldownType, Cooldown } from "@slipher/cooldown";
import { SimpleDB } from "../../utils/simpleDB";
import { createEmbed, formatDuration, handlePlaylistAutocomplete, shuffleArray } from "../../shared/utils";
import { ICONS } from "../../shared/constants";

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

@Declare({
  name: "play",
  description: "▶️ Play a playlist"
})
@Options({
  playlist: createStringOption({
    description: "Playlist name",
    required: true,
    autocomplete: async (interaction: any) => {
      return handlePlaylistAutocomplete(interaction, playlistsCollection);
    }
  }),
  shuffle: createBooleanOption({ description: "Shuffle the playlist", required: false })
})
@Cooldown({
    type: CooldownType.User,
    interval: 20000, // 20 seconds
    uses: {
        default: 2
    },
})

@Middlewares(["checkVoice", "cooldown"])
export class PlayCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const { playlist: playlistName, shuffle = false } = ctx.options as { playlist: string; shuffle: boolean };
    const userId = ctx.author.id;

    const playlistDb = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlistDb || playlistDb.tracks.length === 0) {
      const message = !playlistDb 
        ? `No playlist named "${playlistName}" exists!`
        : 'This playlist has no tracks to play!';
      
      return ctx.write({
        embeds: [createEmbed('error', !playlistDb ? 'Playlist Not Found' : 'Empty Playlist', message)],
        flags: 64
      });
    }

    const member = ctx.member;
    const voiceChannel = await member?.voice();

    await ctx.deferReply(true);

    try {
      const player = ctx.client.aqua.createConnection({
        guildId: ctx.guildId!,
        voiceChannel: voiceChannel.channelId,
        textChannel: ctx.channelId!,
        defaultVolume: 65,
        deaf: true
      });

      const tracksToPlay = shuffle ? shuffleArray(playlistDb.tracks) : [...playlistDb.tracks];

      // Batch load tracks with Promise.allSettled for better error handling
      const loadResults = await Promise.allSettled(
        tracksToPlay.map(async (track: any) => {
          const res = await ctx.client.aqua.resolve({ query: track.uri, requester: ctx.author });
          if (res.loadType !== "LOAD_FAILED" && res.tracks?.length) {
            return res.tracks[0];
          }
          throw new Error(`Failed to load: ${track.title}`);
        })
      );

      const loadedTracks = loadResults
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);

      if (loadedTracks.length === 0) {
        return ctx.editOrReply({
          embeds: [createEmbed('error', 'Load Failed', 'Could not load any tracks from this playlist')]
        });
      }

      // Add all tracks at once
      for (const track of loadedTracks) {
        player.queue.add(track);
      }

      // Update play count
      playlistsCollection.update(
        { _id: playlistDb._id },
        { ...playlistDb, playCount: (playlistDb.playCount || 0) + 1 }
      );

      if (!player.playing && !player.paused && player.queue.size) {
        player.play();
      }

      const embed = createEmbed('success', shuffle ? 'Shuffling Playlist' : 'Playing Playlist', undefined, [
        { name: `${ICONS.playlist} Playlist`, value: `**${playlistName}**`, inline: true },
        { name: `${ICONS.tracks} Loaded`, value: `${loadedTracks.length}/${playlistDb.tracks.length} tracks`, inline: true },
        { name: `${ICONS.duration} Duration`, value: formatDuration(playlistDb.totalDuration), inline: true },
        { name: `${ICONS.volume} Channel`, value: voiceChannel.channel.name, inline: true },
        { name: `${ICONS.shuffle} Mode`, value: shuffle ? 'Shuffled' : 'Sequential', inline: true }
      ]);

      return ctx.editOrReply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error("Play playlist error:", error);
      return ctx.editOrReply({
        embeds: [createEmbed('error', 'Play Failed', `Could not play playlist: ${(error as Error).message}`)]
      });
    }
  }
}
