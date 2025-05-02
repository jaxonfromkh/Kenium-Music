import { 
    ActionRowBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
} from "discord.js";

const MusicPlatform = new Map([
    ['YOUTUBE', { name: 'YouTube', source: 'ytsearch', color: 0xFF0000, emoji: '<:youtube:1326295615017058304>', icon: '📺', style: 4, searchErrorMessage: 'Failed to fetch YouTube results. Try again later.' }],
    ['SOUNDCLOUD', { name: 'SoundCloud', source: 'scsearch', color: 0xFF5500, emoji: '<:soundcloud:1326295646818406486>', icon: '🎵', style: 1, searchErrorMessage: 'SoundCloud search failed. The track might be private.' }],
    ['SPOTIFY', { name: 'Spotify', source: 'spsearch', color: 0x1DB954, emoji: '<:spotify:1326702792269893752>', icon: '🎧', style: 3, searchErrorMessage: 'Unable to search Spotify. Please check the track link.' }]
]);

const INTERACTION_TIMEOUT = 30000;
const MAX_RESULTS = 5;
const DEFAULT_PLATFORM = 'YOUTUBE';
const BUTTON_STYLE_SELECTION = 2;
const MESSAGES = { 
    NO_VOICE_CHANNEL: '🎵 Join a voice channel first!', 
    ALREADY_CONNECTED: channel => `🎵 I'm already playing music in ${channel}`, 
    NO_RESULTS: platform => `🔍 No results found on ${platform}. Try another platform!`, 
    TRACK_ADDED: title => `✅ Added **${title}** to the queue`, 
    SEARCH_ERROR: platform => `❌ Search failed on ${platform}. Please try again.` 
};

class SearchCommandHandler {
    constructor(client) {
        this.client = client;
    }

    async execute(interaction) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: MESSAGES.NO_VOICE_CHANNEL, flags: 64 });
        }

        const existingConnection = this.client.aqua.connections?.get(interaction.guildId);
        if (existingConnection && voiceChannel.id !== existingConnection.channelId) {
            return interaction.reply({ content: MESSAGES.ALREADY_CONNECTED(`<#${existingConnection.channelId}>`), flags: 64 });
        }

        const player = existingConnection || await this.createPlayer(interaction, voiceChannel);
        if (!player) return;

        const query = interaction.options.getString('query');
        const currentPlatform = MusicPlatform.get(DEFAULT_PLATFORM);
        
        try {
            const tracks = await this.searchTracks(query, currentPlatform.source, interaction.user);
            if (!tracks.length) {
                return interaction.reply({ content: MESSAGES.NO_RESULTS(currentPlatform.name), flags: 64 });
            }
            
            const message = await this.createSearchMessage(interaction, query, tracks, currentPlatform);
            this.setupInteractionCollector(message, interaction, player, query, tracks, currentPlatform);
        } catch (error) {
            console.error('Search error:', error);
            interaction.reply({ content: MESSAGES.SEARCH_ERROR(currentPlatform.name), flags: 64 });
        }
    }

    async createPlayer(interaction, voiceChannel) {
        try {
            return await this.client.aqua.createConnection({
                guildId: interaction.guildId,
                voiceChannel: voiceChannel.id,
                textChannel: interaction.channel.id,
                deaf: true,
                defaultVolume: 65,
            });
        } catch (error) {
            console.error('Failed to create player:', error);
            interaction.reply({ content: '❌ Failed to join voice channel. Please try again.', flags: 64 });
            return null;
        }
    }

    async searchTracks(query, source, requester) {
        const result = await this.client.aqua.resolve({ query, source, requester });
        return result.tracks?.slice(0, MAX_RESULTS) || [];
    }

    createSearchEmbed(interaction, query, tracks, platform) {
        const trackList = [];
        for (let i = 0; i < tracks.length; i++) {
            trackList.push(`${i + 1}. ${platform.emoji} [\`${tracks[i].info.title}\`](${tracks[i].info.uri})`);
        }

        return new EmbedBuilder()
            .setColor(platform.color)
            .setTitle(`🔍 Search Results: ${query}`)
            .setDescription(trackList.join('\n'))
            .setThumbnail(this.client.user.displayAvatarURL())
            .setFooter({ text: `Powered by ${platform.name}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();
    }

    createPlatformButtons() {
        const components = [];
        for (const [key, platform] of MusicPlatform.entries()) {
            components.push(
                new ButtonBuilder()
                    .setCustomId(`platform_${key.toLowerCase()}`)
                    .setLabel(platform.name)
                    .setEmoji(platform.icon)
                    .setStyle(platform.style)
            );
        }
        return new ActionRowBuilder().addComponents(components);
    }

    createSelectionButtons(tracks, platformName) {
        const components = [];
        const lowerPlatform = platformName.toLowerCase();
        
        for (let i = 0; i < tracks.length; i++) {
            components.push(
                new ButtonBuilder()
                    .setCustomId(`select_${i}_${lowerPlatform}`)
                    .setLabel(`${i + 1}`)
                    .setStyle(BUTTON_STYLE_SELECTION)
            );
        }
        
        return new ActionRowBuilder().addComponents(components);
    }

    async createSearchMessage(interaction, query, tracks, platform) {
        const embed = this.createSearchEmbed(interaction, query, tracks, platform);
        const selectionButtons = this.createSelectionButtons(tracks, platform.name);
        const platformButtons = this.createPlatformButtons();
        
        return interaction.reply({
            embeds: [embed],
            components: [selectionButtons, platformButtons],
            flags: 64
        });
    }

    setupInteractionCollector(message, interaction, player, query, tracks, currentPlatform) {
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: INTERACTION_TIMEOUT
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            
            if (i.customId.startsWith('select_')) {
                const trackIndex = parseInt(i.customId.split('_')[1]);
                const track = tracks[trackIndex];
                
                if (track) {
                    player.queue.add(track);
                    await i.followUp({ content: MESSAGES.TRACK_ADDED(track.info.title), flags: 64 });
                    
                    if (!player.playing && !player.paused && player.queue.size > 0) {
                        player.play();
                    }
                }
            } else if (i.customId.startsWith('platform_')) {
                const platformKey = i.customId.split('_')[1].toUpperCase();
                const newPlatform = MusicPlatform.get(platformKey);
                
                try {
                    const newTracks = await this.searchTracks(query, newPlatform.source, interaction.user);
                    
                    if (newTracks.length) {
                        tracks.length = 0;
                        newTracks.forEach(track => tracks.push(track));
                        
                        const embed = this.createSearchEmbed(interaction, query, tracks, newPlatform);
                        const selectionButtons = this.createSelectionButtons(tracks, newPlatform.name);
                        const platformButtons = this.createPlatformButtons();
                        
                        await message.edit({ embeds: [embed], components: [selectionButtons, platformButtons] });
                    } else {
                        await i.followUp({ content: MESSAGES.NO_RESULTS(newPlatform.name), flags: 64 });
                    }
                } catch (error) {
                    console.error(`${newPlatform.name} search error:`, error);
                    await i.followUp({ content: newPlatform.searchErrorMessage, flags: 64 });
                }
            }
        });

        collector.on('end', () => {
            if (message.deletable) {
                message.delete().catch(() => {});
            } else {
                message.edit({ components: [] }).catch(() => {});
            }
        });
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
