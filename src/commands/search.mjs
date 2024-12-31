import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, InteractionCollector, ComponentType } from "discord.js";

export const Command = {
    name: "search",
    description: "Search for a song",
    options: [
        {
            name: "query",
            description: "The song you want to search for",
            type: 3,
            required: true,
        },
    ],
    run: async (client, interaction) => {
        const query = interaction.options.getString('query');
        const vc = interaction.member?.voice?.channel;

        if (!vc) {
            return interaction.reply({ content: 'You need to be in a voice channel to use this command.', ephemeral: true });
        }

        let player;
        try {
            player = client.aqua.createConnection({
                guildId: interaction.guildId,
                voiceChannel: vc.id,
                textChannel: interaction.channel.id,
                deaf: true,
            });
        } catch (error) {
            return interaction.reply({ content: 'Failed to create connection.', ephemeral: true });
        }

        let result;
        try {
            result = await client.aqua.resolve({ query, requester: interaction.member });
        } catch (error) {
            return interaction.reply({ content: 'Error resolving query.', ephemeral: true });
        }

        const tracks = result.tracks;
        if (!tracks.length) {
            return interaction.reply({ content: 'No results found for your query.', ephemeral: true });
        }

        const limitedTracks = tracks.slice(0, 5);
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('search-select')
            .setPlaceholder('Select a song')
            .setMaxValues(1)
            .setMinValues(1);

        const trackLookup = {};
        for (const track of limitedTracks) {
            selectMenu.addOptions({
                label: track.info.title,
                value: track.info.uri,
            });
            trackLookup[track.info.uri] = track;
        }

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('Search Results')
            .setDescription(`**Query:** ${query}`)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Kenium v2.4.0 | by mushroom0162', iconURL: interaction.user.displayAvatarURL() });

        const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        const collector = new InteractionCollector(client, {
            channelId: interaction.channel.id,
            message: message,
            componentType: ComponentType.StringSelect,
            time: 15000,
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) return;
            if (i.customId === 'search-select') {
                await i.deferUpdate();
                const selectedTrackUri = i.values[0];
                const selectedTrack = trackLookup[selectedTrackUri];

                if (selectedTrack) {
                    player.queue.add(selectedTrack);
                    await i.editReply({ content: `Added **${selectedTrack.info.title}** to the queue`, components: [] });
                    if (!player.playing && !player.paused && player.queue.size > 0) {
                        player.play();
                    }
                } else {
                    await i.editReply({ content: 'Track not found!', components: [] });
                }
            }
        });

        collector.on('end', async () => {
            try {
                await message.delete();
                collector.stop();
                trackLookup = null;
            } catch (e) {
                // ignore
            }
        });
    }
};
