import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { Classic } from "musicard";
import { client } from "../../../bot.mjs";

client.riffy.on('trackStart', async (player, track) => {

    const channel = client.channels.cache.get(player.textChannel);

    function formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    }

    const musicLength = track.info.length;

    const musicard = await Classic({
        thumbnailImage: track.info.thumbnail,
        name: track.info.title,
        author: `By ${track.info.author}`,
        endTime: formatTime(Math.round(musicLength / 1000)),
        nameColor: "#ffffff",
        authorColor: '#696969',
        progress: 0,
        progressColor: '#00ff00',
    });

    const msg = await channel
    .send({
        files: [{attachment: musicard}],
        content: "**Player by mushroom0162, Lavalink v4.0.8 !!!**"})
    .then((x) => (player.message = x));
});