import {
  Client,
  GatewayIntentBits,
  Collection,
GatewayDispatchEvents
} from "discord.js";
import { token } from "./config.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Connectors } from "shoukaku";
import { Kazagumo } from "kazagumo";
// import { ClusterManager,ClusterClient, getInfo } from "discord-hybrid-sharding";
// ===============================================
const nodes = [
  {
    url: "",        
    auth: "",
    name: '',
    secure: false
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
const kazagumo = new Kazagumo({
  defaultSearchEngine: "youtube",
  // MAKE SURE YOU HAVE THIS
  send: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), nodes);
kazagumo.shoukaku.on('ready', (name) => console.log(`Lavalink ${name}: Ready!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`Lavalink ${name}: Error Caught,`, error));
kazagumo.shoukaku.on('close', (name, code, reason) => console.warn(`Lavalink ${name}: Closed, Code ${code}, Reason ${reason || 'No reason'}`));
kazagumo.shoukaku.on('debug', (name, info) => console.debug(`Lavalink ${name}: Debug,`, info));
kazagumo.shoukaku.on('disconnect', (name, count) => {
    const players = [...kazagumo.shoukaku.players.values()].filter(p => p.node.name === name);
    players.map(player => {
        kazagumo.destroyPlayer(player.guildId);
        player.destroy();
    });
    console.warn(`Lavalink ${name}: Disconnected`);
});
kazagumo.on("playerEnd", (player) => {
  player.data.get("message")?.edit({content: `Finished playing`});
});

kazagumo.on("playerEmpty", player => {
  client.channels.cache.get(player.textId)?.send({content: `Destroyed player due to inactivity || Lavalink Overloaded (Possible: Memory exceded? Lavalink Error?)`})
      .then(x => player.data.set("message", x));
  player.destroy();
});
kazagumo.on('playerClosed', player => {
  player.destroy();
  player.data.get("message")?.edit({content: `Lavalink Overloaded (Possible: Memory exceded? Lavalink Error?)`});
})
client.kazagumo = kazagumo;
// const manager = new ClusterManager("bot.mjs", {
// totalShards: "auto",
// mode: "process",
// shardsPerClusters: 1,
// token: token,
// });
// ===============================================

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
