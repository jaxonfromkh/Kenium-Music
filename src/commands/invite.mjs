import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export const Command = {
    name: "invite",
    description: "Invite Kenium cuz yes",
    options: [],
    run: async (client, interaction) => {
        const embed = new EmbedBuilder()
            .setAuthor({
                name: "Kenium v3.0.1 | by mushroom0162",
                iconURL: client.user.avatarURL()
            })
            .setDescription(`
                **Invite me to your server with [\`this link\`](https://discord.com/oauth2/authorize?client_id=1202232935311495209)!**, Or the buttons below.
                **🎵 Optimized Music System**
                • Fast queue loading, smooth playback, low resource usage.
                • Supports YouTube, Spotify, SoundCloud, Vimeo, and file uploads.
                • Autocomplete for play commands with smart suggestions.

                **🎶 Search & Queue Manager**
                • Advanced search for YouTube, Spotify, and SoundCloud.
                • Manage queue: clear, show, or remove tracks (autocomplete supported).

                **📁 Playlist Import/Export** - Save & share playlists in .txt or .pdf with auto-naming.
                **📜 Lyrics Support** - Powered by Genius and LyricFind (supports YouTube songs via Lavalink).
            `)
            .setColor(0x000000)
            .setImage('https://cdn.discordapp.com/attachments/1180230815997767681/1318584563764822056/Untitled_1.png')
            .setFooter({ text: "Kenium | Free, Open Source" });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setEmoji('🎵')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://discord.com/invite/K4CVv84VBC")
                    .setLabel("Support Server"),
                new ButtonBuilder()
                    .setEmoji('📚')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://github.com/ToddyTheNoobDud/Thorium-Music")
                    .setLabel("GitHub"),
                new ButtonBuilder()
                    .setEmoji('🌐')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://toddythenoobdud.github.io/")
                    .setLabel("Website"),
            );

        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }
};
