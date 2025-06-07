import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CONFIG = {
    GITHUB: {
        API_URL: 'https://api.github.com/repos/ToddyTheNoobDud/Kenium-Music/commits',
        REPO_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music',
        COMMITS_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music/commits/main',
        ISSUES_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music/issues/new',
    },
    BOT: {
        VERSION: '3.5.0',
        DEVELOPER: "mushroom0162",
        CHANGELOG: [
            `✨ Rewrited the playlist system, it's now much more efficient.`,
            `🐛 Improved the play-file command performance.`,        
            `🐛 Fixed some body errors returned by discord.`,
            `✨ Rewrited the database handler, it's now much more efficient and faster.`,
            `Released at: <t:1748636520:R>`
        ]
    },
    COLORS: { 
        PRIMARY: 0,
        SECONDARY: 0x2979FF,
        ERROR: 0xFF5252
    },
    TIMERS: { 
        CACHE_DURATION: 900000,
        COOLDOWN_DURATION: 30000 
    },
    DISPLAY: { 
        COMMIT_MESSAGE_MAX_LENGTH: 80, 
        DEFAULT_COMMIT_COUNT: 5,
        EMOJIS: {
            RELEASE: "🚀",
            GITHUB: "🔆",
            REPO: "📁",
            COMMITS: "📜",
            ISSUE: "🐛"
        }
    }
};

const githubCache = {
    data: null,
    etag: '',
    lastFetch: 0,
    clear() {
        this.data = null;
        this.etag = '';
    }
};

async function fetchCommits(count = CONFIG.DISPLAY.DEFAULT_COMMIT_COUNT) {
    if (githubCache.data && (Date.now() - githubCache.lastFetch < CONFIG.TIMERS.CACHE_DURATION)) {
        return githubCache.data;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); 
        
        const response = await fetch(`${CONFIG.GITHUB.API_URL}?per_page=${count}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'If-None-Match': githubCache.etag,
                'User-Agent': 'Kenium-Music-Bot'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 304) return githubCache.data;
        
        if (!response.ok) {
            throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
        }
        
        githubCache.etag = response.headers.get('etag') || '';
        githubCache.lastFetch = Date.now();
        githubCache.data = await response.json();
        
        return githubCache.data;
    } catch (error) {
        console.error("Error fetching GitHub commits:", error);
        if (error.name === 'AbortError') {
            throw new Error('GitHub API request timed out');
        }
        throw error;
    }
}

function formatCommitMessage(message) {
    if (!message) return "No message";
    
    const match = message.match(/^([a-z]+)(?:\([\w-]+\))?:\s*/i);
    
    const type = match ? `\`${match[1].toUpperCase()}\`` : '';
    const cleanMessage = match ? message.slice(match[0].length) : message;
    
    const truncated = cleanMessage.length > CONFIG.DISPLAY.COMMIT_MESSAGE_MAX_LENGTH 
        ? cleanMessage.slice(0, CONFIG.DISPLAY.COMMIT_MESSAGE_MAX_LENGTH - 3) + '...' 
        : cleanMessage;
    
    return type ? `${type} ${truncated}` : truncated;
}

async function sendChangelogEmbed(interaction, commits) {
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
    };

    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.PRIMARY)
        .setTitle(`${CONFIG.DISPLAY.EMOJIS.RELEASE} Kenium Music v${CONFIG.BOT.VERSION}`)
        .setDescription([
            `## Latest Release`,
            CONFIG.BOT.CHANGELOG.map(i => `> ${i}`).join('\n'),
            '',
            `## ${CONFIG.DISPLAY.EMOJIS.GITHUB} Recent Changes`,
            commits.map(c => {
                const shortSha = c.sha.slice(0, 7);
                const message = formatCommitMessage(c.commit.message);
                const author = c.commit.author.name;
                const date = formatDate(c.commit.author.date);
                
                return `> [\`${shortSha}\`](${c.html_url}) ${message} by **${author}** ${date}`;
            }).join('\n')
        ].join('\n'))
        .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 128 }))
        .setFooter({ 
            text: `Kenium Music v${CONFIG.BOT.VERSION} • Developed by ${CONFIG.BOT.DEVELOPER}`, 
            iconURL: interaction.guild?.iconURL() || interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Repository')
            .setEmoji(CONFIG.DISPLAY.EMOJIS.REPO)
            .setURL(CONFIG.GITHUB.REPO_URL)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('Commit History')
            .setEmoji(CONFIG.DISPLAY.EMOJIS.COMMITS)
            .setURL(CONFIG.GITHUB.COMMITS_URL)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('Report Issue')
            .setEmoji(CONFIG.DISPLAY.EMOJIS.ISSUE)
            .setURL(CONFIG.GITHUB.ISSUES_URL)
            .setStyle(ButtonStyle.Link)
    );

    await interaction.editReply({ 
        embeds: [embed], 
        components: [buttons] 
    });
}

const cooldowns = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of cooldowns.entries()) {
        if (now - timestamp >= CONFIG.TIMERS.COOLDOWN_DURATION) {
            cooldowns.delete(userId);
        }
    }
}, 60000);

export const Command = {
    name: "changelog",
    description: "stuff that my owner coded on me.",
    
    run: async (client, interaction) => {
        const userId = interaction.user.id;
        const now = Date.now();
        
        if (cooldowns.has(userId)) {
            const timeLeft = CONFIG.TIMERS.COOLDOWN_DURATION - (now - cooldowns.get(userId));
            if (timeLeft > 0) {
                return interaction.reply({ 
                    content: `⏳ Please wait **${(timeLeft / 1000).toFixed(1)}** seconds before using this command again.`, 
                    flags: 64 
                });
            }
        }
        
        cooldowns.set(userId, now);
        
        try {
            await interaction.deferReply();
            const commits = await fetchCommits();
            await sendChangelogEmbed(interaction, commits);
        } catch (error) {
            console.error("Error in changelog command:", error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.ERROR)
                .setTitle("⚠️ Error Fetching Changelog")
                .setDescription([
                    "Failed to get the latest changes.",
                    "",
                    "```",
                    error.message || 'Unknown error',
                    "```"
                ].join('\n'))
                .setFooter({ 
                    text: `Made with ❤️ by ${CONFIG.BOT.DEVELOPER}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                });
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};