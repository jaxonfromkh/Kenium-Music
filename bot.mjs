
import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, GatewayDispatchEvents } from "discord.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const token = process.env.token;
const NODE_HOST = process.env.NODE_HOST;
const NODE_PASSWORD = process.env.NODE_PASSWORD; 
const NODE_PORT = process.env.NODE_PORT;
const NODE_NAME = process.env.NODE_NAME;

const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const UPDATE_INTERVAL = 30000;
const ERROR_MESSAGE_DURATION = 5000;
const ERROR_COLOR = 0xff0000;

const nodes = [
  {
    host: NODE_HOST,
    password: NODE_PASSWORD,
    port: NODE_PORT,
    secure: false,
    name: NODE_NAME,
  }
];


const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

class TimeFormatter {
  static format(ms) {
    const sec = Math.floor(ms / 1000);
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

class ChannelManager {
  static cache = new Map();
  static updateTimestamps = new Map();

  static getChannel(client, channelId) {
    if (this.cache.has(channelId)) return this.cache.get(channelId);
    const channel = client.channels.cache.get(channelId);
    if (channel) this.cache.set(channelId, channel);
    return channel;
  }

  static async updateVoiceStatus(channelId, status, botToken) {
    const now = Date.now();
    const last = this.updateTimestamps.get(channelId) || 0;
    if (now - last < UPDATE_INTERVAL) return;
    this.updateTimestamps.set(channelId, now);
    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/voice-status`, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        console.error(`Voice status update failed: ${response.statusText}`);
      }
    } catch (e) {
      console.error("Voice status update error:", e);
    }
  }

  static clearCaches() {
    this.cache.clear();
    this.updateTimestamps.clear();
  }
}

class EmbedFactory {
  static createTrackEmbed(client, player, track) {
    const progressBar = this.createProgressBar(track.info.length, player.position);
    const quality = track.info.isStream ? '🔴 LIVE' : '320kbps';
    return new EmbedBuilder()
      .setColor('#0A0A0A')
      .setAuthor({
        name: '🎵  Kenium 2.8.0',
        iconURL: client.user.displayAvatarURL(),
        url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
      })
      .setDescription(
        `### [\`${track.info.title}\`](<${track.info.uri}>)\n` +
        `> by **${track.info.author}** • ${track.info.album || 'Single'} • ${quality}\n\n` +
        `\`${TimeFormatter.format(player.position)}\` ${progressBar} \`${TimeFormatter.format(track.info.length)}\`\n\n` +
        `${player.volume > 50 ? '🔊' : '🔈'} \`${player.volume}%\` • ${player.loop === 'track' ? '🔂 Track Loop' : player.loop === 'queue' ? '🔁 Queue Loop' : '▶️ No Loop'} • 👤 <@${track.requester.id}>`
      )
      .setThumbnail(track.info.artworkUrl || client.user.displayAvatarURL())
      .setFooter({
        text: 'An Open Source Bot',
        iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
      });
  }

  static createProgressBar(total, current, length = 12) {
    const progress = Math.round((current / total) * length);
    return '━'.repeat(progress) + (current > 0 ? '⚪' : '⭕') + '─'.repeat(length - progress);
  }

  static createErrorEmbed(track, payload) {
    return new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle("❌ Error Playing Track")
      .setDescription(
        `**Error:** \`${track.info.title}\`\n**Message:** \`${payload.exception?.message}\``
      )
      .setFooter({ text: "Kenium v2.8.0 | by mushroom0162" })
      .setTimestamp();
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: ["CHANNEL"]
});

const aqua = new Aqua(client, nodes, {
  defaultSearchPlatform: "ytsearch",
  restVersion: "v4",
  shouldDeleteMessage: true,
  autoResume: false,
  infiniteReconnects: true,
});

aqua.on("trackStart", async (player, track) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const trackCount = player.queue.size;
    const status = trackCount > 2
      ? `⭐ Playlist (${trackCount} tracks) - Kenium 2.8.0`
      : `⭐ ${track.info.title} - Kenium 2.8.0`;
    const nowPlayingMessage = await channel.send({
      embeds: [EmbedFactory.createTrackEmbed(client, player, track)]
    });
    player.nowPlayingMessage = nowPlayingMessage;
    ChannelManager.updateVoiceStatus(player.voiceChannel, status, token);
  } catch (error) {
    console.error("Track start error:", error);
  }
});

aqua.on("trackChange", async (player, newTrack) => {
  if (!player.nowPlayingMessage || player.shouldDeleteMessage) return;
  try {
    await player.nowPlayingMessage.edit({
      embeds: [EmbedFactory.createTrackEmbed(client, player, newTrack)]
    });
  } catch (error) {
    console.error("Track change error:", error);
  }
});

aqua.on("trackEnd", (player) => {
  if (player.queue.length === 0) ChannelManager.clearCaches();
  player.nowPlayingMessage = null;
});

aqua.on("trackError", async (player, track, payload) => {
  console.error(`Error ${payload.exception.code} / ${payload.exception.message}`);
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const errorMessage = await channel.send({
      embeds: [EmbedFactory.createErrorEmbed(track, payload)]
    });
    setTimeout(async () => {
      try {
        await errorMessage.delete();
      } catch (err) {
        console.error("Failed to delete error message:", err);
      }
    }, ERROR_MESSAGE_DURATION);
  } catch (error) {
    console.error("Error message sending failed:", error);
  }
});

aqua.on("nodeConnect", node => {
  console.log(`Node "${node.name}" connected.`);
});

aqua.on("nodeError", (node, error) => {
  console.error(`Node "${node.name}" encountered an error: ${error.message}`);
});

client.on("raw", d => {
  if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
  client.aqua.updateVoiceState(d);
});

client.aqua = aqua;
client.slashCommands = new Map();
client.events = new Map();
client.selectMenus = new Map();

const commands = import("./src/handlers/Command.mjs")
  .then(({ CommandHandler }) => new CommandHandler(client, rootPath).refreshCommands());
const events = import("./src/handlers/Events.mjs")
  .then(({ EventHandler }) => new EventHandler(client, rootPath).loadEvents());

await Promise.all([commands, events]);

client.login(token);
