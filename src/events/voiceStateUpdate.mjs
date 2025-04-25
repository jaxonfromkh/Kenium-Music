import { EmbedBuilder } from "discord.js";
import { isTwentyFourSevenEnabled } from "../commands/247.mjs";

const NO_SONG_ADDED_TIMEOUT = 180000; // 3 minutes
const noSongAddedTimeouts = new Map();

export const Event = {
    name: "voiceStateUpdate",
    runOnce: false,
    async run(client, oldState, newState) {
        if (!client?.aqua?.players || !oldState?.guild?.id) return;
        
        const guildId = oldState.guild.id;
        const player = client.aqua.players.get(guildId);
        if (!player) return;

        const botMember = oldState.guild.members.cache.get(client.user?.id);
        if (!botMember?.voice?.channelId) return;
        
        const botVoiceChannel = player.voiceChannel;
        if (!botVoiceChannel || botMember.voice.channelId !== botVoiceChannel) {
            return player.destroy();
        }
        
        if (!client.aqua._eventListenersRegistered) {
            registerEventListeners(client);
        }
        
        const voiceChannel = botMember.voice.channel;
        if (voiceChannel && voiceChannel.members.filter(m => !m.user.bot).size === 0) {
            if (!isTwentyFourSevenEnabled(guildId)) {
                startNoSongAddedTimeout(client, guildId, player);
            }
        } else {
            clearNoSongAddedTimeout(guildId);
        }

        if (player && !player.playing && !player.paused && !isTwentyFourSevenEnabled(guildId)) {
            startNoSongAddedTimeout(client, guildId, player);
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
        if (!isTwentyFourSevenEnabled(player.guild)) {
            startNoSongAddedTimeout(client, player.guild, player);
        }
    });
    
    client.aqua._eventListenersRegistered = true;
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
            if (isTwentyFourSevenEnabled(guildId)) {
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
                    .setDescription("No song added in 3 minutes, disconnecting...\nUse the `/24/7` command to keep the bot in voice channel.")
                    .setFooter({ text: "Automatically destroying player" });
                    
                const message = await textChannel.send({ embeds: [embed] }).catch(() => null);
                
                if (message) {
                    setTimeout(() => {
                        message.delete().catch(() => {});
                    }, 10000);
                }
            }
            
            currentPlayer.destroy();
        } catch {
            if (client.aqua?.players?.get(guildId)) {
                client.aqua.players.get(guildId).destroy();
            }
        }
    }, NO_SONG_ADDED_TIMEOUT));
}