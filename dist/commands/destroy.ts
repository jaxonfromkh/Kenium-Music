import { Command, Declare, type CommandContext, Embed, Middlewares} from 'seyfert'

@Declare({
    name: 'destroy',
    description: 'destroy the music',
})
@Middlewares(['checkPlayer', 'checkVoice'])
export default class destroycmd extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;
    
            const player = client.aqua.players.get(ctx.guildId!);
    
            player.destroy();
    
            await ctx.editOrReply({ embeds: [new Embed().setDescription('Destroyed the music').setColor(0)], flags: 64 });
        } catch (error) {
            if(error.code === 10065) return;
        }
    }
}