import {
  Client,
  GatewayIntentBits,
  Collection,
  GatewayDispatchEvents
} from "discord.js";
import { token } from "./config.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Riffy } from "riffy";
import { readdirSync } from "fs";
// import { ClusterManager,ClusterClient, getInfo } from "discord-hybrid-sharding";
// ===============================================
const nodes = [
  {
    host: "", // your node here   
    port: 433, // your port here
    password: "", //' your password here
    secure: false // your secure here
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

(client.slashCommands = new Collection()),
  (client.events = new Collection()),
  (client.buttonCommands = new Collection()),
  (client.selectMenus = new Collection());
// client.cluster = new ClusterClient(client)

// ===============================================
client.riffy = new Riffy(client, nodes, {
  send: (payload) => {
      const guild = client.guilds.cache.get(payload.d.guild_id);
      if (guild) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytmsearch",
  restVersion: "v4",
});
(async () => {
  await load_riffy()
})()

export { client }
client.on("raw", (d) => {
    if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate,].includes(d.t)) return;
    client.riffy.updateVoiceState(d);
});

async function load_riffy() {
  console.log("\n---------------------");
  console.log("INITIATING RIFFY", "debug");

  const directories = readdirSync('./src/riffy/');

  for (const dir of directories) {
    const lavalinkFiles = readdirSync(join('./src/riffy/', dir)).filter(file => file.endsWith('.mjs'));

    for (const file of lavalinkFiles) {
      const modulePath = join('./src/riffy/', dir, file); // Construct the path
      console.log(`Attempting to load module: ${modulePath}`); // Log the path to debug
      
      try {
        const pull = await import(`./${modulePath}`); // Import the module
        
        if (pull.name && typeof pull.name !== 'string') {
          console.error(`Couldn't load the riffy event ${file}, error: Property 'name' should be a string.`);
          continue;
        }

        const event = { ...pull }; // Make a copy of the imported module
        event.name = event.name || file.replace('.mjs', '');
        console.log(`[RIFFY] ${event.name}`, "info");
      } catch (err) {
        console.error(`Couldn't load the riffy event ${file}, error: ${err}`);
        console.error(err);
        continue;
      }
    }
  }
}
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

await client.login(token);
