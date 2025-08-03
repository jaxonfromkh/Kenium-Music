import { createEvent } from 'seyfert';
import { SimpleDB } from '../utils/simpleDB';
import { updatePresence } from '../../index';

const db = new SimpleDB();
const settingsCollection = db.collection('guildSettings');
const NICKNAME_REGEX = /\[24\/7\]/;
const GUILD_FETCH_TIMEOUT = 5000;
const AUTO_JOIN_DELAY = 6000;

export default createEvent({
  data: { once: true, name: 'botReady' },
  run(user, client) {
    client.aqua.init(client.botId);
    updatePresence(client);
    client.logger.info(`${user.username} is ready`);

    handleAutoJoin(client);
  }
});

async function handleAutoJoin(client) {
  try {
    const guildsWithTwentyFourSeven = settingsCollection.find({ twentyFourSevenEnabled: true });

    if (!guildsWithTwentyFourSeven.length) return;

    await new Promise(resolve => setTimeout(resolve, AUTO_JOIN_DELAY));

    const batchSize = 5;
    for (let i = 0; i < guildsWithTwentyFourSeven.length; i += batchSize) {
      const batch = guildsWithTwentyFourSeven.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(guildSettings => processGuild(client, guildSettings))
      );

      if (i + batchSize < guildsWithTwentyFourSeven.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error(`[Music] Error during auto-join process: ${error.message}`);
  }
}

async function processGuild(client, guildSettings) {
  const { guildId, voiceChannelId, textChannelId, _id } = guildSettings;

  if (!voiceChannelId || !textChannelId) {
    await cleanupInvalidGuildSettings(client, _id, guildId, 'Missing channel IDs');
    return;
  }

  try {
    const guild = await Promise.race([
      client.guilds.fetch(guildId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Guild fetch timeout')), GUILD_FETCH_TIMEOUT)
      )
    ]).catch(() => null);

    if (!guild) {
      await cleanupInvalidGuildSettings(client, _id, guildId, 'Guild not found or inaccessible');
      return;
    }

    const [voiceChannel, textChannel] = await Promise.allSettled([
      Promise.race([
        client.guilds.channels.fetch(guildId, voiceChannelId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Voice channel fetch timeout')), GUILD_FETCH_TIMEOUT)
        )
      ]),
      Promise.race([
        client.guilds.channels.fetch(guildId, textChannelId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Text channel fetch timeout')), GUILD_FETCH_TIMEOUT)
        )
      ])
    ]);


    if (voiceChannel.status === 'rejected' || !voiceChannel.value) {
      await cleanupInvalidGuildSettings(client, _id, guildId, 'Voice channel not found or inaccessible');
      return;
    }

    if (textChannel.status === 'rejected' || !textChannel.value) {
      await cleanupInvalidGuildSettings(client, _id, guildId, 'Text channel not found or inaccessible');
      return;
    }

    if (voiceChannel.value.type !== 2) {
      await cleanupInvalidGuildSettings(client, _id, guildId, 'Voice channel is not a voice channel');
      return;
    }

    if (![0, 5].includes(textChannel.value.type)) {
      await cleanupInvalidGuildSettings(client, _id, guildId, 'Text channel is not a text channel');
      return;
    }

    await Promise.allSettled([
      createConnection(client, guildId, voiceChannelId, textChannelId),
      updateNickname(guild, guildId)
    ]);
  } catch (error) {
    console.error(`[Music] Error processing guild ${guildId}: ${error.message}`);
    await cleanupInvalidGuildSettings(client, _id, guildId, `Processing error: ${error.message}`);
  }
}

async function cleanupInvalidGuildSettings(client, recordId, guildId, reason) {
  try {
    const existingPlayer = client.aqua.players.get(guildId);
    if (existingPlayer) {
      await existingPlayer.destroy();
    }

    const deletedCount = settingsCollection.delete({ _id: recordId });

    console.warn(`[Music] Removed invalid 24/7 settings for guild ${guildId} (${deletedCount} records deleted): ${reason}`);
  } catch (error) {
    console.error(`[Music] Failed to cleanup guild settings for ${guildId}: ${error.message}`);
  }
}

async function createConnection(client, guildId, voiceChannelId, textChannelId) {
  return client.aqua.createConnection({
    guildId,
    voiceChannel: voiceChannelId,
    textChannel: textChannelId,
    deaf: true,
    defaultVolume: 65,
  });
}

async function updateNickname(guild, guildId) {
  const botMember = guild.members.me;
  if (!botMember) return;

  const currentNick = botMember.nickname || botMember.user.username;

  if (NICKNAME_REGEX.test(currentNick)) return;

  const newNickname = `${currentNick} [24/7]`;

  try {
    await botMember.edit({ nick: newNickname });
  } catch (err) {
    console.error(`[Music] Failed to update nickname in guild ${guildId}: ${err.message}`);
  }
}
