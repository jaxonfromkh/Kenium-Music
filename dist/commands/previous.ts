import { Command, Declare, type CommandContext, Embed, Middlewares} from 'seyfert'

@Declare({
    name: 'previous',
    description: 'Play the previous song',
})
@Middlewares(["checkPlayer", "checkVoice"])
export default class previoiusCmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;

            const player = client.aqua.players.get(ctx.guildId!);
            player.queue.unshift(player.previous);
            player.stop();

            await ctx.editOrReply({ embeds: [new Embed().setDescription('Playing the previous song').setColor(0)], flags: 64 });
        } catch (error) {
            if(error.code === 10065) return;
        }
    }
}