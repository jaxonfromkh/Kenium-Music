import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import https from "node:https";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const token = process.env.token;
const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env;

const UPDATE_INTERVAL_MS = 10_000;
const ERROR_MESSAGE_DURATION_MS = 5_000;

const nodes = [{ host: NODE_HOST, password: NODE_PASSWORD, port: NODE_PORT, secure: false, name: NODE_NAME }];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: ["CHANNEL"]
});

const aqua = new Aqua(client, nodes, {
  defaultSearchPlatform: "ytsearch",
  restVersion: "v4",
  shouldDeleteMessage: true,
  autoResume: true,
  infiniteReconnects: true,
});

client.aqua = aqua;
client.slashCommands = new Map();
client.events = new Map();
client.selectMenus = new Map();

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => new CommandHandler(client, rootPath).refreshCommands()),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => new EventHandler(client, rootPath).loadEvents())
]);

class TimeFormatter {
  static format(ms) {
    return new Date(ms).toISOString().substring(11, 19);
  }
}

class ChannelManager {
  static cache = new Map();
  static updateQueue = new Map();

  static getChannel(client, channelId) {
    if (this.cache.has(channelId)) return this.cache.get(channelId).channel;
    const channel = client.channels.cache.get(channelId);
    if (channel) this.cache.set(channelId, { channel, timestamp: Date.now() });
    return channel;
  }

  static async updateVoiceStatus(channelId, status, botToken) {
    if (Date.now() - (this.updateQueue.get(channelId) || 0) < UPDATE_INTERVAL_MS) return;
    this.updateQueue.set(channelId, Date.now());

    const req = https.request({
      host: 'discord.com',
      path: `/api/v10/channels/${channelId}/voice-status`,
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    }, (res) => res.statusCode !== 204 && console.error(`Voice status update failed: ${res.statusCode}`));

    req.on('error', console.error);
    req.write(JSON.stringify({ status }));
    req.end();
    this.cleanupQueue();
  }

  static cleanupQueue(expiry = 600_000) {
    const now = Date.now();
    this.cache.forEach(({ timestamp }, id) => now - timestamp > expiry && this.cache.delete(id));
    this.updateQueue.forEach((timestamp, id) => now - timestamp > expiry && this.updateQueue.delete(id));
  }
}

class EmbedFactory {
  static createTrackEmbed(client, player, track) {
    return new EmbedBuilder()
      .setColor(0)
      .setAuthor({
        name: '🎵 Kenium 3.1.0',
        iconURL: client.user.displayAvatarURL(),
        url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
      })
      .setDescription(this.getDescription(player, track))
      .setThumbnail(track.info.artworkUrl || client.user.displayAvatarURL())
      .setFooter({
        text: 'Kenium • Open Source',
        iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
      });
  }

  static getDescription(player, track) {
    const { position, volume, loop } = player;
    const { title, uri, author, album, length, isStream, requester } = track.info;
    
    return [
      `**[${title}](${uri})**`,
      `${author} ${album ? `• ${album}` : ''} • ${isStream ? '🔴 LIVE' : '🎵 320kbps'}`,
      '',
      `\`${TimeFormatter.format(position)}\` ${this.createProgressBar(length, position)} \`${TimeFormatter.format(length)}\``,
      '',
      `${this.getVolumeIcon(volume)} \`${volume}%\` ${this.getLoopIcon(loop)} <@${requester.id}>`
    ].join('\n');
  }

  static createProgressBar(total, current, length = 12) {
    const progress = Math.round((current / total) * length);
    return `\`[${'█'.repeat(progress)}⦿${'▬'.repeat(length - progress)}]\``;
  }

  static getVolumeIcon(volume) {
    return volume === 0 ? '🔇' : volume < 30 ? '🔈' : volume < 70 ? '🔉' : '🔊';
  }

  static getLoopIcon(loop) {
    return { track: '🔂', queue: '🔁', none: '▶️' }[loop] || '▶️';
  }
}

aqua.on("trackStart", async (player, track) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    player.nowPlayingMessage = await channel.send({
      embeds: [EmbedFactory.createTrackEmbed(client, player, track)],
      flags: 4096
    });
    ChannelManager.updateVoiceStatus(player.voiceChannel, `⭐ ${track.info.title} - Kenium 3.1.0`, token);
  } catch (error) {
    console.error("Track start error:", error);
  }
});

aqua.on("queueEnd", (player) => {
  ChannelManager.updateVoiceStatus(player.voiceChannel, null, token);
  ChannelManager.cleanupQueue();
  player.nowPlayingMessage = null;
});

aqua.on("trackError", async (player, track, payload) => {
  console.error(`Error ${payload.exception.code} / ${payload.exception.message}`);
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const errorMessage = await channel.send({ embeds: [EmbedFactory.createErrorEmbed(track, payload)] });
    setTimeout(() => errorMessage.delete().catch(() => {}), ERROR_MESSAGE_DURATION_MS);
  } catch (error) {
    console.error("Error message sending failed:", error);
  }
});

aqua.on('nodeError', (node, error) => console.error(`Node error: ${error.message}`));
aqua.on('nodeConnect', (node) => console.log(`Node connected: ${node.name}`));

client.on("raw", d => client.aqua.updateVoiceState(d));
await client.login(token);
