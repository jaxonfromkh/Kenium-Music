import { Command, Declare, type CommandContext, Embed, Options, Middlewares } from "seyfert";
import { createIntegerOption } from "seyfert";

@Options({
    time: createIntegerOption({
        description: 'Time to seek (in secs)',
        required: true,
    })
})

@Declare({
    name: 'seek',
    description: 'Seek to a specific position in the song',
})
@Middlewares(["checkPlayer", "checkVoice"])
export default class Seek extends Command {
    async run(ctx: CommandContext) {
      try {
          const { client } = ctx;

        const player = client.aqua.players.get(ctx.guildId!);
        const { time } = ctx.options as { time: number };

        player.seek(time * 1000);

        await ctx.editOrReply({ embeds: [new Embed().setDescription('Seeked the song').setColor(0)], flags: 64 });
      } catch (error) {
         if(error.code === 10065) return;
      }
    }
}