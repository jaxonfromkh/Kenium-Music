import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
} from "discord.js";
import { token } from "./config.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DisTube, isVoiceChannelEmpty, RepeatMode } from "distube";
import { YouTubePlugin } from "@distube/youtube";
import { DirectLinkPlugin } from "@distube/direct-link";
import { CommandHandler } from "./src/handlers/Command.mjs";
import { EventHandler } from "./src/handlers/Events.mjs";
import { ButtonHandler } from "./src/handlers/Button.mjs";
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
  partials: [Partials.Channel],
});
// ===============================================
client.slashCommands = new Collection();
client.events = new Collection();
client.buttonCommands = new Collection();
client.selectMenus = new Collection();

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
  ],
});
client.youtubeStuff = new YouTubePlugin({
  // cookies: JSON.parse(fs.readFileSync("./cookies.json")),
});
client.distube = distube;
// ===============================================
const Response = new EmbedBuilder()
  .setFooter({ text: "Toddys Music Bot" })
  .setColor("Blue")
  .setTimestamp(Date.now());
// ===============================================
client.distube
  .on("initQueue", (queue) => {
    queue.autoplay = false;
    queue.volume = 100;
  })
  // ===============================================
  .on("playSong", (queue, song) =>
    queue.textChannel.send({
      embeds: [
        Response.setDescription(
          `▶️ | Playing \`${song.name}\`\n ⏰ | Duration:\`${song.formattedDuration}\` \n 👤 | Uploader: \`${song.uploader.name}\`
        `
        )
          .setAuthor({
            name: `${song.user.username}  • 🎵 | Music`,
            iconURL: song.user.displayAvatarURL(),
          })
          .setThumbnail(song.thumbnail),
      ],
    })
  );
// ===============================================
client.distube.on("finishSong", (queue, song) => {
  if (queue.songs.length > 1 || RepeatMode.SONG || RepeatMode.QUEUE) {
    return;
  } else {
    queue.textChannel.send({
      embeds: [
        Response.setDescription(
          `⏭ | Finished \`${song.name}\` - \`${song.formattedDuration}\`
          `
        ).setThumbnail(song.thumbnail),
      ],
    });
    client.distube.voices.leave(queue.voiceChannel);
  }
});

client.on("voiceStateUpdate", oldState => {
  if (!oldState?.channel) return;
  const voice = client.distube.voices.get(oldState);
  if (voice && isVoiceChannelEmpty(oldState)) {
    voice.leave();
  }
});

client.distube.on("empty", (queue) => {
  if (isVoiceChannelEmpty(queue.voiceChannel) === true) {
    client.distube.voices.leave(queue.voiceChannel);
  }
  queue.textChannel.send({
    embeds: [
      Response.setDescription(
        "⏹ | Empty Channel!, now leaving the voice channel."
      ),
    ],
  });
});
// ===============================================
// ===============================================
await CommandHandler(client, rootPath);
await EventHandler(client, rootPath);
await ButtonHandler(client, rootPath);
await client.login(token);
