import { Command, Declare, type CommandContext, Embed, Middlewares } from "seyfert";
import { CooldownType, Cooldown } from '@slipher/cooldown';

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function getVolumeEmoji(volume = 100) {
  if (volume === 0) return '🔇';
  if (volume <= 33) return '🔈';
  if (volume <= 66) return '🔉';
  return '🔊';
}

function getLoopBadge(loop: string) {
  return {
    track: '⟲ Track',
    queue: '⟳ Queue',
    none: '✖ Loop Off'
  }[loop] || '✖ Loop Off';
}

function createProgressBar(totalMs: number, currentMs: number, size = 18) {
  if (!totalMs || totalMs <= 0) return '🔴 LIVE';
  const ratio = Math.min(Math.max(currentMs / totalMs, 0), 1);
  const knobPos = Math.round(ratio * (size - 1));
  let bar = '';
  for (let i = 0; i < size; i++) {
    bar += i === knobPos ? '●' : '─';
  }
  return bar;
}

function getDescription(player: any, track: any) {
  const { info: { title, uri, author, album, length, isStream }, requester } = track;
  const position = player?.position ?? 0;
  const volume = player?.volume ?? 100;
  const loop = player?.loop ?? 'none';
  const statusEmoji = player?.paused ? '⏸' : '▶️';

  const albumOrSingle = album?.trim() ? album : 'Single';
  const qualityBadge = isStream ? '🔴 LIVE' : '🎧 320 kbps';

  const progress = isStream
    ? '🔴 LIVE'
    : `\`${formatTime(position)}\` \`${createProgressBar(length, position, 18)}\` \`${formatTime(length)}\``;

  return [
    `**[${title}](${uri})** — by **${author}**`,
    `*${albumOrSingle}* • ${qualityBadge}`,
    '',
    progress,
    '',
    `${getVolumeEmoji(volume)} \`${volume}%\` • ${getLoopBadge(loop)} • ${statusEmoji} • 👤 <@${requester.id}>`
  ].join('\n');
}

@Cooldown({
  type: CooldownType.User,
  interval: 1000 * 60,
  uses: { default: 2 },
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
      const track = player.current;

      const embed = new Embed()
        .setColor(0x000000)
        .setAuthor({
          name: '🎵 Kenium 4.3.0 • Now Playing',
          iconUrl: client.me.avatarURL(),
          url: 'https://github.com/ToddyTheNoobDud/Kenium-Music'
        })
        .setDescription(getDescription(player, track))
        .setThumbnail(track.info.artworkUrl || client.me.avatarURL())

      await ctx.editOrReply({ embeds: [embed], flags: 64 });
    } catch (error: any) {
      if (error?.code === 10065) return;
    }
  }
}