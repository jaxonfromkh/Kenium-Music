import { Command, Declare, type CommandContext, Embed, Middlewares} from 'seyfert'

@Declare({
    name: 'autoplay',
    description: 'Toggle autoplay',
})
@Middlewares(['checkPlayer', 'checkVoice', 'checkTrack'])
export default class autoPlaycmd extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;

            const player = client.aqua.players.get(ctx.guildId!);
            const newState = !player.isAutoplayEnabled;
            player.setAutoplay(newState);

        const embed = new Embed()
            .setColor(newState ? "#000000" : "#000000")
            .setTitle("Autoplay Status")
            .setDescription(`Autoplay has been **${newState ? "enabled" : "disabled"}**.`)
            .setFooter({ text: "Autoplay", iconUrl: client.me.avatarURL() })
            .setTimestamp();

            await ctx.editOrReply({ embeds: [embed], flags: 64 });
        } catch (error) {
            if (error.code === 10065) return;
        }
    }
}