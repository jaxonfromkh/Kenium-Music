import { EmbedBuilder } from 'discord.js';
const formatTime = ms => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};
async function getDescription(player, { info: { title, uri, author, album, length, isStream }, requester }) {
    const { position, volume, loop } = player;
    return `**[${title}](${uri})**\n*by* **${author}** • *${album || 'Single'}* • *${isStream ? '🔴 LIVE' : '🎵 320kbps'}*\n\n` +
        `\`${formatTime(position)}\` ${createProgressBar(length, position)} \`${formatTime(length)}\`\n\n` +
        `${volume > 50 ? '🔊' : '🔈'} \`${volume}%\` • ${getLoopStatus(loop)} • 👤 <@${requester.id}>`;
}
function createProgressBar(total, current, length = 15) {
    if (total === 0) return '`[───────────────]`';
    const progress = Math.round((current / total) * length);
    return `\`[${'━'.repeat(progress)}⚪${'─'.repeat(length - progress)}]\``;
}
function getLoopStatus(loop) {
    return {
        track: '🔂 Track Loop',
        queue: '🔁 Queue Loop',
        none: '▶️ No Loop'
    }[loop] || '▶️ No Loop';
}
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
        const embed = new EmbedBuilder()
            .setColor(0)
            .setAuthor({
                name: '🎵 Kenium 3.6.0',
                iconURL: client.user.displayAvatarURL(),
                url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
            })
            .setDescription(await getDescription(player, track))
            .setThumbnail(track.info.artworkUrl || client.user.displayAvatarURL())
            .setFooter({
                text: 'An Open Source Bot',
                iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
            });
        return interaction.reply({ embeds: [embed], flags: 64 });
    },
};