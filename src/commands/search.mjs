import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";

export const Command = {
    name: "search",
    description: "Search for a song",
    options: [{
        name: "query",
        description: "The song you want to search for",
        type: 3,
        required: true,
    }],
    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) {
            return interaction.reply({ 
                content: 'You must be in a voice channel!', 
                ephemeral: true 
            });
        }

        // Check existing connection using Collection#find for better performance
        const existingConnection = client.aqua.connections?.get(interaction.guildId);
        if (existingConnection?.channelId && vc.id !== existingConnection.channelId) {
            return interaction.reply({ 
                content: `I'm already in <#${existingConnection.channelId}>`, 
                ephemeral: true 
            });
        }

        let player;
        try {
            player = existingConnection || client.aqua.createConnection({
                guildId: interaction.guildId,
                voiceChannel: vc.id,
                textChannel: interaction.channel.id,
                deaf: true,
            });
        } catch (err) {
            console.error('Connection error:', err);
            return interaction.reply({ 
                content: 'Failed to create connection.', 
                ephemeral: true 
            });
        }

        const query = interaction.options.getString('query');
        let tracks;
        try {
            const result = await client.aqua.resolve({ 
                query, 
                requester: interaction.member 
            });
            tracks = result.tracks?.slice(0, 5);
            
            if (!tracks?.length) {
                return interaction.reply({ 
                    content: 'No results found.', 
                    ephemeral: true 
                });
            }
        } catch (err) {
            console.error('Query error:', err);
            return interaction.reply({ 
                content: 'Failed to search for tracks.', 
                ephemeral: true 
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('search-select')
            .setPlaceholder('Select a song')
            .addOptions(tracks.map(track => ({
                label: track.info.title.slice(0, 100),
                value: track.info.uri,
            })));

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('Search Results')
            .setDescription(`**Query:** ${query}`)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ 
                text: 'Kenium v2.4.0 | by mushroom0162', 
                iconURL: interaction.user.displayAvatarURL() 
            });

        const message = await interaction.reply({ 
            embeds: [embed], 
            components: [new ActionRowBuilder().addComponents(selectMenu)], 
            fetchReply: true 
        });

        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId === 'search-select',
            componentType: 3,
            time: 15000,
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: 'You are not allowed to use this.',
                    ephemeral: true
                })
            }
            const selectedTrack = tracks.find(
                track => track.info.uri === i.values[0]
            );

            if (!selectedTrack) {
                await i.update({ 
                    content: 'Track not found!', 
                    components: [], 
                    embeds: [] 
                });
                return;
            }

            await i.deferUpdate();
            player.queue.add(selectedTrack);

            await i.editReply({ 
                content: `Added **${selectedTrack.info.title}** to the queue`, 
                components: [], 
                embeds: [] 
            });

            if (!player.playing && !player.paused && player.queue.size > 0) {
                player.play();
            }
        });

        collector.on('end', () => {
            if (!message.deleted) {
                message.delete().catch(() => null);
            }
            collector.removeAllListeners();
        });

        // Cleanup on command completion
        return () => {
            collector.stop();
            if (!message.deleted) {
                message.delete().catch(() => null);
            }
        };
    }
};
