import { Command, Declare, type CommandContext, Embed, Middlewares, Options, createStringOption } from 'seyfert'

@Options({
    tts: createStringOption({
        description: 'Generate and send a TTS message',
        required: true,
        max_length: 500,
        min_length: 1
    })
})
@Middlewares([ 'checkVoice'])
@Declare({
    name: 'tts',
    description: 'Generate and send a TTS message'
})

export default class TTSCommand extends Command {
    async run(ctx: CommandContext) {
        const { tts  } = ctx.options as { tts: string };

        const player = ctx.client.aqua.players.get(ctx.guildId!);

        if (!player) {
            await ctx.client.aqua.createConnection({
                guildId: ctx.guildId!,
                voiceChannel: (await ctx.member?.voice())?.channelId,
                textChannel: ctx.channelId,
                deaf: true,
                defaultVolume: 65
            })
            return;
        }

        if (player) {
            const resolved = ctx.client.aqua.resolve({
                query: tts,
                source: 'speak',
                requester: ctx.interaction.user
            })
            player.queue.add((await resolved).tracks[0]);
            if (!player.playing && !player.paused && player.queue.size > 0) {
                player.play();
            }
        }
    }
}