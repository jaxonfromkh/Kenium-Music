import { createEvent, Embed } from "seyfert";
import { isTwentyFourSevenEnabled, getChannelIds } from "../utils/db_helper";

const NO_SONG_ADDED_TIMEOUT = 600000; // 10 minutes
const RECONNECT_DELAY = 5000; // 5 seconds
const noSongAddedTimeouts = new Map<string, NodeJS.Timeout>();
let eventListenersRegistered = false;

function registerEventListeners(client: any) {
    const { aqua } = client;

    aqua.on('trackStart', (player: any) => {
        clearNoSongAddedTimeout(player.guildId);
    });

    aqua.on('queueEnd', (player: any) => {
        if (!isTwentyFourSevenEnabled(player.guildId)) {
            startNoSongAddedTimeout(client, player.guildId);
        }
    });

    aqua.on('playerDestroy', (player: any) => {
        if (player?.guildId) {
            setTimeout(() => rejoinOnDestroy(client, player.guildId), RECONNECT_DELAY);
        }
    });
}

function rejoinOnDestroy(client: any, guildId: string) {
    if (!isTwentyFourSevenEnabled(guildId)) return;
    if (client.aqua.players.get(guildId)) return; // Player already exists

    try {
        const channelIds = getChannelIds(guildId);
        if (!channelIds?.voiceChannelId) return;

        client.aqua.createConnection({
            guildId,
            voiceChannel: channelIds.voiceChannelId,
            textChannel: channelIds.textChannelId,
            deaf: true,
            defaultVolume: 65,
        }).catch(() => null); // Catch errors silently
    } catch (error) {
        console.error(`Rejoin failed for ${guildId}:`, error);
    }
}

function clearNoSongAddedTimeout(guildId: string) {
    const timeout = noSongAddedTimeouts.get(guildId);
    if (timeout) {
        clearTimeout(timeout);
        noSongAddedTimeouts.delete(guildId);
    }
}

function startNoSongAddedTimeout(client: any, guildId: string) {
    clearNoSongAddedTimeout(guildId);

    const timeout = setTimeout(() => {
        try {
            if (isTwentyFourSevenEnabled(guildId)) return;

            const player = client.aqua.players.get(guildId);
            if (!player || player.playing) return;

            if (player.textChannel) {
                const embed = new Embed()
                    .setColor(0)
                    .setDescription("No song added in 10 minutes, disconnecting...\nUse `/24_7` to keep me in voice channel.")
                    .setFooter({ text: "Automatically destroying player" });

                client.messages.write(player.textChannel, { embeds: [embed] })
                    .then(msg => setTimeout(() => msg?.delete().catch(() => null), 10000))
                    .catch(() => null);
            }

            player.destroy();
        } catch (error) {
            console.error(`Timeout error for ${guildId}:`, error);
        } finally {
            noSongAddedTimeouts.delete(guildId);
        }
    }, NO_SONG_ADDED_TIMEOUT);

    noSongAddedTimeouts.set(guildId, timeout);
}

export default createEvent({
    data: { name: "voiceStateUpdate", once: false },
    async run([newState, oldState], client) {
        if (!client.aqua?.players || !oldState?.guildId) return;

        const guildId = oldState.guildId;
        const player = client.aqua.players.get(guildId);

        // Register event listeners once
        if (!eventListenersRegistered) {
            registerEventListeners(client);
            eventListenersRegistered = true;
        }

        // Check if bot was disconnected
        const botDisconnected = (await oldState.member()).id === client.botId &&
            oldState.channelId &&
            !newState.channelId;

        // Handle 24/7 reconnection
        if (botDisconnected && isTwentyFourSevenEnabled(guildId)) {
            setTimeout(() => rejoinOnDestroy(client, guildId), RECONNECT_DELAY);
            return;
        }

        const botMember = await client.cache.guilds.get(guildId)?.members.fetch(client.botId).catch(() => null);
        const voiceChannel = botMember.voice().channel;

        if (!voiceChannel) return;

        const is247 = isTwentyFourSevenEnabled(guildId);
        const nonBots = voiceChannel.members.filter(m => !m.user.bot).size;

        if (nonBots === 0 && !is247) {
            if (player) startNoSongAddedTimeout(client, guildId);
        } else {
            clearNoSongAddedTimeout(guildId);
        }

        // Handle inactive players
        if (player && !player.playing && !player.paused && !is247) {
            startNoSongAddedTimeout(client, guildId);
        }
    }
});
