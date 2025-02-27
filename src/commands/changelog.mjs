import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
const GITHUB_REPO_URL = 'https://api.github.com/repos/ToddyTheNoobDud/Kenium-Music/commits';
const GITHUB_REPO_LINK = 'https://github.com/ToddyTheNoobDud/Kenium-Music';
const GITHUB_COMMITS_LINK = `${GITHUB_REPO_LINK}/commits/main`;
const GITHUB_ISSUES_LINK = `${GITHUB_REPO_LINK}/issues/new`;
const BOT_VERSION = '2.9.0';
const dev = "mushroom0162";
const PRIMARY_COLOR = 0x6C5CE7;
const ERROR_COLOR = 0xFF0000;
const CACHE_DURATION = 15 * 60 * 1000;
const COOLDOWN_DURATION = 10 * 3000; 

const cooldowns = new Map();
async function fetchCommits(client, count) {
    const changelog = client.changelog || (client.changelog = {});
    const cacheAge = changelog.lastFetch ? Date.now() - changelog.lastFetch : Infinity;
    if (changelog.data && cacheAge < CACHE_DURATION) {
        return changelog.data;
    }
    try {
        const response = await fetch(`${GITHUB_REPO_URL}?per_page=${count}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'If-None-Match': changelog.etag || '',
                'User-Agent': 'Kenium-Music-Bot'
            },
        });
        if (response.status === 304) {
            changelog.lastFetch = Date.now();
            return changelog.data;
        }
        if (!response.ok) {
            throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
        }
        changelog.etag = response.headers.get('etag') || '';
        changelog.data = await response.json();
        changelog.lastFetch = Date.now();
        return changelog.data;
    } catch (error) {
        console.error("Error fetching commits:", error);
        throw error;
    }
}
function formatCommitMessage(message) {
    const formattedMessage = message.replace(/^.+?:\s*/, '').charAt(0).toUpperCase() + message.slice(1);
    return `${formattedMessage.length > 80 ? formattedMessage.substring(0, 77) + '...' : formattedMessage}`;
}
async function sendChangelogEmbed(interaction, commits, count) {
    const limitedCommits = commits.slice(0, count);
    const totalCommits = limitedCommits.length;
    let description = '';
    description += `📊 Showing **${totalCommits}** recent ${totalCommits === 1 ? 'change' : 'changes'} by ${dev}\n\n`;
    description += limitedCommits.map(commit => {
        const message = formatCommitMessage(commit.commit.message);
        const authorText = commit.author ? `[\`${commit.commit.author.name}\`](${commit.author.html_url})` : `\`${commit.commit.author.name}\``;
        return `[\`${commit.sha.substring(0, 7)}\`](${commit.html_url}) **${message}** (by ${authorText})`;
    }).join('\n');
    const embed = new EmbedBuilder()
        .setColor(PRIMARY_COLOR)
        .setDescription(description)
        .setFooter({
            text: `Kenium Music v${BOT_VERSION} • Made by ${dev}`,
            iconURL: interaction.guild?.iconURL()
        })
        .setTimestamp();
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('View on GitHub')
                .setURL(GITHUB_REPO_LINK)
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('All Commits')
                .setURL(GITHUB_COMMITS_LINK)
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('Report Bug')
                .setURL(GITHUB_ISSUES_LINK)
                .setStyle(ButtonStyle.Link)
        );
    await interaction.editReply({
        embeds: [embed],
        components: [buttons]
    });
}
export const Command = {
    name: "changelog",
    description: "Shows what I have done on this bot",
    run: async (client, interaction) => {
        const userId = interaction.user.id;
        const now = Date.now();
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + COOLDOWN_DURATION;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return await interaction.reply(`Please wait ${timeLeft.toFixed(1)} more seconds before using the changelog command again.`);
            }
        }
        cooldowns.set(userId, now);
        try {
            await interaction.deferReply();
            const count = 15;
            const commits = await fetchCommits(client, count);
            await sendChangelogEmbed(interaction, commits, count);
        } catch (error) {
            console.error("Error in changelog command:", error);
            const errorEmbed = new EmbedBuilder()
                .setColor(ERROR_COLOR)
                .setTitle("⚠️ Error Fetching Changelog")
                .setDescription(`Failed to get the latest changes. GitHub API might be down or rate limited.\n\`${error.message || 'Unknown error'}\``)
                .setFooter({
                    text: `Made with ❤️ by ${dev}`,
                });
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
