import { Embed, Declare, Command, type CommandContext } from "seyfert";

@Declare({
  name: 'ping',
  description: 'ping the bot',
})
export default class pingCmds extends Command {
  public override async run(ctx: CommandContext): Promise<void> {
    try {
      const { client } = ctx;

      const embed = new Embed()

      const shardId = ctx.shardId;

      const wsPing = Math.floor(client.gateway.latency);
      const shardPing = Math.floor((await ctx.client.gateway.get(shardId)?.ping()) ?? 0);

      let playerping = 0;
      const player = client.aqua.players.get(ctx.guildId);
      if (player) {
        playerping = Math.floor(player.ping);
      }

      embed
        .setColor(0)
        .setDescription(`**Gateway**: ${wsPing}ms\n**Shard**: ${shardPing}ms\n**Player**: ${playerping}ms`);

      await ctx.write({ embeds: [embed] });
    } catch (error) {
      if (error.code === 10065) return;
    }
  }
}