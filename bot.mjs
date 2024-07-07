import { Client, GatewayIntentBits, Collection, EmbedBuilder } from "discord.js";
import { token } from "./config.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DisTube, isVoiceChannelEmpty, RepeatMode } from "distube";
import { YouTubePlugin } from "@distube/youtube";
import { DirectLinkPlugin } from "@distube/direct-link";
import { SoundCloudPlugin } from "@distube/soundcloud";
import { FilePlugin } from "@distube/file";

// import { ClusterManager,ClusterClient, getInfo } from "discord-hybrid-sharding";

// import fs from "node:fs";

// ===============================================

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

// ===============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // Only for bots with message content intent access.
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ],
  partials: ["CHANNEL"],
});

// const manager = new ClusterManager("bot.mjs", {
// totalShards: "auto",
// mode: "process",
// shardsPerClusters: 1,
// token: token,
// });

// ===============================================

  client.slashCommands= new Collection(),
  client.events = new Collection(),
  client.buttonCommands = new Collection(),
  client.selectMenus = new Collection()
// client.cluster = new ClusterClient(client)

// ===============================================
const distube = new DisTube(client, {
  nsfw: true,
  emitAddSongWhenCreatingQueue: false,
  emitAddListWhenCreatingQueue: false,
  savePreviousSongs: false,
  plugins: [
    new YouTubePlugin({
      // cookies: JSON.parse(fs.readFileSync("./cookies.json")),
    }),
    new DirectLinkPlugin(),
    new SoundCloudPlugin(),
    new FilePlugin(),
  ],
});
client.FilePlugin = new FilePlugin();
client.SoundCloudPlugin = new SoundCloudPlugin();
client.youtubeStuff = new YouTubePlugin({
 //  cookies: JSON.parse(fs.readFileSync("./cookies.json")),
});
client.distube = distube;

// ===============================================
client.distube
  .on("initQueue", (queue) => {
    queue.autoplay = false;
    queue.volume = 100;
  })
  // ===============================================
  .on("playSong", async (queue, song) => {
    const platform = song.source === "youtube"
      ? "Youtube"
      : song.source === "soundcloud"
      ? "SoundCloud"
      : "File";

    const embed = new EmbedBuilder()
      .setFooter({ text: "Toddys Music Bot" })
      .setColor("Blue")
      .setTimestamp(Date.now())
      .setDescription(
        `- ▶️ | Playing \`${song.name}\`\n - ⏰ | Duration:\`${song.formattedDuration}\` \n - 👤 | Uploader: \`${song.uploader.name}\` \n - 📊 | Views: \`${song.views}\`\n-  🖥️ | Plataform: \`${platform}\``
      )
      .setAuthor({
        name: `${song.user.username}  • 🎵 | Music`,
        iconURL: song.user.displayAvatarURL(),
      })
      .setThumbnail(song.thumbnail);

    await queue.textChannel.send({ embeds: [embed] });
  });

client.distube.on("finishSong", async (queue, song) => {
  if (
    queue.songs.length > 1 ||
    queue.repeatMode === RepeatMode.SONG ||
    queue.repeatMode === RepeatMode.QUEUE
  ) {
    return;
  } else {
    const vc = queue.voiceChannel;
    if (!vc) {
      return;
    }
 
    const embed = new EmbedBuilder()
      .setFooter({ text: "Toddys Music Bot" })
      .setColor("Blue")
      .setTimestamp(Date.now())
      .setDescription(
        `⏭ | Finished \`${song.name}\` - \`${song.formattedDuration}\``
      )
      .setThumbnail(song.thumbnail);
    await queue.textChannel.send({ embeds: [embed] });

   await client.distube.voices.leave(queue.voiceChannel);
}});

client.on("voiceStateUpdate", async (oldState) => {
  if (!oldState?.channel) return;
  const voice = client.distube.voices.get(oldState);
  if (voice && isVoiceChannelEmpty(oldState)) {
    voice.leave();
  }
});

// ===============================================
await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => CommandHandler(client, rootPath)),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => EventHandler(client, rootPath)),
  import("./src/handlers/Button.mjs").then(({ ButtonHandler }) => ButtonHandler(client, rootPath)),
]);

// manager.on('shardCreate', shard => console.log(`Launched Shard ${shard.id}`));
// manager.on('clusterCreate', cluster => console.log(`Launched Cluster ${cluster.id}`));
// manager.spawn({ timeout: -1 });

await client.login(token);
