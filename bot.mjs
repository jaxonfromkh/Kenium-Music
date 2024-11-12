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

const nodes = [
  {
    host: "wz",
    port: 433,
    password: "",
    identifier: '',
    secure: false,
    retryAmount: 1000,
    retrydelay: 10000,
    resumeStatus: false,
    resumeTimeout: 1000,
  }
];


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

const manager = new Manager({
  nodes,
  send: (id, payload) => {
    const guild = client.guilds.cache.get(id);
    if (guild) return guild.shard.send(payload);
  },
  clientName: "ThoriumClient",
});

const formatTime = (time) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

const createTrackEmbed = (track, player) => {
  return new EmbedBuilder()
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
};

manager.on('trackStart', async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  player.nowPlayingMessage = await channel.send({ embeds: [createTrackEmbed(track, player)] });
});

manager.on('trackChange', async (player, newTrack) => {
  if (player.nowPlayingMessage) {
    await player.nowPlayingMessage.edit({ embeds: [createTrackEmbed(newTrack, player)] });
  }
});

manager.on('trackEnd', async (player) => {
  if (player.nowPlayingMessage) {
    try {
      await player.nowPlayingMessage.delete();
      player.nowPlayingMessage = null; // Clear reference to allow garbage collection
    } catch (error) {
      if (error.code !== 10008) {
        console.error('Error deleting now playing message:', error);
      }
    }
  }
});

manager.on('trackError', async (player, track, payload) => {
  console.log(`Error ${payload.exception.cause} / ${payload.exception.message}`);
  
  if (player.nowPlayingMessage) {
    const channel = client.channels.cache.get(player.textChannel);
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error playing track")
      .setDescription(`Error playing track: \`${track.title}\`, Payload sent to the owner,\nMessage: \`${payload.exception.message}\``)
      .setFooter({ text: "Toddys Music v2.3.0 | by mushroom0162" })
      .setTimestamp();
    const message = await channel.send({ embeds: [embed] });
    setTimeout(() => message.delete().catch(console.error), 5000);
  }
});

client.manager = manager;
client.manager.on('nodeConnect', (node) => {
  console.log(`Node "${node.options.identifier}" connected.`);
});

client.manager.on('nodeError', (node, error) => {
  console.log(`Node "${node.options.identifier}" encountered an error: ${error.message}.`);
});

client.on('raw', (d) => client.manager.updateVoiceState(d));

client.slashCommands = new Collection();
client.events = new Collection();
client.buttonCommands = new Collection();
client.selectMenus = new Collection();

await Promise.all([
  import("./src/handlers/Command.mjs").then(({ CommandHandler }) => CommandHandler(client, rootPath)),
  import("./src/handlers/Events.mjs").then(({ EventHandler }) => EventHandler(client, rootPath)),
  import("./src/handlers/Button.mjs").then(({ ButtonHandler }) => ButtonHandler(client, rootPath)),
]);

client.login(token);