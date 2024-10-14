import { client } from "../../../bot.mjs";

client.riffy.on('trackError', async (player, track, payload) => {
    console.log(payload);
})