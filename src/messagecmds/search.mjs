import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const MusicPlatform = new Map([
    ['YOUTUBE', { name: 'YouTube', source: 'ytsearch', color: 0xFF0000, emoji: '<:youtube:1326295615017058304>', icon: '📺', style: ButtonStyle.Danger, searchErrorMessage: 'Failed to fetch YouTube results. Try again later.' }],
    ['SOUNDCLOUD', { name: 'SoundCloud', source: 'scsearch', color: 0xFF5500, emoji: '<:soundcloud:1326295646818406486>', icon: '🎵', style: ButtonStyle.Primary, searchErrorMessage: 'SoundCloud search failed. The track might be private.' }],
    ['SPOTIFY', { name: 'Spotify', source: 'spsearch', color: 0x1DB954, emoji: '<:spotify:1326702792269893752>', icon: '🎧', style: ButtonStyle.Success, searchErrorMessage: 'Unable to search Spotify. Please check the track link.' }]
]);

const message_TIMEOUT = 30000;
const MAX_RESULTS = 5;
const DEFAULT_PLATFORM = 'YOUTUBE';
const BUTTON_STYLE_SELECTION = ButtonStyle.Secondary;
const MESSAGES = {
    NO_VOICE_CHANNEL: '🎵 Join a voice channel first!',
    ALREADY_CONNECTED: channel => `🎵 I'm already playing music in ${channel}`,
    NO_RESULTS: platform => `🔍 No results found on ${platform}. Try another platform!`,
    TRACK_ADDED: title => `✅ Added **${title}** to the queue`,
    SEARCH_ERROR: platform => `❌ Search failed on ${platform}. Please try again.`
};

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

class SearchCommandHandler {
    constructor(client) {
        this.client = client;
    }

    async execute(message, query) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.reply({ content: MESSAGES.NO_VOICE_CHANNEL });
        }

        const existingConnection = this.client.aqua.connections?.get(message.guildId);
        if (existingConnection && voiceChannel.id !== existingConnection.channelId) {
            return message.reply({ content: MESSAGES.ALREADY_CONNECTED(`<#${existingConnection.channelId}>`) });
        }

        const player = existingConnection || await this.createPlayer(message, voiceChannel);
        if (!player) return;

        const currentPlatform = MusicPlatform.get(DEFAULT_PLATFORM);

        try {
            const tracks = await this.searchTracks(query, currentPlatform.source, message.author);
            if (!tracks.length) {
                return message.reply({ content: MESSAGES.NO_RESULTS(currentPlatform.name) });
            }

            const { embed, components } = this.createSearchEmbed(message, query, tracks, currentPlatform);
            const sentMessage = await message.reply({
                embeds: [embed],
                components: components
            });
            this.setupMessageCollector(sentMessage, message, player, query, tracks, currentPlatform);
        } catch (error) {
            console.error('Search error:', error);
            message.reply({ content: MESSAGES.SEARCH_ERROR(currentPlatform.name) });
        }
    }

    async createPlayer(message, voiceChannel) {
        try {
            return await this.client.aqua.createConnection({
                guildId: message.guildId,
                voiceChannel: voiceChannel.id,
                textChannel: message.channel.id,
                deaf: true,
                defaultVolume: 65,
            });
        } catch (error) {
            console.error('Failed to create player:', error);
            message.reply({ content: '❌ Failed to join voice channel. Please try again.' });
            return null;
        }
    }

    async searchTracks(query, source, requester) {
        const result = await this.client.aqua.resolve({ query, source, requester });
        return result.tracks?.slice(0, MAX_RESULTS) || [];
    }

    createTrackListContent(tracks, platform) {
        return tracks.map((track, i) =>
            `**${i + 1}.** ${platform.emoji} [\`${track.info.title}\`](${track.info.uri}) \`[${formatDuration(track.info.length)}]\``
        ).join('\n');
    }

    createSearchEmbed(message, query, tracks, platform) {
        const trackListContent = this.createTrackListContent(tracks, platform);

        const embed = new EmbedBuilder()
            .setTitle(`${platform.emoji} ${platform.name} Search`)
            .setDescription(`**Query:** \`${query}\`\n\n${trackListContent}`)
            .setColor(platform.color)
            .setFooter({ 
                text: `Requested by ${message.author.displayName}`, 
                iconURL: message.author.displayAvatarURL() 
            })
            .setTimestamp();

        // Create selection buttons row
        const selectionRow = new ActionRowBuilder()
            .addComponents(this.createSelectionButtons(tracks));

        // Create platform buttons row
        const platformRow = new ActionRowBuilder()
            .addComponents(this.createPlatformButtons(platform));

        return { 
            embed, 
            components: [selectionRow, platformRow] 
        };
    }

    createPlatformButtons(currentPlatform) {
        const components = [];
        for (const [key, platform] of MusicPlatform.entries()) {
            const button = new ButtonBuilder()
                .setCustomId(`platform_${key.toLowerCase()}`)
                .setLabel(platform.name)
                .setStyle(key === currentPlatform.name.toUpperCase() ? ButtonStyle.Success : platform.style)
                .setDisabled(key === currentPlatform.name.toUpperCase());

            // Handle emoji
            if (typeof platform.emoji === "string" && platform.emoji.startsWith("<:")) {
                const match = platform.emoji.match(/^<:([a-zA-Z0-9_]+):(\d+)>$/);
                if (match) {
                    button.setEmoji({ name: match[1], id: match[2] });
                }
            } else if (typeof platform.icon === "string") {
                button.setEmoji(platform.icon);
            }

            components.push(button);
        }
        return components;
    }

    createSelectionButtons(tracks) {
        return tracks.map((track, i) => 
            new ButtonBuilder()
                .setCustomId(`select_${i}`)
                .setLabel(`${i + 1}`)
                .setEmoji("▶️")
                .setStyle(BUTTON_STYLE_SELECTION)
        );
    }

    setupMessageCollector(sentMessage, originalMessage, player, query, tracks, currentPlatform) {
        const collector = sentMessage.createMessageComponentCollector({
            filter: i => i.user.id === originalMessage.author.id,
            time: message_TIMEOUT
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();

            if (i.customId.startsWith('select_')) {
                const trackIndex = parseInt(i.customId.split('_')[1]);
                const track = tracks[trackIndex];

                if (track) {
                    player.queue.add(track);
                    await i.followUp({ content: MESSAGES.TRACK_ADDED(track.info.title) });

                    if (!player.playing && !player.paused && player.queue.size > 0) {
                        player.play();
                    }
                }
            } else if (i.customId.startsWith('platform_')) {
                const platformKey = i.customId.split('_')[1].toUpperCase();
                const newPlatform = MusicPlatform.get(platformKey);

                try {
                    const newTracks = await this.searchTracks(query, newPlatform.source, originalMessage.author);

                    if (newTracks.length) {
                        tracks.length = 0;
                        newTracks.forEach(track => tracks.push(track));

                        const { embed, components } = this.createSearchEmbed(originalMessage, query, tracks, newPlatform);
                        await i.editReply({ embeds: [embed], components: components });
                    } else {
                        await i.followUp({ content: MESSAGES.NO_RESULTS(newPlatform.name) });
                    }
                } catch (error) {
                    console.error(`${newPlatform.name} search error:`, error);
                    await i.followUp({ content: newPlatform.searchErrorMessage });
                }
            }
        });

        collector.on('end', () => {
            try {
                if (sentMessage.deletable) {
                    sentMessage.delete().catch(() => { });
                } else {
                    sentMessage.edit({ embeds: [], components: [] }).catch(() => { });
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
    async run(client, message) {
        const match = message.content.trim().match(/^kk!search\s+(.+)/i);
        const query = match ? match[1].trim() : "";
        if (!query) {
            return message.reply("Please provide a search query.\nUsage: `kk!search <song name>`");
        }
        const handler = new SearchCommandHandler(client);
        await handler.execute(message, query);
    }
};