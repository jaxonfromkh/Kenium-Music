import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import https from "node:https";
import { createRequire } from "node:module";
import { type } from 'node:os';
import { url } from 'node:inspector';

const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const { token, NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env;
const UPDATE_INTERVAL_MS = 10_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const aqua = new Aqua(client, [{
  host: NODE_HOST,
  password: NODE_PASSWORD,
  port: NODE_PORT,
  secure: false,
  name: NODE_NAME
}], {
  defaultSearchPlatform: "ytsearch",
  restVersion: "v4",
  shouldDeleteMessage: true,
  infiniteReconnects: true,
  autoResume: true,
  leaveOnEnd: false,
});

client.aqua = aqua;
client.slashCommands = new Map();
client.events = new Map();
client.selectMenus = new Map();
client.buttons = new Map();

class LRUCache {
  constructor(maxSize = 500) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
    return value;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

class TimeFormatter {
  static format(ms) {
    const date = new Date(ms);
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
  }
}

const PROGRESS_BARS = new Array(13).fill(0).map((_, i) => {
  return `\`[${'█'.repeat(i)}⦿${'▬'.repeat(12 - i)}]\``;
});

class ChannelManager {
  static channels = new LRUCache(200);
  static lastUpdates = new LRUCache(200);

  static getChannel(client, channelId) {
    const cached = this.channels.get(channelId);
    if (cached) return cached;

    const channel = client.channels.cache.get(channelId);
    if (channel) this.channels.set(channelId, channel);
    return channel;
  }

  static canUpdate(channelId) {
    const lastUpdate = this.lastUpdates.get(channelId) || 0;
    const now = Date.now();
    if (now - lastUpdate < UPDATE_INTERVAL_MS) return false;

    this.lastUpdates.set(channelId, now);
    return true;
  }

  static async updateVoiceStatus(channelId, status, botToken) {
    if (!this.canUpdate(channelId)) return;

    return new Promise((resolve) => {
      const req = https.request({
        host: 'discord.com',
        path: `/api/v10/channels/${channelId}/voice-status`,
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }, (res) => {
        if (res.statusCode !== 204) {
          console.error(`Voice status update failed: ${res.statusCode}`);
        }
        resolve();
      });

      req.on('error', (err) => {
        console.error(`Voice status update error: ${err.message}`);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        resolve();
      });

      req.write(JSON.stringify({ status }));
      req.end();
    });
  }
}

function createTrackEmbed(client, player, track) {
  const { position, volume, loop } = player;
  const { title, uri, author, album, length, isStream } = track;

  const progress = Math.min(12, Math.max(0, Math.round((position / length) * 12)));
  const progressBar = PROGRESS_BARS[progress];

  const volumeIcon = volume === 0 ? '🔇' : volume < 30 ? '🔈' : volume < 70 ? '🔉' : '🔊';
  const loopIcon = { track: '🔂', queue: '🔁', none: '▶️' }[loop] || '▶️';

  return new ContainerBuilder({
    components: [
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `## 🎵 Now Playing`
          },
          {
            type: 10,
            content: `**[${title}](${uri})**\n${author} ${album ? `• ${album}` : ''} • ${isStream ? '🔴 LIVE' : '🎵 320kbps'}`
          },
          {
            type: 10,
            content: `\`${TimeFormatter.format(position)}\` ${progressBar} \`${TimeFormatter.format(length)}\`\n${volumeIcon} \`${volume}%\` ${loopIcon} <@${track.requester.id}>`
          }
        ],
        accessory: {
          type: 11,
          media: {
            url: track.thumbnail || client.user.displayAvatarURL()
          }
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: "Volume Down"
          }
        ],
        accessory: {
          type: 2, 
          label: "🔉",
          style: 2,
          custom_id: "volume_down"
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: "Previous Track"
          }
        ],
        accessory: {
          type: 2,
          label: "⏮️",
          style: 2,
          custom_id: "previous"
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: player.paused ? "Resume" : "Pause"
          }
        ],
        accessory: {
          type: 2,
          label: player.paused ? "▶️" : "⏸️",
          style: player.paused ? 3 : 2,
          custom_id: player.paused ? "resume" : "pause"
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: "Skip"
          }
        ],
        accessory: {
          type: 2,
          label: "⏭️",
          style: 2,
          custom_id: "skip"
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: "Volume Up"
          }
        ],
        accessory: {
          type: 2,
          label: "🔊",
          style: 2,
          custom_id: "volume_up"
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: "*Kenium 3.3.0 • Open Source*"
          }
        ],
        accessory: {
          type: 2,
          label: "Invite",
          style: 5,
          url: "https://discord.com/oauth2/authorize?client_id=1202232935311495209"
        }
      }
    ],
    accent_color: 0
  });
}

function createErrorEmbed(track, payload) {
  return new ContainerBuilder({
    components: [
      {
        type: 9, // Section
        components: [
          {
            type: 10,
            content: `# ❌ Track Error`
          },
          {
            type: 10,
            content: `Error playing: **${track.title}**\n\`${payload.exception.message}\``
          }
        ],
        accessory: {
          type: 2,
          label: "Report",
          style: 4,
          custom_id: "report_error"
        }
      }
    ]
  });
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const updateNowPlayingMessage = debounce(async (player, track, updateProgress) => {
  if (!player.nowPlayingMessage) return;

  try {
    const embed = updateProgress
      ? createTrackEmbed(client, player, track)
      : player.cachedEmbed;

    await player.nowPlayingMessage.edit({
      components: [embed],
      flags: ["4096", "32768"]
    });
  } catch (error) {
    console.error("Error updating message:", error);
    player.nowPlayingMessage = null;
  }
}, 1000);

aqua.on("trackStart", async (player, track) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;

  try {
    const embed = createTrackEmbed(client, player, track);
    player.cachedEmbed = embed;
    
    player.nowPlayingMessage = await channel.send({
      components: [embed],
      flags: ["4096", "32768"]
    });

    ChannelManager.updateVoiceStatus(player.voiceChannel, `⭐ ${track.info.title} - Kenium 3.3.0`, token);
  } catch (error) {
    console.error("Track start error:", error);
  }
});


aqua.on("trackError", async (player, track, payload) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;

  try {
    await channel.send({
      embeds: [createErrorEmbed(track, payload)],
      flags: 64
    });
  } catch (error) {
    console.error("Error sending track error:", error);
  }
});

aqua.on("playerDestroy", async (player) => {
  const channelId = player._lastVoiceChannel || player.voiceChannel;

  if (channelId) {
    ChannelManager.updateVoiceStatus(channelId, null, token);
  }

  player.nowPlayingMessage = null;
});

aqua.on("queueEnd", async (player) => {
  if (player.voiceChannel) {
    ChannelManager.updateVoiceStatus(player.voiceChannel, null, token);
  }

  player.nowPlayingMessage = null;
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId } = interaction;
  const player = aqua.players.get(interaction.guildId);

  if (!player) {
    return interaction.reply({ content: '❌ No active player found', flags: 64 });
  }

  const member = interaction.member;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel || voiceChannel.id !== player.voiceChannel) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel as the bot', flags: 64 });
  }

  try {
    let message;

    switch (customId) {
      case 'volume_down':
        player.setVolume(Math.max(0, player.volume - 10));
        message = `🔉 Volume decreased to ${player.volume}%`;
        break;

      case 'previous':
        if (!player.previous) {
          return interaction.reply({ content: '❌ No previous track found', flags: 64 });
        }
        player.queue.unshift(player.previous);
        player.stop();
        message = '⏮️ Playing previous track';
        break;

      case 'pause':
        player.pause(true);
        message = '⏸️ Playback paused';
        break;

      case 'resume':
        player.pause(false);
        message = '▶️ Playback resumed';
        break;

      case 'skip':
        player.skip();
        message = '⏭️ Skipped to next track';
        break;

      case 'volume_up':
        player.setVolume(Math.min(150, player.volume + 10));
        message = `🔊 Volume increased to ${player.volume}%`;
        break;

      default:
        return;
    }

    await interaction.reply({ content: message, flags: 64 });

    if (['volume_down', 'volume_up', 'pause', 'resume'].includes(customId) && player.current) {
      player.cachedEmbed = createTrackEmbed(client, player, player.current);
      updateNowPlayingMessage(player, player.current, false);
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    interaction.reply({ content: '❌ An error occurred', flags: 64 }).catch(() => { });
  }
});

aqua.on('nodeError', (node, error) => console.error(`Node error: ${error.message}`));
aqua.on('nodeConnect', (node) => console.log(`Node connected: ${node.name}`));

Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => new CommandHandler(client, rootPath).refreshCommands()),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => new EventHandler(client, rootPath).loadEvents())
]).catch(err => console.error("Handler initialization error:", err));

client.on("raw", d => client.aqua.updateVoiceState(d));

client.login(token).catch(err => console.error("Login error:", err));
