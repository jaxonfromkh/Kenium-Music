import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "queue",
    description: "Manage the music queue",
    options: [
        {
            name: "show",
            description: "Show the current queue",
            type: 1, 
        },
        {
            name: "remove",
            description: "Remove a track from the queue",
            type: 1,
            options: [
                {
                    name: "track_number",
                    description: "The number of the track to remove",
                    type: 4, 
                    required: true,
                    autocomplete: true,
                },
            ],
        },
        {
            name: "clear",
            description: "Clear the entire queue",
            type: 1,
        },
    ],
    async autocomplete(client, interaction) {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || player.queue.length === 0) {
            return interaction.respond([]);
        }
        const focusedValue = interaction.options.getFocused();
        const choices = player.queue.map((track, index) => {
            const choiceName = `${index + 1}: ${track.info.title}`;
            return {
                name: choiceName.length <= 100 ? choiceName : choiceName.substring(0, 100),
                value: index + 1,
            };
        });

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase()));
        return interaction.respond(filtered);
    },
    run: async (client, interaction) => {
        const guildId = interaction.guildId;
        const player = client.aqua.players.get(guildId);
        if (!player) {
            return interaction.reply({ content: "Nothing is playing", flags: 64 });
        }
        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
            return interaction.reply({ content: "You need to be in the same voice channel as the bot.", flags: 64 });
        }

        const subcommand = interaction.options.getSubcommand();
        const queueLength = player.queue.length;

        switch (subcommand) {
            case "show":
                if (queueLength === 0) {
                    return interaction.reply({ content: "Queue is empty", flags: 64 });
                }
                const queue = player.queue.slice(0, 5).map((track, i) => {
                    const minutes = Math.floor(track.info.length / 60000);
                    const seconds = Math.floor((track.info.length % 60000) / 1000);
                    return `**${i + 1}** - [\`${track.info.title}\`](${track.info.uri}) - \`${minutes}:${seconds.toString().padStart(2, '0')}\``;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle('🎵  | Queue')
                    .setDescription(queue)
                    .setColor(0x000000)
                    .setThumbnail(client.user.displayAvatarURL())
                    .setFooter({ text: 'Kenium v2.5.0 | by mushroom0162', iconURL: interaction.user.displayAvatarURL() });

                return interaction.reply({ embeds: [embed] });

            case "remove":
                const trackNumber = interaction.options.getInteger("track_number");
                if (trackNumber < 1 || trackNumber > queueLength) {
                    return interaction.reply({ content: "Invalid track number.", flags: 64 });
                }
                const removedTrack = player.queue.splice(trackNumber - 1, 1); 
                return interaction.reply({ content: `Removed track: \`${removedTrack[0].info.title}\``, flags: 64 });

            case "clear":
                player.queue.clear();
                return interaction.reply({ content: "Cleared the queue.", flags: 64 });

            default:
                return interaction.reply({ content: "Unknown command.", flags: 64 });
        }
    }
};
