import { Declare, Command, type CommandContext, Embed, Middlewares } from 'seyfert'

@Declare({
    name: 'shuffle',
    description: 'shuffle your queue'
})
@Middlewares(['checkPlayer', 'checkVoice', 'checkTrack'])
export default class shuffleCmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;

            const player = client.aqua.players.get(ctx.guildId!);

            player.shuffle();

            await ctx.editOrReply({ embeds: [new Embed().setDescription('Shuffled the queue').setColor(0)], flags: 64 });
        } catch (error) {
            if (error.code === 10065) return;
        }
    }
}