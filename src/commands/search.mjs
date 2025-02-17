import { 
    ActionRowBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors 
} from "discord.js";

const MusicPlatform = {
    YOUTUBE: { name: 'YouTube', source: 'ytsearch', color: 0xFF0000, emoji: '<:youtube:1326295615017058304>', icon: '📺', style: ButtonStyle.Danger, searchErrorMessage: 'Failed to fetch YouTube results. Try again later.' },
    SOUNDCLOUD: { name: 'SoundCloud', source: 'scsearch', color: 0xFF5500, emoji: '<:soundcloud:1326295646818406486>', icon: '🎵', style: ButtonStyle.Primary, searchErrorMessage: 'SoundCloud search failed. The track might be private.' },
    SPOTIFY: { name: 'Spotify', source: 'spsearch', color: 0x1DB954, emoji: '<:spotify:1326702792269893752>', icon: '🎧', style: ButtonStyle.Success, searchErrorMessage: 'Unable to search Spotify. Please check the track link.' }
};

const Config = {
    INTERACTION_TIMEOUT: 30000,
    MAX_RESULTS: 5,
    DEFAULT_PLATFORM: 'YOUTUBE',
    BUTTON_STYLES: { SELECTION: ButtonStyle.Secondary },
    MESSAGES: { 
        NO_VOICE_CHANNEL: '🎵 Join a voice channel first!', 
        ALREADY_CONNECTED: channel => `🎵 I'm already playing music in ${channel}`, 
        NO_RESULTS: platform => `🔍 No results found on ${platform}. Try another platform!`, 
        TRACK_ADDED: title => `✅ Added **${title}** to the queue`, 
        SEARCH_ERROR: platform => `❌ Search failed on ${platform}. Please try again.` 
    }
};

class SearchCommandHandler {
    constructor(client) {
        this.client = client;
    }

    async execute(interaction) {
        const voiceChannel = interaction.member?.voice?.channel;
        const member = interaction.member;
        if (!this.validateVoiceState(interaction, voiceChannel)) return;

        const player = await this.getOrCreatePlayer(interaction, voiceChannel);
        if (!player) return;

        const searchState = {
            query: interaction.options.getString('query'),
            currentPlatform: MusicPlatform[Config.DEFAULT_PLATFORM],
            tracks: []
        };

        await this.handleInitialSearch(interaction, searchState, player, member);
    }

    validateVoiceState(interaction, voiceChannel) {
        if (!voiceChannel) {
            interaction.reply({ content: Config.MESSAGES.NO_VOICE_CHANNEL, ephemeral: true });
            return false;
        }
        const existingConnection = this.client.aqua.connections?.get(interaction.guildId);
        if (existingConnection && voiceChannel.id !== existingConnection.channelId) {
            interaction.reply({ content: Config.MESSAGES.ALREADY_CONNECTED(`<#${existingConnection.channelId}>`), ephemeral: true });
            return false;
        }
        return true;
    }

    async getOrCreatePlayer(interaction, voiceChannel) {
        const existingConnection = this.client.aqua.connections?.get(interaction.guildId);
        if (existingConnection) return existingConnection;

        try {
            return await this.client.aqua.createConnection({
                guildId: interaction.guildId,
                voiceChannel: voiceChannel.id,
                textChannel: interaction.channel.id,
                deaf: true,
            });
        } catch (error) {
            console.error('Failed to create player:', error);
            interaction.reply({ content: '❌ Failed to join voice channel. Please try again.', ephemeral: true });
            return null;
        }
    }

    async handleInitialSearch(interaction, searchState, player, member) {
        try {
            searchState.tracks = await this.searchTracks(searchState.query, searchState.currentPlatform.source, member);
            if (!searchState.tracks.length) {
                interaction.reply({ content: Config.MESSAGES.NO_RESULTS(searchState.currentPlatform.name), ephemeral: true });
                return;
            }
            const message = await this.createSearchMessage(interaction, searchState);
            this.setupInteractionCollector(message, interaction, player, searchState);
        } catch (error) {
            console.error('Search error:', error);
            interaction.reply({ content: Config.MESSAGES.SEARCH_ERROR(searchState.currentPlatform.name), ephemeral: true });
        }
    }

    async searchTracks(query, source, requester) {
        const result = await this.client.aqua.resolve({ query, source, requester });
        return result.tracks?.slice(0, Config.MAX_RESULTS) || [];
    }

    createSearchEmbed(interaction, searchState) {
        const { currentPlatform, tracks, query } = searchState;
        const trackList = tracks.map((track, index) => `${index + 1}. ${currentPlatform.emoji} [\`${track.info.title}\`](${track.info.uri})`).join('\n');
        return new EmbedBuilder()
            .setColor(currentPlatform.color)
            .setTitle(`🔍 Search Results: ${query}`)
            .setDescription(trackList)
            .setThumbnail(this.client.user.displayAvatarURL())
            .setFooter({ text: `Powered by ${currentPlatform.name}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();
    }

    createPlatformButtons() {
        return new ActionRowBuilder().addComponents(
            Object.entries(MusicPlatform).map(([key, platform]) => 
                new ButtonBuilder()
                    .setCustomId(`platform_${key.toLowerCase()}`)
                    .setLabel(platform.name)
                    .setEmoji(platform.icon)
                    .setStyle(platform.style)
            )
        );
    }

    createSelectionButtons(tracks, platform) {
        return new ActionRowBuilder().addComponents(
            tracks.map((_, index) => 
                new ButtonBuilder()
                    .setCustomId(`select_${index}_${platform.toLowerCase()}`)
                    .setLabel(`${index + 1}`)
                    .setStyle(Config.BUTTON_STYLES.SELECTION)
            )
        );
    }

    async createSearchMessage(interaction, searchState) {
        const embed = this.createSearchEmbed(interaction, searchState);
        const selectionButtons = this.createSelectionButtons(searchState.tracks, searchState.currentPlatform.name);
        const platformButtons = this.createPlatformButtons();
        return interaction.reply({
            embeds: [embed],
            components: [selectionButtons, platformButtons],
        });
    }

    setupInteractionCollector(message, interaction, player, searchState) {
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: Config.INTERACTION_TIMEOUT
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            if (i.customId.startsWith('select_')) {
                await this.handleTrackSelection(i, searchState, player);
            } else if (i.customId.startsWith('platform_')) {
                await this.handlePlatformSwitch(i, message, interaction, searchState);
            }
        });

        collector.on('end', () => {
            if (!message.deleted) {
                message.delete().catch(() => {});
            }
        });
    }

    async handleTrackSelection(interaction, searchState, player) {
        const trackIndex = parseInt(interaction.customId.split('_')[1]);
        const track = searchState.tracks[trackIndex];
        if (track) {
            player.queue.add(track);
            await interaction.followUp({ content: Config.MESSAGES.TRACK_ADDED(track.info.title), ephemeral: true });
            if (!player.playing && !player.paused && player.queue.size > 0) {
                player.play();
            }
        }
    }

    async handlePlatformSwitch(interaction, message, originalInteraction, searchState) {
        const platformKey = interaction.customId.split('_')[1].toUpperCase();
        const newPlatform = MusicPlatform[platformKey];
        
        try {
            const tracks = await this.searchTracks(searchState.query, newPlatform.source, originalInteraction.member);
            if (tracks.length) {
                searchState.tracks = tracks;
                searchState.currentPlatform = newPlatform;
                const embed = this.createSearchEmbed(originalInteraction, searchState);
                const selectionButtons = this.createSelectionButtons(tracks, platformKey.toLowerCase());
                const platformButtons = this.createPlatformButtons();
                await message.edit({ embeds: [embed], components: [selectionButtons, platformButtons] });
            } else {
                await interaction.followUp({ content: Config.MESSAGES.NO_RESULTS(newPlatform.name), ephemeral: true });
            }
        } catch (error) {
            console.error(`${newPlatform.name} search error:`, error);
            await interaction.followUp({ content: newPlatform.searchErrorMessage, ephemeral: true });
        }
    }
}

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
        const handler = new SearchCommandHandler(client);
        await handler.execute(interaction);
    }
};
