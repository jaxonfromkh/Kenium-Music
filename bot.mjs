import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import https from "node:https";
import { createRequire } from "node:module";

const CACHE_EXPIRY_MS = 600_000;
const UPDATE_INTERVAL_MS = 10_000;
const ERROR_MESSAGE_DURATION_MS = 5_000;
const MESSAGE_FLAGS = 4096;
const EMBED_COLOR = 0x000000;
const ERROR_COLOR = 0xd32f2f;
const VERSION = '3.1.0';

const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');
const { token, NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: ["CHANNEL"],
});

const nodes = [{
  host: NODE_HOST,
  password: NODE_PASSWORD,
  port: NODE_PORT,
  secure: false,
  name: NODE_NAME,
}];

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

class TimeFormatter {
  static #cache = new Map();
  
  static format(milliseconds) {
    const rounded = Math.floor(milliseconds / 1000) * 1000;
    if (this.#cache.has(rounded)) {
      return this.#cache.get(rounded);
    }
    
    const formatted = new Date(rounded).toISOString().substring(11, 19);
    this.#cache.set(rounded, formatted);
    
    if (this.#cache.size > 3600) {
      const oldestKey = this.#cache.keys().next().value;
      this.#cache.delete(oldestKey);
    }
    
    return formatted;
  }
}

class ChannelManager {
  static #cache = new Map();
  static #updateQueue = new Map();
  static #lastCleanup = Date.now();
  
  static getChannel(client, channelId) {
    const cached = this.#cache.get(channelId);
    if (cached) {
      cached.timestamp = Date.now(); 
      return cached.channel;
    }
    
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      this.#cache.set(channelId, { channel, timestamp: Date.now() });
      
      const now = Date.now();
      if (now - this.#lastCleanup > 60000) {
        this.clearOldCache();
        this.clearOldUpdateQueue();
        this.#lastCleanup = now;
      }
    }
    
    return channel;
  }

  static async updateVoiceStatus(channelId, status, botToken) {
    const now = Date.now();
    const lastUpdate = this.#updateQueue.get(channelId) || 0;
    
    if (now - lastUpdate < UPDATE_INTERVAL_MS) return;
    
    this.#updateQueue.set(channelId, now);
    
    try {
      return new Promise((resolve, reject) => {
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
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve();
          }
        });
        
        req.on('error', reject);
        req.write(JSON.stringify({ status }));
        req.end();
      });
    } catch (error) {
      console.error('Voice status update error:', error);
    }
  }

  static clearOldCache(expiry = CACHE_EXPIRY_MS) {
    const now = Date.now();
    let removed = 0;
    
    for (const [id, { timestamp }] of this.#cache.entries()) {
      if (now - timestamp > expiry) {
        this.#cache.delete(id);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.debug(`Cleared ${removed} stale channel cache entries`);
    }
  }

  static clearOldUpdateQueue(expiry = CACHE_EXPIRY_MS) {
    const now = Date.now();
    let removed = 0;
    
    for (const [id, timestamp] of this.#updateQueue.entries()) {
      if (now - timestamp > expiry) {
        this.#updateQueue.delete(id);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.debug(`Cleared ${removed} stale update queue entries`);
    }
  }
}

class EmbedFactory {
  static #progressBarCache = new Map();
  
  static createTrackEmbed(client, player, track) {
    return new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({
        name: `🎵 Kenium ${VERSION}`,
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
    
    return [
      `**[${title}](${uri})**`,
      `${author} ${album ? `• ${album}` : ''} • ${isStream ? '🔴 LIVE' : '🎵 320kbps'}`,
      '',
      `\`${TimeFormatter.format(position)}\` ${this.createProgressBar(length, position)} \`${TimeFormatter.format(length)}\``,
      '',
      `${this.getVolumeIcon(volume)} \`${volume}%\` ${this.getLoopIcon(loop)} ${this.getRequesterTag(track.requester)}`
    ].join('\n');
  }

  static createProgressBar(total, current, length = 12) {
    const progressPercent = Math.floor((current / total) * 20) * 5;
    const cacheKey = `${total}_${progressPercent}_${length}`;
    
    if (this.#progressBarCache.has(cacheKey)) {
      return this.#progressBarCache.get(cacheKey);
    }
    
    const progress = Math.round((progressPercent / 100) * length);
    const bar = `\`[${('█').repeat(progress)}⦿${('▬').repeat(length - progress)}]\``;
    
    if (this.#progressBarCache.size > 100) {
      const oldestKey = this.#progressBarCache.keys().next().value;
      this.#progressBarCache.delete(oldestKey);
    }
    
    this.#progressBarCache.set(cacheKey, bar);
    return bar;
  }
  
  static getVolumeIcon(volume) {
    if (volume === 0) return '🔇';
    if (volume < 30) return '🔈';
    if (volume < 70) return '🔉';
    return '🔊';
  }

  static getLoopIcon(loop) {
    switch (loop) {
      case 'track': return '🔂';
      case 'queue': return '🔁';
      default: return '▶️';
    }
  }
  
  static getRequesterTag(requester) {
    return `<@${requester.id}>`;
  }

  static createErrorEmbed(track, payload) {
    return new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle("❌ Error")
      .setDescription(`Failed to play \`${track.info.title}\`\n\`${payload.exception?.message || 'Unknown error'}\``)
      .setFooter({ text: `Kenium v${VERSION}` })
      .setTimestamp();
  }
}

const handleTrackStart = async (player, track) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  
  try {
    const status = player.queue.size > 2
      ? `⭐ Playlist (${player.queue.size} tracks) - Kenium ${VERSION}`
      : `⭐ ${track.info.title} - Kenium ${VERSION}`;
    
    if (player.nowPlayingMessage) {
      try {
        await player.nowPlayingMessage.delete().catch(() => {});
      } catch (e) {
      }
    }
    
    player.nowPlayingMessage = await channel.send({
      embeds: [EmbedFactory.createTrackEmbed(client, player, track)],
      flags: MESSAGE_FLAGS
    });
    
    ChannelManager.updateVoiceStatus(player.voiceChannel, status, token)
      .catch(err => console.warn("Voice status update failed:", err));
  } catch (error) {
    console.error("Track start error:", error);
  }
};

const handleQueueEnd = (player) => {
  ChannelManager.updateVoiceStatus(player.voiceChannel, null, token)
    .catch(err => console.warn("Voice status clear failed:", err));
  
  player.nowPlayingMessage = null;
};

const handleTrackError = async (player, track, payload) => {
  console.error(`Error ${payload.exception?.code || 'unknown'} / ${payload.exception?.message || 'No message'}`);
  
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  
  try {
    const errorMessage = await channel.send({ 
      embeds: [EmbedFactory.createErrorEmbed(track, payload)],
      flags: MESSAGE_FLAGS
    });
    
    setTimeout(() => errorMessage.delete().catch(() => {}), ERROR_MESSAGE_DURATION_MS);
  } catch (error) {
    console.error("Error message sending failed:", error);
  }
};

aqua.on("trackStart", handleTrackStart);
aqua.on("queueEnd", handleQueueEnd);
aqua.on("trackError", handleTrackError);

aqua.on("nodeConnect", node => console.log(`Node "${node.name}" connected.`));
aqua.on("nodeError", (node, error) => console.error(`Node "${node.name}" encountered an error: ${error.message}`));

client.on("raw", d => {
  if (d.t === "VOICE_STATE_UPDATE" || d.t === "VOICE_SERVER_UPDATE") {
    client.aqua.updateVoiceState(d);
  }
});

const loadHandlers = async () => {
  try {
    await Promise.all([
      import("./src/handlers/Command.mjs").then(({ CommandHandler }) => 
        new CommandHandler(client, rootPath).refreshCommands()),
      import("./src/handlers/Events.mjs").then(({ EventHandler }) => 
        new EventHandler(client, rootPath).loadEvents())
    ]);
    console.log("All handlers loaded successfully");
  } catch (error) {
    console.error("Failed to load handlers:", error);
    process.exit(1);
  }
};

const startup = async () => {
  try {
    await loadHandlers();
    
    await client.login(token);
    console.log(`Logged in as ${client.user.tag}`);
    
    setInterval(() => {
      ChannelManager.clearOldCache();
      ChannelManager.clearOldUpdateQueue();
    }, CACHE_EXPIRY_MS / 2);
    
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

startup();
