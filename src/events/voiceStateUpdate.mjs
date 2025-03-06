import { EmbedBuilder } from "discord.js";
const NO_SONG_ADDED_TIMEOUT = 180000;
const noSongAddedTimeouts = new Map();
export const Event = {
    name: "voiceStateUpdate",
    runOnce: false,
    async run(client, oldState) {
        const guildId = oldState.guild.id;
        const player = client.aqua.players.get(guildId);
        if (!player) return;
        const clearNoSongAddedTimeout = () => {
            if (noSongAddedTimeouts.has(guildId)) {
                clearTimeout(noSongAddedTimeouts.get(guildId));
                noSongAddedTimeouts.delete(guildId);
            }
        };
        const startNoSongAddedTimeout = async () => {
            clearNoSongAddedTimeout();
            noSongAddedTimeouts.set(guildId, setTimeout(async () => {
                const textChannelId = player.textChannel;
                const textChannel = await client.channels.fetch(textChannelId).catch(() => null);
                if (textChannel) {
                    const dis = new EmbedBuilder()
                        .setColor("Red")
                        .setDescription("No song added in 3 minutes, disconnecting...")
                        .setFooter({ text: "Automatically destroying player" });
                    await textChannel.send({ embeds: [dis] }).catch(err => console.error(`Failed to send message:`, err));
                }
                player.destroy();
            }, NO_SONG_ADDED_TIMEOUT));
        };
        if (!client.aqua.trackStartListener) {
            client.aqua.on('trackStart', () => {
                clearNoSongAddedTimeout();
            });
            client.aqua.trackStartListener = true;
        }
        if (!client.aqua.queueEndListener) {
            client.aqua.on('queueEnd', () => {
                startNoSongAddedTimeout();
            });
            client.aqua.queueEndListener = true;
        }
        if (!player.playing) {
            startNoSongAddedTimeout();
        }
    },
};
