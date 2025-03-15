import { EmbedBuilder } from "discord.js";
const NO_SONG_ADDED_TIMEOUT = 180000;
const noSongAddedTimeouts = new Map();

export const Event = {
    name: "voiceStateUpdate",
    runOnce: false,
    async run(client, oldState, newState) {
        if (!client || !oldState || !oldState.guild) return;
        
        const guildId = oldState.guild.id;
        if (!guildId) return;
        
        const player = client.aqua?.players?.get(guildId);
        if (!player) return;

        const botVoiceChannel = player.voiceChannel;
        const botMember = oldState.guild.members.cache.get(client.user.id);
        if (!botMember || !botVoiceChannel) return;
        
        const botVoiceState = botMember.voice;
        if (!botVoiceState?.channelId || botVoiceState.channelId !== botVoiceChannel) {
            return player.destroy();
        }
        
        const voiceChannel = botMember.voice.channel;
        if (voiceChannel && voiceChannel.members.filter(m => !m.user.bot).size === 0) {
            startNoSongAddedTimeout();
        }

        const clearNoSongAddedTimeout = () => {
            if (noSongAddedTimeouts.has(guildId)) {
                clearTimeout(noSongAddedTimeouts.get(guildId));
                noSongAddedTimeouts.delete(guildId);
                console.log(`[Music] Cleared disconnect timeout for guild ${guildId}`);
            }
        };

        const startNoSongAddedTimeout = async () => {
            clearNoSongAddedTimeout();
            console.log(`[Music] Starting disconnect timeout for guild ${guildId}`);
            
            noSongAddedTimeouts.set(guildId, setTimeout(async () => {
                try {
                    const currentPlayer = client.aqua?.players?.get(guildId);
                    if (!currentPlayer) return;
                    
                    if (!currentPlayer.textChannel) return currentPlayer.destroy();
                    
                    const textChannel = await client.channels.fetch(currentPlayer.textChannel).catch(() => null);
                    if (textChannel && textChannel.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setColor(0)
                            .setDescription("No song added in 3 minutes, disconnecting...\nNote: 24/7 command is being developed.")
                            .setFooter({ text: "Automatically destroying player" });
                            
                        const message = await textChannel.send({ embeds: [embed] }).catch(err => {
                            console.error(`[Music] Failed to send disconnect message: ${err.message}`);
                            return null;
                        });
                        
                        if (message) {
                            setTimeout(() => {
                                message.delete().catch(err => {
                                    console.error(`[Music] Failed to delete message: ${err.message}`);
                                });
                            }, 10000);
                        }
                    }
                    
                    currentPlayer.destroy();
                    console.log(`[Music] Player destroyed due to inactivity in guild ${guildId}`);
                } catch (error) {
                    console.error(`[Music] Error in disconnect timeout handler: ${error.message}`);
                }
            }, NO_SONG_ADDED_TIMEOUT));
        };

        if (!client.aqua._eventListenersRegistered) {
            client.aqua.on('trackStart', () => {
                clearNoSongAddedTimeout();
                console.log(`[Music] Track started, cleared disconnect timeout for guild ${guildId}`);
            });
            
            client.aqua.on('queueEnd', () => {
                startNoSongAddedTimeout();
                console.log(`[Music] Queue ended, starting disconnect timeout for guild ${guildId}`);
            });
            
            client.aqua._eventListenersRegistered = true;
        }

        if (player && !player.playing && !player.paused) {
            startNoSongAddedTimeout();
        }
    },
};
