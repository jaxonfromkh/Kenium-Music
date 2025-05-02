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

        if (!eventListenersRegistered) {
            registerEventListeners(client);
        }

        if (!player) {
            await checkAndRejoin(client, guildId);
            return;
        }

        const botMember = oldState.guild.members.cache.get(client.user?.id);
        if (!botMember?.voice?.channelId) {
            await checkAndRejoin(client, guildId);
            return;
        }

        if (oldState.id === client.user.id && oldState.channelId && !newState.channelId) {
            await checkAndRejoin(client, guildId);
            return;
        }

        const voiceChannel = botMember.voice.channel;
        if (voiceChannel && voiceChannel.members.filter(m => !m.user.bot).size === 0) {
            const is247Enabled = isTwentyFourSevenEnabled(guildId);
            
            if (!is247Enabled) {
                startNoSongAddedTimeout(client, guildId, player);
            }
        } else {
            clearNoSongAddedTimeout(guildId);
        }

        if (player && !player.playing && !player.paused) {
            const is247Enabled = isTwentyFourSevenEnabled(guildId);
            
            if (!is247Enabled) {
                startNoSongAddedTimeout(client, guildId, player);
            }
        } else if (player && player.playing) {
            clearNoSongAddedTimeout(guildId);
        }
    },
};

function registerEventListeners(client) {
    client.aqua.on('trackStart', (player) => {
        clearNoSongAddedTimeout(player.guild);
    });
    
    client.aqua.on('queueEnd', (player) => {
        const is247Enabled = isTwentyFourSevenEnabled(player.guild);
        
        if (!is247Enabled) {
            startNoSongAddedTimeout(client, player.guild, player);
        }
    });
    
    client.aqua.on('playerDestroy', async (player) => {
        await rejoinOnDestroy(client, player.guild, player.voiceChannel, player.textChannel);
    });
    
    eventListenersRegistered = true;
}

async function rejoinOnDestroy(client, guildId, voiceChannelId, textChannelId) {
    try {
        const is247Enabled = isTwentyFourSevenEnabled(guildId);
        
        if (is247Enabled) {
            let player = client.aqua.players.get(guildId);
            
            if (!player) {
                if (!voiceChannelId || !textChannelId) {
                    const channelIds = getChannelIds(guildId);
                    if (channelIds) {
                        voiceChannelId = channelIds.voiceChannelId;
                        textChannelId = channelIds.textChannelId;
                    } else {
                        console.error(`No channel IDs found for guild ${guildId}`);
                        return;
                    }
                }
                
                const guild = client.guilds.cache.get(guildId);
                if (!guild) {
                    console.error(`Guild ${guildId} not found`);
                    return;
                }
                
                const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);
                if (!voiceChannel) {
                    console.error(`Voice channel ${voiceChannelId} not found in guild ${guildId}`);
                    return;
                }
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                player = await client.aqua.createConnection({
                    guildId: guildId,
                    voiceChannel: voiceChannelId,
                    textChannel: textChannelId,
                    deaf: true,
                    defaultVolume: 65,
                });
            }
        }
    } catch (error) {
        console.error(`Failed to rejoin voice channel in guild ${guildId}:`, error);
    }
}

async function checkAndRejoin(client, guildId) {
    const is247Enabled = isTwentyFourSevenEnabled(guildId);
    
    if (is247Enabled) {
        const channelIds = getChannelIds(guildId);
        if (channelIds) {
            await rejoinOnDestroy(client, guildId, channelIds.voiceChannelId, channelIds.textChannelId);
        } else {
            console.error(`No channel IDs found for guild ${guildId} despite 24/7 mode being enabled`);
        }
    }
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
    
    noSongAddedTimeouts.set(guildId, setTimeout(async () => {
        try {
            const is247Enabled = isTwentyFourSevenEnabled(guildId);
            
            if (is247Enabled) {
                clearNoSongAddedTimeout(guildId);
                return;
            }
            
            const currentPlayer = client.aqua?.players?.get(guildId);
            if (!currentPlayer) return;
            
            if (currentPlayer.playing) {
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
                    setTimeout(() => {
                        message.delete().catch(() => {});
                    }, 10000);
                }
            }
            
            currentPlayer.destroy();
        } catch (error) {
            console.error(`Error in timeout handler for guild ${guildId}:`, error);
            if (client.aqua?.players?.get(guildId)) {
                client.aqua.players.get(guildId).destroy();
            }
        }
    }, NO_SONG_ADDED_TIMEOUT));
}
