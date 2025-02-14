import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  GatewayDispatchEvents,
} from "discord.js";
import { token } from "./config.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

const UPDATE_INTERVAL = 30000;
const ERROR_MESSAGE_DURATION = 5000;
const DEFAULT_COLOR = 0x000000;
const ERROR_COLOR = 0xff0000;

const nodes = [{
  host: "",
  password: "",
  port: 433,
  secure: false,
  name: "toddy's"
}];

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;


class TimeFormatter {
  static format(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return [hours, minutes, remainingSeconds]
      .map(v => v < 10 ? `0${v}` : String(v))
      .filter((v, i) => v !== '00' || i === 2)
      .join(':');
  }
}

class ChannelManager {
  static #cache = new Map();
  static #updateTimestamps = new Map();

  static getChannel(client, channelId) {
    if (!this.#cache.has(channelId)) {
      const channel = client.channels.cache.get(channelId);
      if (channel) this.#cache.set(channelId, channel);
    }
    return this.#cache.get(channelId);
  }

  static async updateVoiceStatus(channelId, status, token) {
    const now = Date.now();
    const lastUpdate = this.#updateTimestamps.get(channelId) || 0;
    
    if (now - lastUpdate < UPDATE_INTERVAL) return;
    this.#updateTimestamps.set(channelId, now);

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/voice-status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: status || "Kenium 2.8.0" }),
        }
      );
      
      if (!response.ok) {
        console.error(`Voice status update failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Voice status update error:", error);
    }
  }

  static clearCaches() {
    this.#cache.clear();
    this.#updateTimestamps.clear();
  }
}

class EmbedFactory {
  static createTrackEmbed(client, player, track) {
    const progressBar = this.createProgressBar(track.info.length, player.position);
    
    return new EmbedBuilder()
      .setColor('#0A0A0A')
      .setAuthor({
        name: '🎵Kenium 2.8.0 - Open Source Music Bot',
        iconURL: client.user.displayAvatarURL(),
        url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
      })
      .setDescription([
        `### [\`${track.info.title}\`](<${track.info.uri}>)`,
        `> by **${track.info.author}** • ${track.info.album || 'Single'} • ${track.info.isStream ? '🔴 LIVE' : '320kbps'}`,
        '',
        `\`${TimeFormatter.format(player.position)}\` ${progressBar} \`${TimeFormatter.format(track.info.length)}\``,
        '',
        `${player.volume > 50 ? '🔊' : '🔈'} \`${player.volume}%\` • ${player.loop ? '🔁' : '▶️'} \`${player.loop ? 'Loop' : 'Normal'}\` • 👤 <@${track.requester.id}>`
      ].join('\n'))
      .setThumbnail(track.info.artworkUrl || client.user.displayAvatarURL())
      .setFooter({
        text: 'v2.8.0 • mushroom0162',
        iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
      });
  }
  static createProgressBar(total, current, length = 12) {
    const progress = Math.round((current / total) * length);
    const emptyProgress = length - progress;
    
    const progressText = '━'.repeat(progress);
    const emptyProgressText = '─'.repeat(emptyProgress);
    const circle = current > 0 ? '⚪' : '⭕';
    
    return `${progressText}${circle}${emptyProgressText}`;
  }

  static createErrorEmbed(track, payload) {
    return new EmbedBuilder()
      .setColor('#FF3333')
      .setAuthor({
        name: 'Playback Error'
      })
      .setDescription([
        '### Something went wrong while playing:',
        `\`\`\`diff`,
        `- Track: ${track.info.title}`,
        `- Error: ${payload.exception.message}`,
        `\`\`\``,
        '*Try playing the track again or check if the URL is valid.*'
      ].join('\n'))
      .setFooter({
        text: 'Kenium v2.8.0 • Report bugs on GitHub',
        iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
      })
      .setTimestamp();
  }

  static createErrorEmbed(track, payload) {
    return new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle("❌ Error Playing Track")
      .setDescription(
        `**Error:** \`${track.info.title}\`\n**Message:** \`${payload.exception.message}\``
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
  if (player.queue.length === 0) {
    ChannelManager.clearCaches();
  }
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
    
    setTimeout(() => {
      errorMessage.delete().catch(console.error);
    }, ERROR_MESSAGE_DURATION);
  } catch (error) {
    console.error("Error message sending failed:", error);
  }
});

aqua.on("nodeConnect", (node) => {
  console.log(`Node "${node.name}" connected.`);
});

aqua.on("nodeError", (node, error) => {
  console.error(`Node "${node.name}" encountered an error: ${error.message}`);
});

client.on("raw", (d) => {
  if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
  client.aqua.updateVoiceState(d);
});

client.aqua = aqua;
client.slashCommands = new Map();
client.events = new Map();
client.selectMenus = new Map();

await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => CommandHandler(client, rootPath)),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => EventHandler(client, rootPath))
]);

client.login(token);
