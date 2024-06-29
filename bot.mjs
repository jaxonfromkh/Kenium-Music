import { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder  } from 'discord.js'
import { token } from './config.mjs'
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DisTube } from 'distube';
import { YouTubePlugin } from '@distube/youtube';
import { DirectLinkPlugin } from '@distube/direct-link';
import { CommandHandler } from './src/handlers/Command.mjs'; 
import { EventHandler } from './src/handlers/Events.mjs';
import { ButtonHandler } from './src/handlers/Button.mjs';
// ===============================================

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootPath = __dirname;

// ===============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent, // Only for bots with message content intent access.
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
    ],
    partials: [Partials.Channel]
})
// ===============================================
client.slashCommands = new Collection()
client.events = new Collection()
client.buttonCommands = new Collection();

client.distube = new DisTube(client, {
    nsfw: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    savePreviousSongs: false,
    plugins: [new YouTubePlugin(), new DirectLinkPlugin()],
  });
client.youtubeStuff = new YouTubePlugin()
// ===============================================
  const Response = new EmbedBuilder()
  .setColor('Blue')
  .setTitle("🎵  Music 🎵")
  .setTimestamp(Date.now())
// ===============================================  
client.distube.on("initQueue", queue => {
  queue.autoplay = false;
  queue.volume = 100
})
// ===============================================
.on('playSong', (queue, song) =>
    queue.textChannel.send({embeds: [Response.setDescription(`▶️ | Playing \`${song.name}\` - \`${song.formattedDuration}\`\nrequest by: ${
        song.user
      }
        `).setThumbnail(song.thumbnail)]      
      }),
    )
// ===============================================
await CommandHandler(client, rootPath)
await EventHandler(client, rootPath)
await ButtonHandler(client, rootPath)
await client.login(token)
