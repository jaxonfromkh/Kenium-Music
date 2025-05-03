import { 
    ActionRowBuilder, 
    EmbedBuilder,
    ButtonBuilder,
    ContainerBuilder
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
            
            const searchContainer = this.createSearchContainer(interaction, query, tracks, currentPlatform);
            const message = await interaction.reply({
                components: [searchContainer],
                flags: ["32768", "64"] // components v2 lol
            });
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

    createTrackListContent(tracks, platform) {
        const trackList = [];
        for (let i = 0; i < tracks.length; i++) {
            trackList.push(`**${i + 1}.** ${platform.emoji} [**\`${tracks[i].info.title}\`**](${tracks[i].info.uri})`);
        }
        return trackList.join('\n');
    }

    createSearchContainer(interaction, query, tracks, platform) {
        const trackListContent = this.createTrackListContent(tracks, platform);
        
        return new ContainerBuilder({
            components: [
                {
                    type: 9, 
                    components: [
                        {
                            type: 10,
                            content: `## 🔍 Search Results: ${query}\n\n${trackListContent}`
                        }
                    ],
                    accessory: {
                        type: 11,
                        media: {
                            url: this.client.user.displayAvatarURL()
                        }
                    }
                },
                {
                    type: 14,
                    divider: true,
                    spacing: 2
                },
                {
                    type: 1,
                    components: this.createSelectionButtonsV2(tracks)
                },
                {
                    type: 14,
                    divider: true,
                    spacing: 2
                },
                {
                    type: 1,
                    components: this.createPlatformButtonsV2()
                }
            ],
            accent_color: platform.color
        });
    }

    createPlatformButtonsV2() {
        const components = [];
        for (const [key, platform] of MusicPlatform.entries()) {
            let emoji = undefined;
            if (typeof platform.emoji === "string" && platform.emoji.startsWith("<:")) {
                const match = platform.emoji.match(/^<:([a-zA-Z0-9_]+):(\d+)>$/);
                if (match) {
                    emoji = { name: match[1], id: match[2] };
                }
            }
            else if (typeof platform.icon === "string") {
                emoji = { name: platform.icon };
            }

            components.push({
                type: 2,
                custom_id: `platform_${key.toLowerCase()}`,
                label: platform.name,
                ...(emoji && { emoji }),
                style: platform.style
            });
        }
        return components;
    }

    createSelectionButtonsV2(tracks) {
        const components = [];
        
        for (let i = 0; i < tracks.length; i++) {
            components.push({
                type: 2,
                custom_id: `select_${i}`,
                label: `${i + 1}`,
                style: BUTTON_STYLE_SELECTION
            });
        }
        
        return components;
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
                        
                        const searchContainer = this.createSearchContainer(interaction, query, tracks, newPlatform);
                        await i.editReply({ components: [searchContainer],                 flags: ["32768", "64"]  });
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
            try {
                if (message.deletable) {
                    message.delete().catch(() => {});
                } else {
                    interaction.editReply({ components: [] }).catch(() => {});
                }
            } catch (error) {
                console.error("Failed to clean up search message:", error);
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
