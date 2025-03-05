import { EmbedBuilder } from "discord.js";

const DISCONNECTION_COOLDOWN = 120000;
const PLAYER_DESTROY_TIMEOUT = 30000;
const COOLDOWN_CLEANUP_INTERVAL = 180000;

const disconnectionCooldowns = new Map();

export const Event = {
    name: "voiceStateUpdate",
    runOnce: false,
    async run(client, oldState, newState) {
        const guildId = oldState.guild.id;
        const player = client.aqua.players.get(guildId);
        if (!player) return;
        if (oldState.channelId && !newState.channelId) {
            const now = Date.now();
            const lastDisconnection = disconnectionCooldowns.get(guildId) || 0;
            if (now - lastDisconnection < DISCONNECTION_COOLDOWN) {
                console.warn(`Anti spam: ${guildId}`);
                return;
            }
            try {
                const textChannel = await client.channels.fetch(player.textChannel).catch(() => null);
                if (!textChannel) {
                    console.warn(`No text channel found for guild: ${guildId}`);
                    player.destroy();
                    return;
                }
                if (!player.playing) { 
                    const dis = new EmbedBuilder()
                        .setColor("Red")
                        .setDescription("No music detected, disconnecting...")
                        .setFooter({ text: "Automatically destroying player in 30 seconds" });
                    const message = await textChannel.send({ embeds: [dis] });
                    disconnectionCooldowns.set(guildId, now);
                    
                    if (disconnectionCooldowns.size > 100) {
                        for (const [key, timestamp] of disconnectionCooldowns.entries()) {
                            if (now - timestamp > COOLDOWN_CLEANUP_INTERVAL) {
                                disconnectionCooldowns.delete(key);
                            }
                        }
                    }   
                    
                    await Promise.race([
                        new Promise(resolve => setTimeout(resolve, PLAYER_DESTROY_TIMEOUT)),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), PLAYER_DESTROY_TIMEOUT + 5000))
                    ]);
                    await Promise.allSettled([
                        message.delete().catch(() => { }),
                        player.destroy()
                    ]);
                }
            } catch (error) {
                console.error(`Voice state update error in guild ${guildId}:`, error);
                try {
                    player.destroy();
                } catch (destroyError) {
                    console.error(`Fallback player destruction failed:`, destroyError);
                }
            }
        }
    },
};
