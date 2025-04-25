import { SimpleDB } from '../utils/simpleDB.mjs';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const db = new SimpleDB();
const playlistsCollection = db.collection('playlists');

const EMBED_COLOR = '#000000';
const SUCCESS_COLOR = '#4cd964';
const ERROR_COLOR = '#ff3b30';
const FOOTER_TEXT = '🎵 Kenium Playlists';
const PAGE_SIZE = 10;

const EMOJIS = {
  playlist: '🎧',
  tracks: '💿',
  duration: '⏱️',
  created: '📅',
  artist: '🎤',
  source: '🔊',
  removed: '🗑️',
  added: '✅',
  loading: '⏳',
  youtube: '📺',
  spotify: '📗',
  soundcloud: '🔸'
};

export const Command = {
    name: "playlist",
    description: "Manage music playlists",
    options: [
        {
            name: "create",
            description: "Create a new playlist",
            type: 1, 
            options: [
                {
                    name: "name",
                    description: "The name of the playlist",
                    type: 3, 
                    required: true,
                }
            ]
        },
        {
            name: "add",
            description: "Add a track to a playlist",
            type: 1, 
            options: [
                {
                    name: "playlist",
                    description: "The name of the playlist",
                    type: 3, 
                    required: true,
                    autocomplete: true
                },
                {
                    name: "track",
                    description: "The track name or URL",
                    type: 3, 
                    required: true,
                    autocomplete: true
                }
            ]
        },
        {
            name: "remove",
            description: "Remove a track from a playlist",
            type: 1, 
            options: [
                {
                    name: "playlist",
                    description: "The name of the playlist",
                    type: 3, 
                    required: true,
                    autocomplete: true
                },
                {
                    name: "index",
                    description: "The index of the track to remove (starts at 1)",
                    type: 4, 
                    required: true,
                    autocomplete: true
                }
            ]
        },
        {
            name: "list",
            description: "List all playlists or tracks in a specific playlist",
            type: 1, 
            options: [
                {
                    name: "playlist",
                    description: "The name of the playlist (leave empty to show all playlists)",
                    type: 3, 
                    required: false,
                    autocomplete: true
                },
                {
                    name: "page",
                    description: "Page number to view",
                    type: 4,
                    required: false
                }
            ]
        },
        {
            name: "play",
            description: "Play a playlist",
            type: 1, 
            options: [
                {
                    name: "name",
                    description: "The name of the playlist",
                    type: 3, 
                    required: true,
                    autocomplete: true
                }
            ]
        },
        {
            name: "delete",
            description: "Delete a playlist",
            type: 1, 
            options: [
                {
                    name: "name",
                    description: "The name of the playlist",
                    type: 3, 
                    required: true,
                    autocomplete: true
                }
            ]
        }
    ],

    run: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        const commandHandlers = new Map([
            ['create', createPlaylist],
            ['add', (i, id) => addTrackToPlaylist(i, id, client)],
            ['remove', removeTrackFromPlaylist],
            ['list', listPlaylists],
            ['play', (i, id) => playPlaylist(i, id, client)],
            ['delete', deletePlaylist]
        ]);

        const handler = commandHandlers.get(subcommand);
        
        if (handler) {
            return await handler(interaction, userId);
        } else {
            return await interaction.reply({ 
                embeds: [createErrorEmbed("Unknown subcommand")], 
                flags: 64
            });
        }
    },

    autocomplete: async (client, interaction) => {
        const focusedOption = interaction.options.getFocused(true);
        const userId = interaction.user.id;
        let choices = [];

        if (focusedOption.name === "playlist" || focusedOption.name === "name") {
            const playlists = playlistsCollection.find({ userId });
            choices = playlists.map(playlist => ({
                name: playlist.name,
                value: playlist.name
            }));
        } else if (focusedOption.name === "track") {
            const trackInput = focusedOption.value.toLowerCase();
            
            if (/spotify\.com|youtube\.com|youtu\.be|soundcloud\.com/.test(trackInput)) {
                const source = trackInput.includes("spotify.com") ? "Spotify" : 
                               trackInput.includes("youtube.com") || trackInput.includes("youtu.be") ? "YouTube" : "SoundCloud";
                choices = [{ name: `Use ${source} link`, value: focusedOption.value }];
            } else {
                choices = [{ name: `Search: ${focusedOption.value}`, value: focusedOption.value }];

                if (client.aqua?.search && focusedOption.value.length > 2) {
                    try {
                        const searchResults = await client.aqua.resolve({
                            query: focusedOption.value,
                        });

                        if (searchResults?.tracks?.length) {
                            choices = searchResults.tracks
                                .slice(0, 8)
                                .map(track => ({
                                    name: `${track.info.title} - ${track.info.author}`.substring(0, 100),
                                    value: track.info.uri
                                }));
                        }
                    } catch (error) {
                        console.error("Error searching tracks for autocomplete:", error);
                    }
                }
            }
        } else if (focusedOption.name === "index") {
            const playlistName = interaction.options.getString("playlist");
            if (playlistName) {
                const playlist = playlistsCollection.findOne({ userId, name: playlistName });
                if (playlist?.tracks?.length) {
                    choices = playlist.tracks.map((track, index) => ({
                        name: `${index + 1}. ${track.title}`.substring(0, 100),
                        value: index + 1
                    }));
                }
            }
        }

        let filtered = choices.filter(choice => choice.name.toLowerCase().startsWith(focusedOption.value.toLowerCase()));
        
        if (filtered.length < 10) {
            const additionalMatches = choices.filter(choice => 
                !choice.name.toLowerCase().startsWith(focusedOption.value.toLowerCase()) &&
                choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
            filtered = [...filtered, ...additionalMatches];
        }

        await interaction.respond(filtered.slice(0, 25));
    }
};

const createEmbed = (() => {
    
    return (title, description = null, color = EMBED_COLOR) => {
        const key = `${title}-${description}-${color}`;
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${getEmojiForTitle(title)} ${title}`);

        if (description) embed.setDescription(description);

        embed.setTimestamp()
             .setFooter({ text: FOOTER_TEXT });

        return embed;
    };
})();

function getEmojiForTitle(title) {
    if (title.includes('Created')) return EMOJIS.playlist;
    if (title.includes('Added')) return EMOJIS.added;
    if (title.includes('Removed')) return EMOJIS.removed;
    if (title.includes('Playing')) return '▶️';
    if (title.includes('Your Playlists')) return EMOJIS.playlist;
    if (title.includes('Deleted')) return EMOJIS.removed;
    if (title.includes('Error')) return '❌';
    if (title.includes('Playlist:')) return EMOJIS.playlist;
    return '🎵';
}

const createErrorEmbed = (() => {
    
    return (errorMessage) => {
        
        const embed = new EmbedBuilder()
            .setColor(ERROR_COLOR)
            .setTitle('❌ Error')
            .setDescription(errorMessage)
            .setTimestamp()
            .setFooter({ text: FOOTER_TEXT });

        return embed;
    };
})();

function determineSource(uri) {
    if (!uri) return 'Unknown';
    
    if (uri.includes('youtube.com') || uri.includes('youtu.be')) 
        return `${EMOJIS.youtube} YouTube`;
    if (uri.includes('spotify.com')) 
        return `${EMOJIS.spotify} Spotify`;
    if (uri.includes('soundcloud.com')) 
        return `${EMOJIS.soundcloud} SoundCloud`;
    
    return 'Unknown';
}

async function createPlaylist(interaction, userId) {
    const name = interaction.options.getString("name");

    const existingPlaylist = playlistsCollection.findOne({ userId, name });
    if (existingPlaylist) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`You already have a playlist named "${name}"`)], 
            flags: 64 
        });
    }

    playlistsCollection.insert({
        userId,
        name,
        tracks: [],
        createdAt: new Date().toISOString()
    });

    const embed = createEmbed('Playlist Created', `Playlist **${name}** was successfully created!`, SUCCESS_COLOR);
    embed.setThumbnail('https://img.icons8.com/nolan/64/playlist.png');

    await interaction.reply({ embeds: [embed], flags: 64 });
}

async function addTrackToPlaylist(interaction, userId, client) {
    const playlistName = interaction.options.getString("playlist");
    const trackQuery = interaction.options.getString("track");

    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)], 
            flags: 64 
        });
    }

    if (playlist.tracks.length >= 50) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Playlist "${playlistName}" has reached the maximum of 50 tracks.`)], 
            flags: 64 
        });
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const res = await client.aqua.resolve({
            query: trackQuery,
            requester: interaction.user
        });

        if (res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") {
            return await interaction.editReply({
                embeds: [createErrorEmbed(
                    res.loadType === "LOAD_FAILED" 
                    ? `Failed to load track: ${res.exception?.message || "Unknown error"}`
                    : `No tracks found matching "${trackQuery}"`
                )],
                flags: 64
            });
        }

        for (const track of res.tracks.slice(0, 50 - playlist.tracks.length)) {
            const trackData = {
                title: track.info.title,
                uri: track.info.uri,
                author: track.info.author,
                duration: track.info.length,
                addedAt: new Date().toISOString()
            };

            playlist.tracks.push(trackData);
        }
        playlistsCollection.update({ _id: playlist._id }, playlist);

        const tracksAdded = Math.min(res.tracks.length, 50 - playlist.tracks.length);
        
        const embed = createEmbed(
            'Tracks Added', 
            `Added ${tracksAdded} track${tracksAdded > 1 ? 's' : ''} to playlist **${playlistName}**`,
            SUCCESS_COLOR
        );

        embed.addFields(
            { name: '🎵 Track', value: `**${res.tracks[0].info.title}**`, inline: false },
            { name: `${EMOJIS.artist} Artist`, value: res.tracks[0].info.author, inline: true },
            { name: `${EMOJIS.source} Source`, value: determineSource(res.tracks[0].info.uri), inline: true },
            { name: `${EMOJIS.tracks} Playlist Size`, value: `${playlist.tracks.length} tracks`, inline: true }
        );

        const videoId = extractYouTubeId(res.tracks[0].info.uri);
        if (videoId) {
            embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
        }

        return await interaction.editReply({ embeds: [embed], flags: 64 });
    } catch (error) {
        console.error("Error adding track to playlist:", error);
        return await interaction.editReply({
            embeds: [createErrorEmbed(`Error adding track: ${error.message || "Unknown error"}`)],
            flags: 64
        });
    }
}

async function removeTrackFromPlaylist(interaction, userId) {
    const playlistName = interaction.options.getString("playlist");
    const index = interaction.options.getInteger("index") - 1; 

    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)], 
            flags: 64 
        });
    }

    if (index < 0 || index >= playlist.tracks.length) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Invalid track index. Playlist has ${playlist.tracks.length} tracks.`)], 
            flags: 64 
        });
    }

    const removedTrack = playlist.tracks.splice(index, 1)[0];
    playlistsCollection.update({ _id: playlist._id }, playlist);

    const embed = createEmbed('Track Removed', `Removed **${removedTrack.title}** from playlist **${playlistName}**`);
    embed.addFields(
        { name: `${EMOJIS.artist} Artist`, value: removedTrack.author || 'Unknown', inline: true },
        { name: `${EMOJIS.tracks} Remaining`, value: playlist.tracks.length.toString(), inline: true }
    );

    const videoId = extractYouTubeId(removedTrack.uri);
    if (videoId) {
        embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    }

    return await interaction.reply({ embeds: [embed], flags: 64 });
}

async function listPlaylists(interaction, userId) {
    const playlistName = interaction.options.getString("playlist");
    const page = interaction.options.getInteger("page") || 1;
    
    if (!playlistName) {
        const playlists = playlistsCollection.find({ userId });

        if (playlists.length === 0) {
            return await interaction.reply({ 
                embeds: [createEmbed('Your Playlists', 'You don\'t have any playlists yet. Use `/playlist create` to create one!')], 
                flags: 64 
            });
        }

        const totalPages = Math.ceil(playlists.length / PAGE_SIZE);
        const currentPage = Math.min(Math.max(page, 1), totalPages);
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = Math.min(startIdx + PAGE_SIZE, playlists.length);
        
        const visiblePlaylists = playlists.slice(startIdx, endIdx);
        
        const embed = createEmbed(
            'Your Playlists', 
            `You have **${playlists.length}** playlists • Page ${currentPage}/${totalPages}`
        );

        visiblePlaylists.forEach(playlist => {
            const totalDuration = playlist.tracks.reduce((total, track) => total + track.duration, 0);
            embed.addFields({
                name: `${EMOJIS.playlist} ${playlist.name}`,
                value: `${EMOJIS.tracks} ${playlist.tracks.length} tracks • ${EMOJIS.duration} ${formatDuration(totalDuration)} • ${EMOJIS.created} <t:${Math.floor(new Date(playlist.createdAt).getTime() / 1000)}:R>`
            });
        });

        const components = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`playlist_prev_${currentPage}_${userId}`)
                    .setLabel('Previous')
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId(`playlist_next_${currentPage}_${userId}`)
                    .setLabel('Next')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages)
            );
            components.push(row);
        }

        return await interaction.reply({ 
            embeds: [embed], 
            components: components,
            flags: 64 
        });
    } else {
        const playlist = playlistsCollection.findOne({ userId, name: playlistName });

        if (!playlist) {
            return await interaction.reply({ 
                embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)], 
                flags: 64 
            });
        }

        if (playlist.tracks.length === 0) {
            return await interaction.reply({ 
                embeds: [createEmbed(`Playlist: ${playlistName}`, 'This playlist is empty. Add tracks with `/playlist add`')], 
                flags: 64 
            });
        }

        const totalDuration = playlist.tracks.reduce((total, track) => total + track.duration, 0);
        
        const totalPages = Math.ceil(playlist.tracks.length / PAGE_SIZE);
        const currentPage = Math.min(Math.max(page, 1), totalPages);
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = Math.min(startIdx + PAGE_SIZE, playlist.tracks.length);
        
        const visibleTracks = playlist.tracks.slice(startIdx, endIdx);

        const embed = createEmbed(
            `Playlist: ${playlistName}`, 
            `**${playlist.tracks.length} tracks** • Total Duration: ${formatDuration(totalDuration)} • Page ${currentPage}/${totalPages}`
        );

        visibleTracks.forEach((track, index) => {
            const source = determineSource(track.uri);
            
            embed.addFields({
                name: `${startIdx + index + 1}. ${track.title}`,
                value: `${EMOJIS.artist} ${track.author || 'Unknown'} • ${EMOJIS.duration} ${formatDuration(track.duration)} • ${source}`
            });
        });

        const components = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`playlist_track_prev_${currentPage}_${playlistName}_${userId}`)
                    .setLabel('Previous')
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId(`playlist_track_next_${currentPage}_${playlistName}_${userId}`)
                    .setLabel('Next')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages)
            );
            components.push(row);
        }

        return await interaction.reply({ 
            embeds: [embed], 
            components: components,
            flags: 64 
        });
    }
}

async function playPlaylist(interaction, userId, client) {
    const playlistName = interaction.options.getString("name");

    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)], 
            flags: 64 
        });
    }

    if (playlist.tracks.length === 0) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Playlist "${playlistName}" is empty. Add tracks with \`/playlist add\``)], 
            flags: 64 
        });
    }

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed("You need to be in a voice channel to play music!")], 
            flags: 64 
        });
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const player = client.aqua.createConnection({
            guildId: interaction.guild.id,
            voiceChannel: voiceChannel.id,
            textChannel: interaction.channel.id,
            defaultVolume: 65,
        });

        let loadedTracks = 0;
        const trackPromises = [];

        for (const track of playlist.tracks) {
            trackPromises.push(
                client.aqua.resolve({
                    query: track.uri,
                    requester: interaction.user
                }).then(res => {
                    if (res.loadType !== "LOAD_FAILED" && res.tracks && res.tracks.length > 0) {
                        player.queue.add(res.tracks[0]);
                        loadedTracks++;
                    }
                }).catch(error => {
                    console.error(`Failed to load track ${track.title}:`, error);
                })
            );
        }

        await Promise.all(trackPromises);

        if (!player.playing && !player.paused && player.queue.size) {
            player.play();
        }

        const totalDuration = playlist.tracks.reduce((total, track) => total + track.duration, 0);

        const embed = createEmbed(
            'Now Playing Playlist', 
            `Started playing playlist **${playlistName}**`
        );

        embed.addFields(
            { name: `${EMOJIS.tracks} Tracks Queued`, value: `${loadedTracks}/${playlist.tracks.length}`, inline: true },
            { name: `${EMOJIS.duration} Total Duration`, value: formatDuration(totalDuration), inline: true },
            { name: '🔊 Voice Channel', value: voiceChannel.name, inline: true }
        );

        if (loadedTracks > 0) {
            embed.addFields({
                name: `${EMOJIS.loading} Loading Progress`,
                value: createProgressBar(loadedTracks, playlist.tracks.length)
            });
        }

        if (playlist.tracks.length > 0) {
            const firstTrack = playlist.tracks[0];
            if (firstTrack.uri) {
                const videoId = extractYouTubeId(firstTrack.uri);
                if (videoId) {
                    embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
                }
            }
        }

        return await interaction.editReply({ embeds: [embed], flags: 64 });
    } catch (error) {
        console.error("Error playing playlist:", error);
        return await interaction.editReply({
            embeds: [createErrorEmbed(`Error playing playlist: ${error.message || "Unknown error"}`)],
            flags: 64
        });
    }
}

async function deletePlaylist(interaction, userId) {
    const playlistName = interaction.options.getString("name");

    const playlist = playlistsCollection.findOne({ userId, name: playlistName });
    if (!playlist) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Playlist "${playlistName}" not found`)], 
            flags: 64 
        });
    }

    const trackCount = playlist.tracks.length;
    const deleted = playlistsCollection.delete({ userId, name: playlistName });

    if (deleted === 0) {
        return await interaction.reply({ 
            embeds: [createErrorEmbed(`Failed to delete playlist "${playlistName}"`)], 
            flags: 64 
        });
    }

    const embed = createEmbed(
        'Playlist Deleted', 
        `Successfully deleted playlist **${playlistName}**`,
        ERROR_COLOR 
    );

    embed.addFields({ name: `${EMOJIS.removed} Tracks Removed`, value: trackCount.toString(), inline: true });
    embed.setThumbnail('https://img.icons8.com/nolan/64/delete-property.png');

    return await interaction.reply({ embeds: [embed], flags: 64 });
}


function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

function extractYouTubeId(url) {
    if (!url) return null;
    try {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    } catch (error) {
        return null;
    }
}

function createProgressBar(current, total, barSize = 10) {
    const progress = Math.round((current / total) * barSize);
    const filledChar = '■'; 
    const emptyChar = '□'; 
    const percentage = Math.round((current / total) * 100);
    
    return `${filledChar.repeat(progress)}${emptyChar.repeat(barSize - progress)} ${percentage}% (${current}/${total})`;
}