import { createMiddleware, Formatter } from 'seyfert';

export const checkPlayer = createMiddleware<void>(async ({ context, pass, next }) => {
     if (!context.inGuild()) return next();

    const { client } = context;

    const player = client.aqua.players.get(context.guildId!);

    if (!player) {
        await context.editOrReply({
            flags: 64,
            content: "❌ No active player found."
        })
        return pass();
    }

    next()
});


export const checkVoice = createMiddleware<void>(async ({ context, pass, next }) => {
    if (!context.inGuild()) return next();

    let memberVoice = await context.member?.voice().catch(() => null);
    let botvoice = await (await context.me()).voice().catch(() => null);
    if (!memberVoice || botvoice && botvoice.channelId !== memberVoice.channelId) return pass();

    next()
});

export const checkTrack = createMiddleware<void>(async ({ context, pass, next }) => {
    if (!context.inGuild()) return next();

    const { client } = context;

    const player = client.aqua.players.get(context.guildId!);

    if (!player?.current) {
        await context.editOrReply({
            flags: 64,
            content: "❌ No active track found."
        })
        return pass();
    }

    next()
});