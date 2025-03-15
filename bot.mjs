import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, GatewayDispatchEvents } from "discord.js";
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

const nodes = [{
  host: NODE_HOST,
  password: NODE_PASSWORD,
  port: NODE_PORT,
  secure: false,
  name: NODE_NAME
}];



class TimeFormatter {
  static format(milliseconds) {
    return new Date(milliseconds).toISOString().substring(11, 19);
  }
}

class ChannelManager {
  static cache = new Map();
  static updateQueue = new Map();
  static getChannel(client, channelId) {
    const cached = this.cache.get(channelId);
    if (cached) {
      return cached.channel;
    }
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      this.cache.set(channelId, { channel, timestamp: Date.now() });
    }
    return channel;
  }

  static async updateVoiceStatus(channelId, status, botToken) {
    const now = Date.now();
    if ((now - (this.updateQueue.get(channelId) || 0)) < UPDATE_INTERVAL_MS) return;
    
    this.updateQueue.set(channelId, now);
    
    const req = https.request({
      host: 'discord.com',
      path: `/api/v10/channels/${channelId}/voice-status`,
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      if (res.statusCode !== 204) {
        console.error(`Voice status update failed: ${res.statusCode}`);
      }
    });
    req.on('error', (error) => {
      console.error('Voice status update error:', error);
    });
    req.write(JSON.stringify({ status }));
    req.end();
    this.clearOldUpdateQueue();
  }

  static clearOldCache(expiry = 600_000) {
    const now = Date.now();
    this.cache.forEach(({ timestamp }, id) => {
      if (now - timestamp > expiry) this.cache.delete(id);
    });
  }

  static clearOldUpdateQueue(expiry = 600_000) {
    const now = Date.now();
    this.updateQueue.forEach((timestamp, id) => {
      if (now - timestamp > expiry) this.updateQueue.delete(id);
    });
  }
}

class EmbedFactory {
  static createTrackEmbed(client, player, track) {
    return new EmbedBuilder()
      .setColor(0x0a1929)
      .setAuthor({
        name: '🎵 Kenium 3.0.4',
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
    const { title, uri, author, album, length, isStream } = track.info;
    
    return `**[${title}](${uri})**\n${author} • ${album || 'Single'} • ${isStream ? '🔴 LIVE' : '🎵 320kbps'}\n` +
      `\`${TimeFormatter.format(position)}\` ${this.createProgressBar(length, position)} \`${TimeFormatter.format(length)}\`\n` +
      `${this.getVolumeIcon(volume)} \`${volume}%\` ${this.getLoopIcon(loop)} ${this.getRequesterTag(track.requester)}`;
  }

  static createProgressBar(total, current, length = 12) {
    const progress = Math.round((current / total) * length);
    return `\`[${('█').repeat(progress)}⦿${('▬').repeat(length - progress)}]\``;
  }
  
  static getVolumeIcon(volume) {
    if (volume === 0) return '🔇';
    if (volume < 30) return '🔈';
    if (volume < 70) return '🔉';
    return '🔊';
  }

  static getLoopIcon(loop) {
    return {
      track: '🔂',
      queue: '🔁',
      none: '▶️'
    }[loop] || '▶️';
  }
  
  static getRequesterTag(requester) {
    return `<@${requester.id}>`;
  }

  static createErrorEmbed(track, payload) {
    return new EmbedBuilder()
      .setColor(0xd32f2f)
      .setTitle("❌ Error")
      .setDescription(`Failed to play \`${track.info.title}\`\n\`${payload.exception?.message || 'Unknown error'}\``)
      .setFooter({ text: "Kenium v3.0.4" })
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
  autoResume: true,
  infiniteReconnects: true,
});

aqua.on("trackStart", async (player, track) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const status = player.queue.size > 2
      ? `⭐ Playlist (${player.queue.size} tracks) - Kenium 3.0.4`
      : `⭐ ${track.info.title} - Kenium 3.0.4`;
    player.nowPlayingMessage = await channel.send({
      embeds: [EmbedFactory.createTrackEmbed(client, player, track)],
      flags: 4096
    });
    ChannelManager.updateVoiceStatus(player.voiceChannel, status, token);
  } catch (error) {
    console.error("Track start error:", error);
  }
});

aqua.on("queueEnd", (player) => {
  ChannelManager.updateVoiceStatus(player.voiceChannel, null, token);
  ChannelManager.clearOldCache();
  player.nowPlayingMessage = null;
});

aqua.on("trackError", async (player, track, payload) => {
  console.error(`Error ${payload.exception.code} / ${payload.exception.message}`);
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const errorMessage = await channel.send({ embeds: [EmbedFactory.createErrorEmbed(track, payload)] });
    setTimeout(() => errorMessage.delete().catch(() => { }), ERROR_MESSAGE_DURATION_MS); // Renamed for clarity
  } catch (error) {
    console.error("Error message sending failed:", error);
  }
});

aqua.on("nodeConnect", node => console.log(`Node "${node.name}" connected.`));
aqua.on("nodeError", (node, error) => console.error(`Node "${node.name}" encountered an error: ${error.message}`));
client.on("raw", d => {
  if ([GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) {
    client.aqua.updateVoiceState(d);
  }
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

client.login(token);
