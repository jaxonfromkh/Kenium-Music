import { Command, Declare, type CommandContext, Embed, Middlewares} from 'seyfert'

@Declare({
    name: 'clear',
    description: 'Clear the music queue',
})
@Middlewares(['checkPlayer', 'checkVoice'])

export default class clearcmds extends Command{
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;
    
            const player = client.aqua.players.get(ctx.guildId!);
    
            player.queue.clear()
    
            await ctx.editOrReply({ embeds: [new Embed().setDescription('Cleared the queue').setColor(0)], flags: 64 });
        } catch (error) {
            if(error.code === 10065) return;
        }
    }
}