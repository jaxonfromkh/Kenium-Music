export const Command = {
    name: "restart",
    description: "Restart the music",
    options: [],

    run: async (client, message) => { 
        try {
            const vc = message.member?.voice?.channel;
            if (!vc) return;

            const player = client.aqua.players.get(message.guildId)
            if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

            if (!player) return;

            player.replay();

            return message.reply({ content: "Restarted the music", flags: 64 });

        } catch (e) {
            console.log(e);
        }
        
    }
};