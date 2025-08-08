import { Embed, ActionRow, Button, CommandContext, Declare, Command, Middlewares } from 'seyfert';
import { ButtonStyle } from 'seyfert/lib/types';
import { CooldownType, Cooldown } from "@slipher/cooldown";

const CONFIG = {
    GITHUB: {
        API_URL: 'https://api.github.com/repos/ToddyTheNoobDud/Kenium-Music/commits?per_page=7',
        REPO_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music',
        COMMITS_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music/commits/main',
        ISSUES_URL: 'https://github.com/ToddyTheNoobDud/Kenium-Music/issues/new',
    },
    BOT: {
        VERSION: '4.3.0',
        DEVELOPER: "mushroom0162",
        CHANGELOG: `> Rewrited the whole database, it's now much more efficient, and extremly fast.
> Rewrited the bot handler for more performance.
> Made a new UI for the playback system
> Rewrited the lyrics fetching with musixmatch (OWN implementation)
> Optimized the voice handling
> Fixed a few bugs with button handling`   },
    COLORS: {
        PRIMARY: 0,
        ERROR: 0xFF5252
    },
    DISPLAY: {
        COMMIT_MESSAGE_MAX_LENGTH: 77, // Optimized for ...
        EMOJIS: {
            RELEASE: "🚀",
            GITHUB: "🔆",
            REPO: "📁",
            COMMITS: "📜",
            ISSUE: "🐛"
        }
    }
} as const;

// Optimized regex patterns (compiled once)
const COMMIT_TYPE_REGEX = /^([a-z]+)(?:\([^)]+\))?:\s*/i;
const COMMIT_MESSAGE_CLEANUP_REGEX = /^\w+(?:\([^)]+\))?:\s*/;

async function fetchCommits(): Promise<any[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // Reduced timeout

    try {
        const response = await fetch(CONFIG.GITHUB.API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Kenium-Music-Bot'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

function formatCommitMessage(message: string): string {
    if (!message?.trim()) return "No message";

    // Single regex operation instead of match + slice
    const cleanMessage = message.replace(COMMIT_MESSAGE_CLEANUP_REGEX, '');
    const typeMatch = COMMIT_TYPE_REGEX.exec(message);

    // Optimized truncation
    const truncated = cleanMessage.length > CONFIG.DISPLAY.COMMIT_MESSAGE_MAX_LENGTH
        ? `${cleanMessage.slice(0, CONFIG.DISPLAY.COMMIT_MESSAGE_MAX_LENGTH)}...`
        : cleanMessage;

    return typeMatch ? `\`${typeMatch[1].toUpperCase()}\` ${truncated}` : truncated;
}

function createChangelogEmbed(ctx: CommandContext, commits: any[]): Embed {
    // Pre-calculate timestamp to avoid repeated calls
    const now = Math.floor(Date.now() / 1000);

    // Build commits string in single pass
    const commitsText = commits.map(commit => {
        const shortSha = commit.sha.slice(0, 7);
        const message = formatCommitMessage(commit.commit.message);
        const author = commit.commit.author.name;
        const timestamp = Math.floor(new Date(commit.commit.author.date).getTime() / 1000);

        return `> [\`${shortSha}\`](${commit.html_url}) ${message} by **${author}** <t:${timestamp}:R>`;
    }).join('\n');

    // Single description build
    const description = `## Latest Release
${CONFIG.BOT.CHANGELOG}

## ${CONFIG.DISPLAY.EMOJIS.GITHUB} Recent Changes
${commitsText}`;

    return new Embed()
        .setColor(CONFIG.COLORS.PRIMARY)
        .setTitle(`${CONFIG.DISPLAY.EMOJIS.RELEASE} Kenium Music v${CONFIG.BOT.VERSION}`)
        .setDescription(description)
        .setThumbnail(ctx.client.me.avatarURL({ size: 128 }))
        .setFooter({
            text: `Kenium Music v${CONFIG.BOT.VERSION} • Developed by ${CONFIG.BOT.DEVELOPER}`,
            iconUrl: ctx.client.me.avatarURL()
        })
        .setTimestamp();
}

function createActionRow(): ActionRow {
    return new ActionRow().addComponents(
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
}

@Declare({
    name: 'changelog',
    description: 'stuff that my owner coded on me.'
})
@Cooldown({
    type: CooldownType.User,
    interval: 60000, // 1 minute
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
            const embed = createChangelogEmbed(ctx, commits);
            const buttons = createActionRow();

            await ctx.editOrReply({
                embeds: [embed],
                components: [buttons]
            });

        } catch (error) {
            console.error("Changelog error:", error);

            const errorEmbed = new Embed()
                .setColor(CONFIG.COLORS.ERROR)
                .setTitle("⚠️ Error Fetching Changelog")
                .setDescription(`Failed to get the latest changes.\n\`\`\`\n${error.message || 'Unknown error'}\n\`\`\``)
                .setFooter({
                    text: `Made with ❤️ by ${CONFIG.BOT.DEVELOPER}`,
                    iconUrl: ctx.client.me.avatarURL()
                });

            await ctx.editOrReply({ embeds: [errorEmbed] });
        }
    }
}