import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
} from "discord.js";
import { token } from "./config.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Manager } from "magmastream";
// import { ClusterManager,ClusterClient, getInfo } from "discord-hybrid-sharding";

// ===============================================
const nodes = [
  {
    host: "",
    port: 433,    // The port your bot is listening on.
    password: "",
    identifier: '',
    secure: false,
    retryAmount: 1000,
    retrydelay: 10000,
    resumeStatus: false, // default: false,
    resumeTimeout: 1000,
    secure: false, // default: false
  }
]
const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

// ===============================================

// ===============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ["CHANNEL"],
});

// const manager = new ClusterManager("bot.mjs", {
// totalShards: "auto",
// mode: "process",
// shardsPerClusters: 1,
// token: token,
// });
// ===============================================
const manager = new Manager({
  // The nodes to connect to.
  nodes,
  // Method to send voice data to Discord
  send: (id, payload) => {
    const guild = client.guilds.cache.get(id);
    if (guild) return guild.shard.send(payload);
  },
  clientName: "ToddysClient",

});




manager.on('trackStart', async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("🎵  | Now Playing")
    .setDescription(`
    **Title:** [${track.title}](${track.uri})
    **Duration:** \`${formatTime(Math.round(track.duration / 1000))}\`
    **Author:** ${track.author}
    `)
    .setThumbnail(track.thumbnail)
    .addFields(
      { name: "Requested by", value: `<@${track.requester.id}>`, inline: true },
      { name: "Volume", value: `${player.volume}%`, inline: true }
    )
    .setFooter({ text: "Toddys Music v2.3.0 | by mushroom0162", iconURL: track.requester.displayAvatarURL() })
    .setTimestamp();
  
  player.nowPlayingMessage = await channel.send({ embeds: [embed] });
});

manager.on('trackChange', async (player, newTrack) => {
  if (player.nowPlayingMessage) {
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle("🎵  | Now Playing")
      .setDescription(`
      **Title:** [${newTrack.title}](${newTrack.uri})
      **Duration:** \`${formatTime(Math.round(newTrack.duration / 1000))}\`
      **Author:** ${newTrack.author}
      `)
      .setThumbnail(newTrack.thumbnail)
      .addFields(
        { name: "Requested by", value: `<@${newTrack.requester.id}>`, inline: true },
        { name: "Volume", value: `${player.volume}%`, inline: true }
      )
      .setFooter({ text: "Toddys Music v2.3.0 | by mushroom0162", iconURL: newTrack.requester.displayAvatarURL() })
      .setTimestamp();
    
    await player.nowPlayingMessage.edit({ embeds: [embed] });
  }
});

manager.on('trackEnd', async (player) => {
  if (player.nowPlayingMessage) {
    try {
      await player.nowPlayingMessage.delete();
      player.nowPlayingMessage = null;
    } catch (error) {
      if (error.code !== 10008) {
        console.error('Error deleting now playing message:', error);
      }
    }
  }
})
  .on('trackError', async (player, track, payload) => {
    console.log(`Error ${payload.exception.cause} / ${payload.exception.message}`);
    if (player.nowPlayingMessage) {
      const channel = client.channels.cache.get(player.textChannel);
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Error playing track")
        .setDescription(`Error playing track: \`${track.title}\`, Payload sent to the owner,\nMessage: \`${payload.exception.message}\``)
        .setFooter({ text: "Toddys Music v2.2.0 | by mushroom0162" })
        .setTimestamp();
      const message = await channel
        .send({ embeds: [embed] })

      setTimeout(() => {
        message.delete();
      }, 5000);
    }
  })
client.manager = manager;
// Emitted whenever a node connects
client.manager.on('nodeConnect', (node) => {
  console.log(`Node "${node.options.identifier}" connected.`);
});

// Emitted whenever a node encountered an error
client.manager.on('nodeError', (node, error) => {
  console.log(`Node "${node.options.identifier}" encountered an error: ${error.message}.`);
});

// THIS IS REQUIRED. Send raw events to Magmastream
client.on('raw', (d) => client.manager.updateVoiceState(d));

(client.slashCommands = new Collection()),
  (client.events = new Collection()),
  (client.buttonCommands = new Collection()),
  (client.selectMenus = new Collection());
// client.cluster = new ClusterClient(client)

// ===============================================
// ==============================================


await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) =>
    CommandHandler(client, rootPath)
  ),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) =>
    EventHandler(client, rootPath)
  ),
  import("./src/handlers/Button.mjs").then(({ ButtonHandler }) =>
    ButtonHandler(client, rootPath)
  ),
]);

// manager.on('shardCreate', shard => console.log(`Launched Shard ${shard.id}`));
// manager.on('clusterCreate', cluster => console.log(`Launched Cluster ${cluster.id}`));
// manager.spawn({ timeout: -1 });

client.login(token);


