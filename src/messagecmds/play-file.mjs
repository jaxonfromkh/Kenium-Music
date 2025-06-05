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
    run: async (client, message) => { 
        const { guild, member, channel } = message;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            return message.reply({
                content: 'You must be in a voice channel to use this command.',
                flags: 64
            });
        }

        // Use cache.get instead of find for better performance
        const currentVoiceChannel = guild.channels.cache.find(
            ch => ch.type === 2 && ch.members.has(client.user.id)
        );

        if (currentVoiceChannel && voiceChannel.id !== currentVoiceChannel.id) {
            return message.reply({
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

        const file = message.options.getAttachment("file");
        if (!file) {
            return message.reply({
                content: "You must provide a file",
                flags: 64,
            });
        }

        try {
            // Await only what's necessary, avoid unnecessary awaits
            const result = await client.aqua.resolve({
                query: file.url,
                requester: message.author
            });

            const track = result.tracks?.[0];
            if (!track) {
                return message.reply({
                    content: "No tracks found.",
                    flags: 64,
                });
            }

            player.queue.add(track);
            await message.reply({
                content: `Added \`${track.info.title}\` to the queue.`,
                flags: 64,
            });

            if (!player.playing && !player.paused) {
                player.play();
            }
        } catch (error) {
            console.error('Error processing the file:', error);
            return message.reply({
                content: `There was an error processing the file: ${error?.message || 'unknown error'}`,
                flags: 64,
            });
        }
    },
};