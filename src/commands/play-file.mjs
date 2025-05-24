export const Command = {
    name: "play-file",
    description: "Play a song from a file.",
    options: [
        {
            name: "file",
            description: "The file to play",
            type: 11,
            required: true,
        },
    ],
    run: async (client, interaction) => {
        const { guild, member, channel } = interaction;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: 'You must be in a voice channel to use this command.',
                flags: 64
            });
        }

        // Use cache.get instead of find for better performance
        const currentVoiceChannel = guild.channels.cache.find(
            ch => ch.type === 2 && ch.members.has(client.user.id)
        );

        if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
            return interaction.reply({
                content: `I'm already in <#${currentVoiceChannel.id}>`,
                flags: 64
            });
        }

        // Prefer nullish coalescing for fallback
        let player = client.aqua.players.get(guild.id) ?? client.aqua.createConnection({
            guildId: guild.id,
            voiceChannel: voiceChannel.id,
            textChannel: channel.id,
            deaf: true,
            defaultVolume: 65,
        });

        const file = interaction.options.getAttachment("file");
        if (!file) {
            return interaction.reply({
                content: "You must provide a file",
                flags: 64,
            });
        }

        try {
            const result = await client.aqua.resolve({
                query: file.url,
                requester: interaction.user
            });

            const track = result.tracks?.[0];
            if (!track) {
                return interaction.reply({
                    content: "No tracks found.",
                    flags: 64,
                });
            }

            player.queue.add(track);
            await interaction.reply({
                content: `Added \`${track.info.title}\` to the queue.`,
                flags: 64,
            });

            if (!player.playing && !player.paused) {
                player.play();
            }
        } catch (error) {
            console.error('Error processing the file:', error);
            return interaction.reply({
                content: `There was an error processing the file: ${error?.message || 'unknown error'}`,
                flags: 64,
            });
        }
    },
};
