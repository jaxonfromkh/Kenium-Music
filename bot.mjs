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

const nodes = [{
  host: "",
  password: "",
  port: 433,
  secure: false,
  name: "idk"
}];

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


// Format time into MM:SS format
const formatTime = (time) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

// Create a track embed with enhanced UI
const createTrackEmbed = (player, track) => {
  return new EmbedBuilder()
    .setColor(0x000000) // Changed color for better visibility
    .setDescription(`> [\`${track.info.title}\`](${track.info.uri})`)
    .addFields(
      { name: "> ⏱️ Duration", value: `> \`${formatTime(Math.round(track.info.length / 1000))}\``, inline: true },
      { name: "> 👤 Author", value: `> \`${track.info.author}\``, inline: true },
      { name: "> 💿 Album", value: `> \`${track.info.album || 'N/A'}\``, inline: true },
      { name: "> 🔊 Volume", value: `> \`${player.volume}%\``, inline: true },
      { name: "> 🔁 Loop", value: `> ${player.loop ? 'On' : 'Off'}`, inline: true }
    )
    .setThumbnail(track.info.artworkUrl)
    .setAuthor({ name: "Kenium v2.4.0 | by mushroom0162", iconURL: client.user.avatarURL() })
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
    }
    player.nowPlayingMessage = null;
  }
});

aqua.on('trackError', async (player, track, payload) => {
  console.error(`Error ${payload} / ${payload}`);
  const channel = client.channels.cache.get(player.textChannel);
  if (channel && player.nowPlayingMessage) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Error Playing Track")
      .setDescription(`Error playing track: \`${track.info.title}\`\nMessage: \`${payload.exception.message}\``)
      .setFooter({ text: "Kenium v2.4.0 | by mushroom0162" })
      .setTimestamp();
    
    const message = await channel.send({ embeds: [embed] });
    setTimeout(() => message.delete().catch(console.error), 5000);
  }
});

client.aqua = aqua;
// Update the voice state
client.on("raw", (d) => {
  if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
  client.aqua.updateVoiceState(d);
});

// Node connection events
client.aqua.on('nodeConnect', (node) => {
  console.log(`Node "${node.name}" connected.`);
});

client.aqua.on('nodeError', (node, error) => {
  console.error(`Node "${node.name}" encountered an error: ${error.message}.`);
});

// Collections for commands and events
client.slashCommands = new Collection();
client.events = new Collection();
client.buttonCommands = new Collection();
client.selectMenus = new Collection();

// Load handlers
await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => CommandHandler(client, rootPath)),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => EventHandler(client, rootPath)),
  import("./src/handlers/Button.mjs").then(({ ButtonHandler }) => ButtonHandler(client, rootPath)),
]);

client.login(token);
