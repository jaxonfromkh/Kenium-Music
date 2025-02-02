import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  GatewayDispatchEvents
} from "discord.js";
import { token, mongourl } from "./config.mjs";
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
  name: "toddy's"
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
  defaultSearchPlatform: "ytsearch",
  restVersion: "v4",
  shouldDeleteMessage: true,
  autoResume: false,
  infiniteReconnects: true,
  leaveOnEnd: true,
});


function formatTime(time) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function createTrackEmbed(player, track) {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setDescription(
      `**🎶 Now Playing**\n> [\`${track.info.title}\`](<${track.info.uri}>)`
    )
    .addFields(
      {
        name: "⏱️ **Duration**",
        value: `\`${formatTime(track.info.length / 1000)}\``,
        inline: true
      },
      {
        name: "👤 **Author**",
        value: `\`${track.info.author}\``,
        inline: true
      },
      {
        name: "💿 **Album**",
        value: `\`${track.info.album || "N/A"}\``,
        inline: true
      },
      {
        name: "🔊 **Volume**",
        value: `\`${player.volume}%\``,
        inline: true
      },
      {
        name: "🔁 **Loop**",
        value: `${player.loop ? "🔴 \`Off\`" : "🟢 \`On\`"}`,
        inline: true
      }
    )
    .setThumbnail(track.info.artworkUrl || client.user.displayAvatarURL())
    .setAuthor({
      name: "Kenium v2.7.0 • Powered by mushroom0162",
      iconURL: client.user.displayAvatarURL(),
    })
    .setFooter({
      text: "Kenium - Your Open Source Bot",
      iconURL: "https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png?ex=679ffdf7&is=679eac77&hm=1ad5956e1f69306e10731a9660a964b530f5be55c22e897c636f136fceb3cacf&"
    })
    .setTimestamp();
}

const channelCache = new Map();
const getChannelFromCache = (channelId) => {
  if (!channelCache.has(channelId)) {
    const channel = client.channels.cache.get(channelId);
    if (channel) channelCache.set(channelId, channel);
  }
  return channelCache.get(channelId);
};

let lastUpdate = 0;
async function updateVoiceChannelStatus(channelId, status) {
  const now = Date.now();
  if (now - lastUpdate < 30000) return;
  lastUpdate = now;
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/voice-status`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: status || 'Kenium 2.7.0' }),
      }
    );
    if (!response.ok) {
      console.error('Failed to update voice channel status:', response.statusText);
    }
  } catch (error) {
    console.error('Error updating voice channel status:', error);
  }
}

aqua.on('trackStart', async (player, track) => {
  const channel = getChannelFromCache(player.textChannel);
  if (channel) {
    const trackCount = player.queue.size;
    const status = trackCount > 2 ? `⭐ Playlist (${trackCount} tracks) - Kenium 2.7.0 ` : `⭐ ${track.info.title} - Kenium 2.7.0`;
    const updateStatusPromise = updateVoiceChannelStatus(player.voiceChannel, status);
    const nowPlayingPromise = channel.send({ embeds: [createTrackEmbed(player, track)] });
    player.nowPlayingMessage = await nowPlayingPromise;
    await updateStatusPromise;
  }
});

aqua.on('trackChange', async (player, newTrack) => {
  if (player.nowPlayingMessage && !player.shouldDeleteMessage) {
    await player.nowPlayingMessage.edit({ embeds: [createTrackEmbed(player, newTrack)] });
  }
});

aqua.on('trackEnd', async (player) => {
  if (player.queue.length === 0) {
    const channel = getChannelFromCache(player.textChannel);
    if (channel) {
      channelCache.delete(player.textChannel);
    }
  }
  player.nowPlayingMessage = null;
});

aqua.on('trackError', async (player, track, payload) => {
  console.error(`Error ${payload.exception.code} / ${payload.exception.message}`);
  const channel = getChannelFromCache(player.textChannel);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Error Playing Track")
      .setDescription(`Error playing track: \`${track.info.title}\`\nMessage: \`${payload.exception.message}\``)
      .setFooter({ text: "Kenium v2.7.0 | by mushroom0162" })
      .setTimestamp();
    try {
      const message = await channel.send({ embeds: [embed] });
      setTimeout(() => message.delete().catch(console.error), 5000);
    } catch (error) {
      console.error('Error sending error message:', error);
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
  console.error(`Node "${node.name}" encountered an error: ${error.message}.`);
});

client.slashCommands = new Collection();
client.events = new Collection();
client.selectMenus = new Collection();
await import("./src/handlers/Command.mjs").then(({ CommandHandler }) => CommandHandler(client, rootPath));
await import("./src/handlers/Events.mjs").then(({ EventHandler }) => EventHandler(client, rootPath));
client.login(token);
