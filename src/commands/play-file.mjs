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
                ephemeral: true
            });
        }

        const currentVoiceChannel = guild.channels.cache.find(
            channel => channel.type === 2 && channel.members.has(client.user.id)
          );
    
          if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
            return interaction.reply({
              content: `I'm already in <#${currentVoiceChannel.id}>`,
              ephemeral: true
            });
          }
          

        const player = client.aqua.players.get(guild.id) || client.aqua.createConnection({
            guildId: guild.id,
            voiceChannel: voiceChannel.id,
            textChannel: channel.id,
            deaf: true,
        });

        const file = interaction.options.getAttachment("file");
        if (!file) {
            return interaction.reply({
                content: "You must provide a file",
                ephemeral: true,
            });
        }

        try {
            const result = await client.aqua.resolve({
                query: file.url,
                requester: interaction.user
            });

            if (result.tracks.length) {
                player.queue.add(result.tracks[0]);
                await interaction.reply({
                    content: `Added \`${result.tracks[0].info.title}\` to the queue.`,
                    ephemeral: true,
                });

                if (!player.playing && player.queue.size > 0) {
                    player.play(); // Assuming this does not return a promise
                }
            } else {
                return interaction.reply({
                    content: "No tracks found.",
                    ephemeral: true,
                });
            }
        } catch (error) {
            console.error('Error processing the file:', error);
            return interaction.reply({
                content: "There was an error processing the file: " + error.message,
                ephemeral: true,
            });
        }
    },
};
