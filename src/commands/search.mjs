import { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const CONSTANTS = {
    COLLECTOR_TIMEOUT: 15000,
    MAX_TRACKS: 5,
    COLORS: {
        YOUTUBE: 0xFF0000,
        SOUNDCLOUD: 0xFF5500
    },
    EMOJIS: {
        youtube: '<:youtube:1326226014489149551>',
        soundcloud: '<:soundcloud:1326225982427758753>'
    },
    PLATFORMS: {
        YOUTUBE: {
            name: 'YouTube',
            source: 'ytsearch'
        },
        SOUNDCLOUD: {
            name: 'SoundCloud',
            source: 'scsearch'
        }
    }
};

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
        const validationError = await validateVoiceConnection(client, interaction);
        if (validationError) return validationError;
        const player = await initializePlayer(client, interaction);
        const query = interaction.options.getString('query');

        const initialSearchResult = await performSearch(client, query, CONSTANTS.PLATFORMS.YOUTUBE, interaction);
        if (!initialSearchResult.success) return initialSearchResult.response;
        const messageComponents = await createInitialMessage(
            client, 
            interaction, 
            query, 
            initialSearchResult.tracks, 
            CONSTANTS.PLATFORMS.YOUTUBE.name.toLowerCase()
        );

        setupInteractionCollector(
            messageComponents.message,
            interaction,
            player,
            query,
            client,
            initialSearchResult.tracks
        );
    }
};


async function validateVoiceConnection(client, interaction) {
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

    return null;
}

async function initializePlayer(client, interaction) {
    const existingConnection = client.aqua.connections?.get(interaction.guildId);
    return existingConnection || client.aqua.createConnection({
        guildId: interaction.guildId,
        voiceChannel: interaction.member.voice.channel.id,
        textChannel: interaction.channel.id,
        deaf: true,
    });
}

async function performSearch(client, query, platform, interaction) {
    try {
        const tracks = await searchTracks(client, query, platform.source, interaction.member);
        if (!tracks.length) {
            return {
                success: false,
                response: interaction.reply({
                    content: `No results found on ${platform.name}.`,
                    ephemeral: true
                })
            };
        }
        return { success: true, tracks };
    } catch (error) {
        console.error(`Search error:`, error);
        return {
            success: false,
            response: interaction.reply({
                content: `Failed to search on ${platform.name}.`,
                ephemeral: true
            })
        };
    }
}

async function searchTracks(client, query, source, requester) {
    const result = await client.aqua.resolve({ query, source, requester });
    return result.tracks?.slice(0, CONSTANTS.MAX_TRACKS) || [];
}

function createPlatformButtons() {
    return new ActionRowBuilder().addComponents(
        Object.entries(CONSTANTS.PLATFORMS).map(([platform, data]) => 
            new ButtonBuilder()
                .setCustomId(`search_${platform.toLowerCase()}`)
                .setLabel(`${data.name} ${platform === 'YOUTUBE' ? '📺' : '🎵'}`)
                .setStyle(ButtonStyle.Primary)
        )
    );
}

function createSongSelectionButtons(tracks, platform) {
    return new ActionRowBuilder().addComponents(
        tracks.map((_, index) => 
            new ButtonBuilder()
                .setCustomId(`select_song_${index + 1}_${platform}`)
                .setLabel(`${index + 1}`)
                .setStyle(ButtonStyle.Secondary)
        )
    );
}

function createEmbed(title, query, tracks, client, interaction, source) {
    const color = title.includes(CONSTANTS.PLATFORMS.YOUTUBE.name) 
        ? CONSTANTS.COLORS.YOUTUBE 
        : CONSTANTS.COLORS.SOUNDCLOUD;

    const trackListMarkdown = tracks
        .map((track, index) => 
            `${index + 1}. ${CONSTANTS.EMOJIS[source]} [\`${track.info.title}\`](${track.info.uri})`
        )
        .join('\n');

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`**Query:** \`${query}\`\n\n${trackListMarkdown}`)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ 
            text: `Results from ${title.split(' ')[0]}.`, 
            iconURL: interaction.user.displayAvatarURL() 
        });
}

async function createInitialMessage(client, interaction, query, tracks, platform) {
    const buttonRow = createPlatformButtons();
    const message = await interaction.reply({
        embeds: [createEmbed(
            `${CONSTANTS.PLATFORMS.YOUTUBE.name} Search Results`,
            query,
            tracks,
            client,
            interaction,
            platform
        )],
        components: [createSongSelectionButtons(tracks, platform), buttonRow],
        fetchReply: true
    });

    return { message, tracks };
}

function setupInteractionCollector(message, interaction, player, query, client, tracksRef) {
    const collector = message.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: CONSTANTS.COLLECTOR_TIMEOUT
    });

    collector.on('collect', async (i) => handleInteraction(i, client, query, tracksRef, player));

    collector.on('end', async () => {
        if (!message.deleted) {
            await message.delete().catch(() => {});
        }
    });
}

async function handleInteraction(interaction, client, query, tracksRef, player) {
    await interaction.deferUpdate();

    if (interaction.customId.startsWith('select_song_')) {
        await handleSongSelection(interaction, tracksRef, player);
    } else {
        await handlePlatformSwitch(interaction, client, query, tracksRef);
    }
}

async function handleSongSelection(interaction, tracksRef, player) {
    const [_, __, indexStr] = interaction.customId.split('_');
    const songIndex = parseInt(indexStr) - 1;
    const selectedTrack = tracksRef[songIndex];

    if (!selectedTrack) {
        return await interaction.followUp({
            content: 'Track not found!',
            ephemeral: true
        });
    }

    player.queue.add(selectedTrack);
    await interaction.followUp({
        content: `Added **${selectedTrack.info.title}** to the queue`,
        ephemeral: true
    });

    if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
    }
}

async function handlePlatformSwitch(interaction, client, query, tracksRef) {
    const platform = interaction.customId.split('_')[1];
    const platformConfig = platform === 'soundcloud' 
        ? CONSTANTS.PLATFORMS.SOUNDCLOUD 
        : CONSTANTS.PLATFORMS.YOUTUBE;

    try {
        const searchResult = await performSearch(client, query, platformConfig, interaction);
        if (!searchResult.success) return;

        const updatedEmbed = createEmbed(
            `${platformConfig.name} Search Results`,
            query,
            searchResult.tracks,
            client,
            interaction,
            platform
        );

        const components = [
            createSongSelectionButtons(searchResult.tracks, platform),
            createPlatformButtons()
        ];

        await interaction.message.edit({ embeds: [updatedEmbed], components });
        
        tracksRef.length = 0;
        tracksRef.push(...searchResult.tracks);
    } catch (err) {
        await handleError(err, platformConfig.name, interaction);
    }
}

function handleError(err, source, interaction) {
    console.error(`${source} search error:`, err);
    return interaction.followUp({
        content: `Failed to search for tracks on ${source}.`,
        ephemeral: true
    });
}
