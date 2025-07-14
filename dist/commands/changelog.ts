import { Embed, ActionRow, Button, CommandContext, Declare, Command, Middlewares} from 'seyfert';
import { ButtonStyle } from 'seyfert/lib/types';
import { CooldownType, Cooldown } from "@slipher/cooldown";

const CONFIG = {
    GITHUB: {
        API_URL: 'https://api.github.com/repos/ToddyTheNoobDud/Kenium-Music/commits',
        REPO_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music',
        COMMITS_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music/commits/main',
        ISSUES_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music/issues/new',
    },
    BOT: {
        VERSION: '4.0.0',
        DEVELOPER: "mushroom0162",
        CHANGELOG: [
            `# Full bot rewrite`,
            `✨ Rewrited the whole core, commands, handling, database into typescript`,
            `🐛 Moved from discord.js to seyfert for way more speed, less memory usage.`,        
            `🐛 Many bug fixes and features itself from seyfert.`,
            `✨ Rewrited all the commands, bug fixes in process.`,
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

async function sendChangelogEmbed(ctx, commits) {
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
    };

    const embed = new Embed()
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
        .setThumbnail(ctx.client.me.avatarURL({ dynamic: true, size: 128 }))
        .setFooter({ 
            text: `Kenium Music v${CONFIG.BOT.VERSION} • Developed by ${CONFIG.BOT.DEVELOPER}`, 
            iconUrl:        (await ctx.guild()).iconURL() || ctx.client.me.avatarURL()
        })
        .setTimestamp();
    
    const buttons = new ActionRow().addComponents(
        new Button()
            .setLabel('Repository')
            .setEmoji(CONFIG.DISPLAY.EMOJIS.REPO)
            .setURL(CONFIG.GITHUB.REPO_URL)
            .setStyle(ButtonStyle.Link),
        new Button()
            .setLabel('Commit History')
            .setEmoji(CONFIG.DISPLAY.EMOJIS.COMMITS)
            .setURL(CONFIG.GITHUB.COMMITS_URL)
            .setStyle(ButtonStyle.Link),
        new Button()
            .setLabel('Report Issue')
            .setEmoji(CONFIG.DISPLAY.EMOJIS.ISSUE)
            .setURL(CONFIG.GITHUB.ISSUES_URL)
            .setStyle(ButtonStyle.Link)
    );

    await ctx.editOrReply({ 
        embeds: [embed], 
        components: [buttons] 
    });
}

@Declare({
	name: 'changelog',
	description: 'stuff that my owner coded on me.'
})

@Cooldown({
	type: CooldownType.User,
	interval: 1000 * 60,
	uses: {
		default: 2
	},
})
@Middlewares(["cooldown"])

export default class Changelog extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
          try {
            await ctx.deferReply();
            const commits = await fetchCommits();
            await sendChangelogEmbed(ctx, commits);
        } catch (error) {
            console.error("Error in changelog command:", error);
            
            const errorEmbed = new Embed()
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
                    iconUrl: ctx.client.me.avatarURL()
                });
            
            await ctx.editOrReply({ embeds: [errorEmbed] });
        }
    }
}