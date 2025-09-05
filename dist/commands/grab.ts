import { Command, Declare, type CommandContext, Embed, Middlewares  } from "seyfert";

@Declare({
    name: 'grab',
    description: 'Grab current song and send to dms. (No VC needed)',
})
@Middlewares(['checkPlayer'])
export default class Grab extends Command {
    public override async run(ctx: CommandContext) {
        try {
            const { client } = ctx;

            const player = client.aqua.players.get(ctx.guildId!);

            const song = player.current!;
            const trackEmbed = new Embed()
            .setTitle(`Now Playing: **${song.title}**`)
            .setDescription(`[Listen Here](${song.uri})`)
            .addFields(
                { name: "> ⏱️ Duration", value: `> \`${song.length / 1000} seconds\``, inline: true },
                { name: "> 👤 Author", value: `> \`${song.author}\``, inline: true },
            )
            .setColor(0)
            .setThumbnail(song.thumbnail);

            try {
                await ctx.author.write({ embeds: [trackEmbed], content: `from ${(await ctx.guild()).name}` });
                return ctx.write({ content: "I've sent you the track details in your DMs.", flags: 64 });
            } catch (error) {
                console.error(error);
                return ctx.write({ content: "I couldn't send you a DM. Please check your privacy settings.", flags: 64 });
            }

        } catch (error) {
            if(error.code === 10065) return;
        }
    }
}