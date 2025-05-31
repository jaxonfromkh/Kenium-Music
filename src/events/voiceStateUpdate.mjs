import { EmbedBuilder } from "discord.js";
import { isTwentyFourSevenEnabled, getChannelIds } from "../utils/db_helper.mjs";

const NO_SONG_ADDED_TIMEOUT = 180000; // 3 minutes
const noSongAddedTimeouts = new Map();
let eventListenersRegistered = false;

export const Event = {
    name: "voiceStateUpdate",
    runOnce: false,
    async run(client, oldState, newState) {
        if (!client?.aqua?.players || !oldState?.guild?.id) return;

        const guildId = oldState.guild.id;
        const player = client.aqua.players.get(guildId);
        const botMember = oldState.guild.members.me;    

        if (!eventListenersRegistered) {
            registerEventListeners(client);
            eventListenersRegistered = true;
        }

        if (!player || !botMember?.voice?.channelId || 
            (oldState.id === client.user.id && oldState.channelId && !newState.channelId)) {
            await checkAndRejoin(client, guildId);
            return;
        }

        const voiceChannel = botMember.voice.channel;
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
    },
};

function registerEventListeners(client) {
    const aqua = client.aqua;
    
    aqua.on('trackStart', (player) => {
        clearNoSongAddedTimeout(player.guild);
    });
    
    aqua.on('queueEnd', (player) => {
        if (!isTwentyFourSevenEnabled(player.guild)) {
            startNoSongAddedTimeout(client, player.guild, player);
        }
    });
    
    aqua.on('playerDestroy', async (player) => {
        if (!player?.guild || !player?.voiceChannel || !player?.textChannel) return;
        await rejoinOnDestroy(client, player.guild, player.voiceChannel, player.textChannel);
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

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`Guild ${guildId} not found`);
            return;
        }

        const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);
        if (!voiceChannel?.joinable) {
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
            if (textChannel?.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(0)
                    .setDescription("No song added in 3 minutes, disconnecting...\nUse the `/24_7` command to keep the bot in voice channel.")
                    .setFooter({ text: "Automatically destroying player" });

                const message = await textChannel.send({ embeds: [embed] }).catch(() => null);
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
