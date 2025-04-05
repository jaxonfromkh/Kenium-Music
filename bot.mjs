import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import https from "node:https";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const token = process.env.token;
const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env;

const UPDATE_INTERVAL_MS = 10_000;

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
client.buttons = new Map();

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
      this.cleanupQueue();
    });
  }

  static cleanupQueue(expiry = 300_000) {
    const now = Date.now();
    if (this.cache.size > 1000) {
      const entries = [...this.cache.entries()]
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, 500);
      this.cache.clear();
      entries.forEach(([id, data]) => this.cache.set(id, data));
    } else {
      this.cache.forEach(({ timestamp }, id) => now - timestamp > expiry && this.cache.delete(id));
    }
    
    if (this.updateQueue.size > 1000) {
      const entries = [...this.updateQueue.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 500);
      this.updateQueue.clear();
      entries.forEach(([id, timestamp]) => this.updateQueue.set(id, timestamp));
    } else {
      this.updateQueue.forEach((timestamp, id) => now - timestamp > expiry && this.updateQueue.delete(id));
    }
  }
}

class EmbedFactory {
  static createTrackEmbed(client, player, track) {
    return new EmbedBuilder()
      .setColor(0)
      .setAuthor({
        name: '🎵 Kenium 3.2.0',
        iconURL: client.user.displayAvatarURL(),
        url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
      })
      .setDescription(this.getDescription(player, track))
      .setThumbnail(track.thumbnail || client.user.displayAvatarURL())
      .setFooter({
        text: 'Kenium • Open Source',
        iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
      });
  }

  static getDescription(player, track) {
    const { position, volume, loop } = player;
    const { title, uri, author, album, length, isStream } = track;
    
    return [
      `**[${title}](${uri})**`,
      `${author} ${album ? `• ${album}` : ''} • ${isStream ? '🔴 LIVE' : '🎵 320kbps'}`,
      '',
      `\`${TimeFormatter.format(position)}\` ${this.createProgressBar(length, position)} \`${TimeFormatter.format(length)}\``,
      '',
      `${this.getVolumeIcon(volume)} \`${volume}%\` ${this.getLoopIcon(loop)} <@${track.requester.id}>`
    ].join('\n');
  }

  static createProgressBar(total, current, length = 12) {
    if (!this._progressCache) {
      this._progressCache = new Array(length + 1).fill(0).map((_, i) => {
        return `\`[${'█'.repeat(i)}⦿${'▬'.repeat(length - i)}]\``;
      });
    }
    
    const progress = Math.min(length, Math.max(0, Math.round((current / total) * length)));
    return this._progressCache[progress];
  }

  static getVolumeIcon(volume) {
    return volume === 0 ? '🔇' : volume < 30 ? '🔈' : volume < 70 ? '🔉' : '🔊';
  }

  static getLoopIcon(loop) {
    return { track: '🔂', queue: '🔁', none: '▶️' }[loop] || '▶️';
  }
  
  static createErrorEmbed(track, payload) {
    return new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Track Error')
      .setDescription(`Error playing: **${track.title}**\n\`${payload.exception.message}\``)
      .setTimestamp();
  }
}
function createControlButtons(player) {
  const isPaused = player.paused;
  
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('volume_down')
        .setLabel('🔉')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('previous')
        .setLabel('⏮️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(isPaused ? 'resume' : 'pause')
        .setLabel(isPaused ? '▶️' : '⏸️')
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('skip')
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('volume_up')
        .setLabel('🔊')
        .setStyle(ButtonStyle.Secondary)
    );
}

function scheduleNowPlayingUpdate(player, track, updateProgress = false) {
  if (player.updateScheduled) return;
  
  player.updateScheduled = true;
  setTimeout(() => {
    updateNowPlayingMessage(player, track, updateProgress);
    player.updateScheduled = false;
  }, 1000);
}

async function updateNowPlayingMessage(player, track, updateProgress = false) {
  if (!player.nowPlayingMessage) return;

  try {
    let embed;
    if (updateProgress) {
      embed = EmbedFactory.createTrackEmbed(client, player, track);
    } else {
      if (!player.cachedEmbed) {
        player.cachedEmbed = EmbedFactory.createTrackEmbed(client, player, track);
      }
      
      embed = EmbedBuilder.from(player.cachedEmbed);
      
      const descriptionLines = embed.data.description.split('\n');
      const volumeLine = `${EmbedFactory.getVolumeIcon(player.volume)} \`${player.volume}%\` ${EmbedFactory.getLoopIcon(player.loop)} <@${track.requester.id}>`;
      descriptionLines[descriptionLines.length - 1] = volumeLine;
      
      embed.setDescription(descriptionLines.join('\n'));
    }

    await player.nowPlayingMessage.edit({
      embeds: [embed],
      components: [createControlButtons(player)]
    });
  } catch (error) {
    console.error("Error updating now playing message:", error);
  }
}

aqua.on("trackStart", async (player, track) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const initialEmbed = EmbedFactory.createTrackEmbed(client, player, track);
    player.cachedEmbed = initialEmbed;
    
    player.nowPlayingMessage = await channel.send({
      embeds: [initialEmbed],
      components: [createControlButtons(player)],
      flags: 4096
    });
    
    if (player.updateInterval) clearInterval(player.updateInterval);
    
    
    ChannelManager.updateVoiceStatus(player.voiceChannel, `⭐ ${track.info.title} - Kenium 3.2.0`, token);
  } catch (error) { 
    return; 
  }
});

aqua.on("trackError", async (player, track, payload) => {
  const channel = ChannelManager.getChannel(client, player.textChannel);
  if (!channel) return;
  try {
    const errorEmbed = EmbedFactory.createErrorEmbed(track, payload);
    await channel.send({
      embeds: [errorEmbed],
      flags: 64
    });
  } catch (error) {
    console.error("Error sending track error message:", error);
  }
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
  
  const actions = {
    'volume_down': async () => {
      const newVolumeDown = Math.max(0, player.volume - 10);
      await player.setVolume(newVolumeDown);
      return `🔉 Volume decreased to ${newVolumeDown}%`;
    },
    'previous': async () => {
      if (!player.previous) {
        return '❌ No previous track found';
      }
      player.queue.unshift(player.previous);
      await player.stop();
      return '⏮️ Playing previous track';
    },
    'pause': async () => {
      await player.pause(true);
      scheduleNowPlayingUpdate(player, player.current, false);
      return '⏸️ Playback paused';
    },
    'resume': async () => {
      await player.pause(false);
      scheduleNowPlayingUpdate(player, player.current, false);
      return '▶️ Playback resumed';
    },
    'skip': async () => {
      await player.skip();
      return '⏭️ Skipped to next track';
    },
    'volume_up': async () => {
      const newVolumeUp = Math.min(150, player.volume + 10);
      await player.setVolume(newVolumeUp);
      return `🔊 Volume increased to ${newVolumeUp}%`;
    }
  };
  
  try {
    const action = actions[customId];
    if (!action) return;
    
    const response = await action();
    
    await interaction.reply({ content: response, flags: 64 });
    
    if (['volume_down', 'volume_up', 'pause', 'resume'].includes(customId) && player.current) {
      scheduleNowPlayingUpdate(player, player.current, false);
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    interaction.reply({ content: '❌ An error occurred while processing your request', flags: 64 }).catch(() => {});
  }
});


client.on("raw", d => client.aqua.updateVoiceState(d));
await client.login(token);
