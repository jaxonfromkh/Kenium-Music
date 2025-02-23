import { EmbedBuilder } from 'discord.js';

const formatTime = ms => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export const Command = {
    name: 'nowplaying',
    description: 'Display the currently playing song',
    options: [],

    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            return interaction.reply('❌ | No music is being played!');
        }

        const track = player.currenttrack;
        if (!track) {
            return interaction.reply('❌ | There is no track playing right now');
        }

        const { title, uri, author, album, length, artworkUrl } = track.info;
        const userAvatarURL = client.user.displayAvatarURL();
        const progressBar = '▬▬▬▬▬▬▬▬▬▬'; 
        const quality = 'HQ';

        const embed = new EmbedBuilder()
            .setColor('#0A0A0A')
            .setAuthor({
                name: '🎵  Kenium 2.8.0',
                iconURL: userAvatarURL,
                url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
            })
            .setDescription(
                `### [\`${title}\`](<${uri}>)\n` +
                `> by **${author}** • ${album || 'Single'} • ${quality}\n\n` +
                `\`${formatTime(player.position)}\` ${progressBar} \`${formatTime(length)}\`\n\n` +
                `${player.volume > 50 ? '🔊' : '🔈'} \`${player.volume}%\` • ${player.loop ? '🔁' : '▶️'} \`${player.loop ? 'Loop' : 'Normal'}\` • 👤 <@${track.requester.id}>`
            )
            .setThumbnail(artworkUrl || userAvatarURL)
            .setFooter({
                text: 'An Open Source Bot',
                iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
            });

        return interaction.reply({ embeds: [embed], flags: 64 });
    }
};
