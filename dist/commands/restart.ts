import { Command, Declare, type CommandContext, Embed , Middlewares} from 'seyfert'

@Declare({
    name: 'restart',
    description: 'Restart the music',
})
@Middlewares(['checkPlayer', 'checkVoice', 'checkTrack'])
export default class restartStuff extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;

            const player = client.aqua.players.get(ctx.guildId!);

            player.replay();

            await ctx.editOrReply({ embeds: [new Embed().setDescription('Restarted the music').setColor(0)], flags: 64 });
        } catch (error) {
            if (error.code === 10065) return;
        }
    }
}