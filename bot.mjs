import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  GatewayDispatchEvents
} from "discord.js";
import { token } from "./config.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const nodes = [
  {
      host: "127.0.0.1",
      password: "",
      port: 344  ,
      secure: false,
      name: "Thorium"
  }
];

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ["CHANNEL"],
});

const aqua = new Aqua(client, nodes, {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytsearch",
  restVersion: "v4",
  shouldDeleteMessage: true
});

const formatTime = (time) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

const createTrackEmbed = (player, track) => {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("🎶 Now Playing")
    .setDescription(`
        **Title:** [\`${track.info.title}\`](${track.info.uri})
        **Duration:** \`${formatTime(Math.round(track.info.length / 1000))}\`
        **Author:** \`${track.info.author}\`
      `)
    .setThumbnail(track.info.artworkUrl)
    .addFields(
      { name: "Volume", value: `${player.volume}%`, inline: true },
      { name: "Album", value: `${track.info.album || 'N/A'}`, inline: true }
    )
    .setFooter({ text: "🎵 Toddys Music v2.3.0 | by mushroom0162" })
    .setTimestamp();
};

// Event listeners
aqua.on('trackStart', async (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      player.nowPlayingMessage = await channel.send({ embeds: [createTrackEmbed(player, track)] });
    }
});

aqua.on('trackChange', async (player, newTrack) => {
  if (player.nowPlayingMessage && !player.shouldDeleteMessage) {
    await player.nowPlayingMessage.edit({ embeds: [createTrackEmbed(player, newTrack)] });
  }
});

aqua.on('trackEnd', async (player) => {
  if (player.nowPlayingMessage && !player.shouldDeleteMessage) {
    try {
      await player.nowPlayingMessage.delete();
    } catch (error) {
      if (error.code !== 10008) {
        console.error('Error deleting now playing message:', error);
      }
    } finally {
      player.nowPlayingMessage = null; // Clear reference to allow garbage collection
    }
  }
});

aqua.on('trackError', async (player, track, payload) => {
  console.log(`Error ${payload.exception.cause} / ${payload.exception.message}`);
  if (player.nowPlayingMessage) {
    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Error playing track")
        .setDescription(`Error playing track: \`${track.title}\`, Message: \`${payload.exception.message}\``)
        .setFooter({ text: "Toddys Music v2.3.0 | by mushroom0162" })
        .setTimestamp();
      const message = await channel.send({ embeds: [embed] });
      setTimeout(() => message.delete().catch(console.error), 5000);
    }
  }
});

client.aqua = aqua;

client.on("raw", (d) => {
  if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
  client.aqua.updateVoiceState(d);
});

client.aqua.on('nodeConnect', (node) => {
  console.log(`Node "${node.name}" connected.`);
});

client.aqua.on('nodeError', (node, error) => {
  console.log(`Node "${node.name}" encountered an error: ${error.message}.`);
});

client.slashCommands = new Collection();
client.events = new Collection();
client.buttonCommands = new Collection();
client.selectMenus = new Collection();

await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => CommandHandler(client, rootPath)),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => EventHandler(client, rootPath)),
  import("./src/handlers/Button.mjs").then(({ ButtonHandler }) => ButtonHandler(client, rootPath)),
]);

client.login(token);