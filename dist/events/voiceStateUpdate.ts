import { createEvent, Embed } from "seyfert";
import { isTwentyFourSevenEnabled, getChannelIds } from "../utils/db_helper";

const NO_SONG_ADDED_TIMEOUT = 600000; // 10 minutes
const noSongAddedTimeouts = new Map();
let eventListenersRegistered = false;

function registerEventListeners(client) {
    const aqua = client.aqua;

    aqua.on('trackStart', (player) => {
        clearNoSongAddedTimeout(player.guildId);
    });

    aqua.on('queueEnd', (player) => {
        if (!isTwentyFourSevenEnabled(player.guildId)) {
            startNoSongAddedTimeout(client, player.guildId, player);
        }
    });

    aqua.on('playerDestroy', async (player) => {
        if (!player?.guildId || !player?.voiceChannel || !player?.textChannel) return;
        await rejoinOnDestroy(client, player.guildId, player.voiceChannel, player.textChannel);
    });
}

async function rejoinOnDestroy(client, guildId, voiceChannelId, textChannelId) {
    if (!isTwentyFourSevenEnabled(guildId)) return;

    try {
        let player = client.aqua.players.get(guildId);
        if (player) return;

        if (!voiceChannelId || !textChannelId) {
            const channelIds = getChannelIds(guildId);
            if (!channelIds?.voiceChannelId || !channelIds?.textChannelId) {
                console.error(`No valid channel IDs for guild ${guildId}`);
                return;
            }
            voiceChannelId = channelIds.voiceChannelId;
            textChannelId = channelIds.textChannelId;
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            console.error(`Guild ${guildId} not found`);
            return;
        }

        const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);
        if (!voiceChannel) {
            console.error(`Voice channel ${voiceChannelId} not found or unjoinable in guild ${guildId}`);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        await client.aqua.createConnection({
            guildId,
            voiceChannel: voiceChannelId,
            textChannel: textChannelId,
            deaf: true,
            defaultVolume: 65,
        });
    } catch (error) {
        console.error(`Failed to rejoin voice channel in guild ${guildId}:`, error);
    }
}

async function checkAndRejoin(client, guildId) {
    if (!isTwentyFourSevenEnabled(guildId)) return;

    const channelIds = getChannelIds(guildId);
    if (!channelIds?.voiceChannelId || !channelIds?.textChannelId) {
        console.error(`No valid channel IDs for guild ${guildId} despite 24/7 mode`);
        return;
    }

    await rejoinOnDestroy(client, guildId, channelIds.voiceChannelId, channelIds.textChannelId);
}

function clearNoSongAddedTimeout(guildId) {
    const timeoutId = noSongAddedTimeouts.get(guildId);
    if (timeoutId) {
        clearTimeout(timeoutId);
        noSongAddedTimeouts.delete(guildId);
    }
}

async function startNoSongAddedTimeout(client, guildId, player) {
    clearNoSongAddedTimeout(guildId);

    const timeoutId = setTimeout(async () => {
        try {
            if (isTwentyFourSevenEnabled(guildId)) {
                clearNoSongAddedTimeout(guildId);
                return;
            }

            const currentPlayer = client.aqua?.players?.get(guildId);
            if (!currentPlayer || currentPlayer.playing) {
                clearNoSongAddedTimeout(guildId);
                return;
            }

            if (!currentPlayer.textChannel) {
                currentPlayer.destroy();
                return;
            }

            const textChannel = await client.channels.fetch(currentPlayer.textChannel).catch(() => null);
            if (textChannel && textChannel.type === 0) {
                const embed = new Embed()
                    .setColor(0)
                    .setDescription("No song added in 10 minutes, disconnecting...\nUse the `/24_7` command to keep the bot in voice channel.")
                    .setFooter({ text: "Automatically destroying player" });

                const message = await client.messages.write(textChannel.id, { embeds: [embed] }).catch(() => null);
                if (message) {
                    setTimeout(() => message.delete().catch(() => {}), 10000);
                }
            }

            currentPlayer.destroy();
            noSongAddedTimeouts.delete(guildId);
        } catch (error) {
            console.error(`Error in timeout handler for guild ${guildId}:`, error);
            const player = client.aqua?.players?.get(guildId);
            if (player) player.destroy();
            noSongAddedTimeouts.delete(guildId);
        }
    }, NO_SONG_ADDED_TIMEOUT);

    noSongAddedTimeouts.set(guildId, timeoutId);
}

export default createEvent({
    data: { name: 'voiceStateUpdate', once: false },
    async run([newState, oldState], client): Promise<void> {
        if (client.aqua?.players == null || !oldState?.guildId) return;

        const guildId = oldState.guildId;
        const player = client.aqua.players.get(guildId);
        const botMember = await client.cache.guilds.get(guildId)?.members.fetch(client.botId).catch(() => null);

        if (!eventListenersRegistered) {
            registerEventListeners(client);
            eventListenersRegistered = true;
        }

        if (!player || !botMember?.voice()?.channelId ||
            (oldState.channelId === client.botId && oldState.channelId && !newState.channelId)) {
            await checkAndRejoin(client, guildId);
            return;
        }

        const voiceChannel = botMember.voice().channel;
        const is247Enabled = isTwentyFourSevenEnabled(guildId);

        if (voiceChannel && voiceChannel.members.filter(m => !m.user.bot).size === 0) {
            if (!is247Enabled) {
                startNoSongAddedTimeout(client, guildId, player);
            }
        } else {
            clearNoSongAddedTimeout(guildId);
        }

        if (player && !player.playing && !player.paused && !is247Enabled) {
            startNoSongAddedTimeout(client, guildId, player);
        } else if (player && player.playing) {
            clearNoSongAddedTimeout(guildId);
        }
    }
});
