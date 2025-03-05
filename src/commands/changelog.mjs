import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CONFIG = {
    GITHUB: {
        REPO_URL: 'https://api.github.com/repos/ToddyTheNoobDud/Kenium-Music/commits',
        REPO_LINK: 'https://github.com/ToddyTheNoobDud/Kenium-Music',
        COMMITS_LINK: 'https://github.com/ToddyTheNoobDud/Kenium-Music/commits/main',
        ISSUES_LINK: 'https://github.com/ToddyTheNoobDud/Kenium-Music/issues/new',
    },
    BOT: {
        VERSION: '3.0.1',
        DEVELOPER: "mushroom0162",
        CHANGELOG: [
            "📦 Now bot will leave after 30 secs if channel is empty and no music is playing.",
            "🔧 Fixed search still using ephemeral in code.",
            "✨ Now status will be removed on bot leave.",
            "✨ Optimized the code to reduce memory usage, more speed and less lag. ",
            "✨ Implemented HTTP/2 support for a way faster connection.",
            "✨ Rewrite the /changelog command for an way faster fetching, caching, and less recourses",
        ]
    },
    COLORS: { PRIMARY: 0x6C5CE7, ERROR: 0xFF0000 },
    TIMERS: { CACHE_DURATION: 900000, COOLDOWN_DURATION: 30000 },
    DISPLAY: { COMMIT_MESSAGE_MAX_LENGTH: 80, DEFAULT_COMMIT_COUNT: 5 }
};

const githubCache = { data: null, etag: '', lastFetch: 0 };

async function fetchCommits(count) {
    if (githubCache.data && Date.now() - githubCache.lastFetch < CONFIG.TIMERS.CACHE_DURATION) {
        return githubCache.data;
    }
    try {
        const response = await fetch(`${CONFIG.GITHUB.REPO_URL}?per_page=${count}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'If-None-Match': githubCache.etag,
                'User-Agent': 'Kenium-Music-Bot'
            }
        });
        if (response.status === 304) return githubCache.data;
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
        githubCache.etag = response.headers.get('etag') || '';
        githubCache.lastFetch = Date.now();
        return (githubCache.data = await response.json());
    } catch (error) {
        console.error("Error fetching commits:", error);
        throw error;
    }
}

function formatCommitMessage(message) {
    const match = message.match(/^([a-z]+)(?:\([\w-]+\))?:\s*/i);
    let type = match ? `[${match[1].toUpperCase()}] ` : '';
    let cleanMessage = match ? message.slice(match[0].length) : message;
    return `${type}${cleanMessage.length > CONFIG.DISPLAY.COMMIT_MESSAGE_MAX_LENGTH ? cleanMessage.slice(0, CONFIG.DISPLAY.COMMIT_MESSAGE_MAX_LENGTH - 3) + '...' : cleanMessage}`;
}

async function sendChangelogEmbed(interaction, commits) {
    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.PRIMARY)
        .setTitle(`Kenium Music Changelog v${CONFIG.BOT.VERSION}`)
        .setDescription(`## Current Release\n${CONFIG.BOT.CHANGELOG.map(i => `• ${i}`).join('\n')}\n\n` +
            `## 📊 Github Recent Changes\n${commits.map(c => `• [\`${c.sha.slice(0, 7)}\`](${c.html_url}) **${formatCommitMessage(c.commit.message)}** by \`${c.commit.author.name}\` (${new Date(c.commit.author.date).toLocaleDateString()})`).join('\n')}`)
        .setFooter({ text: `Kenium Music v${CONFIG.BOT.VERSION} • Made by ${CONFIG.BOT.DEVELOPER}`, iconURL: interaction.guild?.iconURL() })
        .setTimestamp();
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Repository').setEmoji('📁').setURL(CONFIG.GITHUB.REPO_LINK).setStyle(ButtonStyle.Link),
        new ButtonBuilder().setLabel('Commit History').setEmoji('📜').setURL(CONFIG.GITHUB.COMMITS_LINK).setStyle(ButtonStyle.Link),
        new ButtonBuilder().setLabel('Report Issue').setEmoji('🐛').setURL(CONFIG.GITHUB.ISSUES_LINK).setStyle(ButtonStyle.Link)
    );

    await interaction.editReply({ embeds: [embed], components: [buttons] });
}

const cooldowns = new Map();

export const Command = {
    name: "changelog",
    description: "stuff that my owner coded on me",
    run: async (client, interaction) => {
        const userId = interaction.user.id;
        const now = Date.now();
        if (cooldowns.has(userId) && now - cooldowns.get(userId) < CONFIG.TIMERS.COOLDOWN_DURATION) {
            return interaction.reply({ content: `⏳ Please wait **${((CONFIG.TIMERS.COOLDOWN_DURATION - (now - cooldowns.get(userId))) / 1000).toFixed(1)}** seconds before using this command again.`, flags: 64 });
        }
        cooldowns.set(userId, now);
        try {
            await interaction.deferReply();
            const commits = await fetchCommits(CONFIG.DISPLAY.DEFAULT_COMMIT_COUNT);
            await sendChangelogEmbed(interaction, commits);
        } catch (error) {
            console.error("Error in changelog command:", error);
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(CONFIG.COLORS.ERROR).setTitle("⚠️ Error Fetching Changelog").setDescription(`Failed to get the latest changes.\n\`\`\`${error.message || 'Unknown error'}\`\`\``).setFooter({ text: `Made with ❤️ by ${CONFIG.BOT.DEVELOPER}` })]
            });
        }
    }
};
