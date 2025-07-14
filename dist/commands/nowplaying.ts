import { Command, Declare, type CommandContext, Embed, Middlewares } from "seyfert";
import { CooldownType, Cooldown } from '@slipher/cooldown';


async function formatTime(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
async function getDescription(player: any, { info: { title, uri, author, album, length, isStream }, requester }: any) {
    const { position, volume, loop } = player;
    return `**[${title}](${uri})**\n*by* **${author}** • *${album || 'Single'}* • *${isStream ? '  LIVE' : '  320kbps'}*\n\n` +
        `\`${formatTime(position)}\` ${createProgressBar(length, position)} \`${formatTime(length)}\`\n\n` +
        `${volume > 50 ? ' ' : ' '} \`${volume}%\` • ${getLoopStatus(loop)} •  <@${requester.id}>`;
}
async function createProgressBar(total: number, current: number, length = 15) {
    if (total === 0) return '`[----------]`';
    const progress = Math.round((current / total) * length);
    return `\`[${' '.repeat(progress)}   ${' '.repeat(length - progress)}]\``;
}
async function getLoopStatus(loop: string) {
    return {
        track: '   Track Loop',
        queue: '   Queue Loop',
        none: '   No Loop'
    }[loop] || '   No Loop';
}

@Cooldown({
    type: CooldownType.User,
    interval: 1000 * 60,
    uses: {
        default: 2
    },
})

@Declare({
    name: "nowplaying",
    description: "Displays the currently playing song.",
})
@Middlewares(["cooldown", "checkPlayer"])


export default class nowplayngcmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;

            const player = client.aqua.players.get(ctx.guildId!);

            const track = player.current!;

          const embed = new Embed()
            .setColor(0)
            .setAuthor({
                name: '🎵 Kenium 4.0.0',
                iconUrl: client.me.avatarURL(),
                url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
            })
            .setDescription(await getDescription(player, track))
            .setThumbnail(track.info.artworkUrl || client.me.avatarURL())
            .setFooter({
                text: 'An Open Source Bot',
                iconUrl: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png'
            });

            await ctx.editOrReply({ embeds: [embed] , flags: 64 });
        } catch (error) {
            if (error.code === 10065) return;
        }
    }
}
