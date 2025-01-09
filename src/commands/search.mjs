import { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Move constants outside to avoid recreation
const CONSTANTS = {
    COLLECTOR_TIMEOUT: 15000,
    MAX_TRACKS: 5,
    COLORS: {
        YOUTUBE: 0xFF0000,
        SOUNDCLOUD: 0xFF5500,
        SPOTIFY: 0x1DB954 
    },
    EMOJIS: {
        youtube: '<:youtube:1326295615017058304>',
        soundcloud: '<:soundcloud:1326295646818406486>',
        spotify: '<:spotify:1326702792269893752>'
    },
    PLATFORMS: {
        YOUTUBE: {
            name: 'YouTube',
            source: 'ytsearch',
            color: 0xFF0000,
            emoji: '<:youtube:1326295615017058304>',
            icon: '📺'
        },
        SOUNDCLOUD: {
            name: 'SoundCloud',
            source: 'scsearch',
            color: 0xFF5500,
            emoji: '<:soundcloud:1326295646818406486>',
            icon: '🎵'
        },
        SPOTIFY: {
            name: 'Spotify',
            source: 'spsearch',
            color: 0x1DB954,
            emoji: '<:spotify:1326702792269893752>',
            icon: '🎧'
        }
    }
};

// Pre-build button styles to avoid recreation
const BUTTON_STYLES = {
    platform: ButtonStyle.Primary,
    selection: ButtonStyle.Secondary
};

// Cache frequently used button builders
const platformButtons = new ActionRowBuilder().addComponents(
    Object.entries(CONSTANTS.PLATFORMS).map(([platform, data]) => 
        new ButtonBuilder()
            .setCustomId(`search_${platform.toLowerCase()}`)
            .setLabel(`${data.name} ${data.icon}`)
            .setStyle(BUTTON_STYLES.platform)
    )
);

export const Command = {
    name: "search",
    description: "Search for a song",
    options: [{
        name: "query",
        description: "The song you want to search for",
        type: 3,
        required: true
    }],
    async run(client, interaction) {
        // Quick validation checks
        const vc = interaction.member?.voice?.channel;
        if (!vc) {
            return interaction.reply({ content: 'You must be in a voice channel!', flags: 64 });
        }

        const existingConnection = client.aqua.connections?.get(interaction.guildId);
        if (existingConnection?.channelId && vc.id !== existingConnection.channelId) {
            return interaction.reply({
                content: `I'm already in <#${existingConnection.channelId}>`,
                flags: 64
            });
        }

        // Initialize player and search
        const player = existingConnection || await client.aqua.createConnection({
            guildId: interaction.guildId,
            voiceChannel: vc.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });

        const query = interaction.options.getString('query');
        const searchState = {
            tracks: [],
            currentPlatform: CONSTANTS.PLATFORMS.YOUTUBE
        };

        try {
            // Perform initial search
            const tracks = await searchTracks(client, query, searchState.currentPlatform.source, interaction.member);
            if (!tracks.length) {
                return interaction.reply({
                    content: `No results found on ${searchState.currentPlatform.name}.`,
                    flags: 64
                });
            }

            searchState.tracks = tracks;
            const message = await createSearchMessage(client, interaction, query, searchState);
            setupCollector(message, interaction, player, query, client, searchState);

        } catch (error) {
            console.error('Search error:', error);
            return interaction.reply({
                content: `Failed to search on ${searchState.currentPlatform.name}.`,
                flags: 64
            });
        }
    }
};

async function searchTracks(client, query, source, requester) {
    const result = await client.aqua.resolve({ query, source, requester });
    return result.tracks?.slice(0, CONSTANTS.MAX_TRACKS) || [];
}

function createSelectionButtons(tracks, platform) {
    return new ActionRowBuilder().addComponents(
        Array.from({ length: tracks.length }, (_, i) => 
            new ButtonBuilder()
                .setCustomId(`select_song_${i + 1}_${platform}`)
                .setLabel(`${i + 1}`)
                .setStyle(BUTTON_STYLES.selection)
        )
    );
}

function createEmbed(client, interaction, query, tracks, platform) {
    const trackListMarkdown = tracks
        .map((track, index) => 
            `${index + 1}. ${platform.emoji} [\`${track.info.title}\`](${track.info.uri})`
        )
        .join('\n');

    return new EmbedBuilder()
        .setColor(platform.color)
        .setTitle(`${platform.name} Search Results`)
        .setDescription(trackListMarkdown)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ 
            text: `Results from ${platform.name}`, 
            iconURL: interaction.user.displayAvatarURL() 
        });
}

async function createSearchMessage(client, interaction, query, searchState) {
    const embed = createEmbed(client, interaction, query, searchState.tracks, searchState.currentPlatform);
    const selectionButtons = createSelectionButtons(searchState.tracks, searchState.currentPlatform.name.toLowerCase());
    
    return interaction.reply({
        embeds: [embed],
        components: [selectionButtons, platformButtons],
    });
}

function setupCollector(message, interaction, player, query, client, searchState) {
    const collector = message.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: CONSTANTS.COLLECTOR_TIMEOUT
    });
    collector.on('collect', async (i) => {
        await i.deferUpdate();
        if (i.customId.startsWith('select_song_')) {
            const songIndex = parseInt(i.customId.split('_')[2]) - 1;
            const track = searchState.tracks[songIndex];
            if (track) {
                player.queue.add(track);
                await i.followUp({
                    content: `Added **${track.info.title}** to the queue`,
                    ephemeral: true // Only show to the user who selected
                });
                if (!player.playing && !player.paused && player.queue.size > 0) {
                    player.play();
                }
            }
        } else {
            const platformKey = i.customId.split('_')[1].toUpperCase();
            const platform = CONSTANTS.PLATFORMS[platformKey];
            try {
                const tracks = await searchTracks(client, query, platform.source, interaction.member);
                if (tracks.length) {
                    searchState.tracks = tracks;
                    searchState.currentPlatform = platform;
                    const embed = createEmbed(client, interaction, query, tracks, platform);
                    const selectionButtons = createSelectionButtons(tracks, platformKey.toLowerCase());
                    await message.edit({ embeds: [embed], components: [selectionButtons, platformButtons] });
                }
            } catch (err) {
                console.error(`${platform.name} search error:`, err);
                await i.followUp({
                    content: `Failed to search for tracks on ${platform.name}.`,
                    ephemeral: true // Only show to the user who triggered the error
                });
            }
        }
    });
    collector.on('end', () => {
        if (!message.deleted) {
            message.delete().catch(() => {});
        }
    });
}
