import { Command, Declare, type CommandContext, Embed, Middlewares, createStringOption, Options } from "seyfert";

@Options({
    loop: createStringOption({
        description: 'select your loop mode',
        required: true,
        choices: [
            { name: 'none', value: 'none' },
            { name: 'song', value: 'track' },
            { name: 'queue', value: 'queue' }
        ]
    })
})
@Middlewares(["checkVoice", "checkPlayer"])
@Declare({
    name: 'loop',
    description: 'Want some loop bro?'
})
export default class LoopCommand extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;
            const { loop } = ctx.options as { loop: string };

            const player = client.aqua.players.get(ctx.guildId!);
            // @ts-ignore
            player.setLoop(loop);

            const status = loop === "none" ? "disabled" : player.loop ? "enabled" : "disabled";

            await ctx.editOrReply({
                embeds: [
                    new Embed()
                        .setColor(0x000000)
                        .setDescription(`${loop === "none" ? "Looping" : `Current song loop`} has been ${status}.`)
                ],
                flags: 64
            });
        } catch (error) {
            if (error.code === 10065) return;
        }
    }
}