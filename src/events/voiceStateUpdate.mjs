import { EmbedBuilder } from "discord.js";
const NO_SONG_ADDED_TIMEOUT = 1800000;
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
                const textChannel = await client.channels.fetch(player.textChannel).catch(() => null);
                if (textChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0)
                        .setDescription("No song added in 3 minutes, disconnecting...\n Note: 24/7 command is beign developed.")
                        .setFooter({ text: "Automatically destroying player" });
                    const message = await textChannel.send({ embeds: [embed] }).catch(console.error);
                    if (message) {
                        setTimeout(() => {
                            message.delete().catch(console.error);
                        }, 10000);
                    }
                }
                player.destroy();
            }, NO_SONG_ADDED_TIMEOUT));
        };

        if (!client.aqua.trackStartListener) {
            client.aqua.on('trackStart', clearNoSongAddedTimeout);
            client.aqua.trackStartListener = true;
        }

        if (!client.aqua.queueEndListener) {
            client.aqua.on('queueEnd', startNoSongAddedTimeout);
            client.aqua.queueEndListener = true;
        }

        if (!player.playing) {
            startNoSongAddedTimeout();
        }
    },
};
