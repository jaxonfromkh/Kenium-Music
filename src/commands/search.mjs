import { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const Command = {
    name: "search",
    description: "Search for a song",
    options: [
        {
            name: "query",
            description: "The song you want to search for",
            type: 3,
            required: true
        }
    ],
    async run(client, interaction) {
        const vc = interaction.member?.voice?.channel;
        if (!vc) {
            return interaction.reply({
                content: 'You must be in a voice channel!',
                ephemeral: true
            });
        }

        const existingConnection = client.aqua.connections?.get(interaction.guildId);
        if (existingConnection?.channelId && vc.id !== existingConnection.channelId) {
            return interaction.reply({
                content: `I'm already in <#${existingConnection.channelId}>`,
                ephemeral: true
            });
        }

        const player = existingConnection || client.aqua.createConnection({
            guildId: interaction.guildId,
            voiceChannel: vc.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });

        const query = interaction.options.getString('query');
        const tracks = await searchTracks(client, query, 'ytsearch', interaction.member);
        if (!tracks.length) {
            return interaction.reply({
                content: 'No results found on YouTube.',
                ephemeral: true
            });
        }

        const buttonRow = createPlatformButtons();
        const embed = createEmbed('YouTube Search Results', query, tracks, client, interaction);
        const message = await interaction.reply({
            embeds: [embed],
            components: [buttonRow, createSongSelectionButtons(tracks)],
            fetchReply: true
        });

        const filter = (i) => i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 15000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            const subCommand = i.customId.split('_')[1];

            if (i.customId.startsWith('select_song_')) {
                const songIndex = parseInt(i.customId.split('_')[2]) - 1;
                const selectedTrack = tracks[songIndex];
                if (!selectedTrack) {
                    return await i.followUp({ content: 'Track not found!', ephemeral: true });
                }
                player.queue.add(selectedTrack);
                await i.followUp({ content: `Added **${selectedTrack.info.title}** to the queue`, ephemeral: true });
                if (!player.playing && !player.paused && player.queue.size > 0) {
                    player.play();
                }
            } else {
                try {
                    const source = subCommand === 'soundcloud' ? 'scsearch' : 'ytsearch';
                    const newTracks = await searchTracks(client, query, source, interaction.member);
                    if (!newTracks.length) {
                        return await i.followUp({ content: `No results found on ${subCommand.charAt(0).toUpperCase() + subCommand.slice(1)}.`, ephemeral: true });
                    }

                    const updatedEmbed = createEmbed(`${subCommand.charAt(0).toUpperCase() + subCommand.slice(1)} Search Results`, query, newTracks, client, interaction);
                    const updatedSongSelectionRow = createSongSelectionButtons(newTracks);
                    await message.edit({ embeds: [updatedEmbed], components: [buttonRow, updatedSongSelectionRow] });
                } catch (err) {
                    return handleError(err, subCommand.charAt(0).toUpperCase() + subCommand.slice(1), i);
                }
            }
        });

        collector.on('end', async () => {
            if (!message.deleted) {
                await message.delete();
            }
        });
    }
};

async function searchTracks(client, query, source, requester) {
    const result = await client.aqua.resolve({ query, source, requester });
    return result.tracks?.slice(0, 5) || [];
}

function handleError(err, source, interaction) {
    console.error(`${source} search error:`, err);
    return interaction.followUp({ content: `Failed to search for tracks on ${source}.`, ephemeral: true });
}

function createPlatformButtons() {
    const youtubeButton = new ButtonBuilder()
        .setCustomId('search_youtube')
        .setLabel('YouTube 📺')
        .setStyle(ButtonStyle.Primary);
    
    const soundcloudButton = new ButtonBuilder()
        .setCustomId('search_soundcloud')
        .setLabel('SoundCloud 🎵')
        .setStyle(ButtonStyle.Primary);
    
    return new ActionRowBuilder().addComponents(youtubeButton, soundcloudButton);
}

function createEmbed(title, query, tracks, client, interaction) {
    const color = title.includes('YouTube') ? 0xFF0000 : 0xFF5500;
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`**Query:** \`${query}\`\n\n` +
            tracks.map((track, index) => `${index + 1}. **${track.info.title}** - [Listen Here](${track.info.uri})`).join('\n'))
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: `Results from ${title.split(' ')[0]}.`, iconURL: interaction.user.displayAvatarURL(), color });
}

function createSongSelectionButtons(tracks) {
    return new ActionRowBuilder().addComponents(
        ...tracks.map((_, index) => new ButtonBuilder()
            .setCustomId(`select_song_${index + 1}`)
            .setLabel(`${index + 1}`)
            .setStyle(ButtonStyle.Secondary))
    );
}
