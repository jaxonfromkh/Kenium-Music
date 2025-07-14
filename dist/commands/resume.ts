import {Command, Declare, type CommandContext, Embed, Middlewares} from 'seyfert'

@Declare({
    name: 'resume',
    description: 'resume the music',
})

@Middlewares(["checkPlayer", "checkVoice"])
export default class resumecmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
        const { client } = ctx;

        const player = client.aqua.players.get(ctx.guildId!);

        player.pause(false);

        await ctx.editOrReply({ embeds: [new Embed().setDescription('Paused the song').setColor(0)], flags: 64 });
                } catch (error) {
           if(error.code === 10065) return;
        }
    }
}