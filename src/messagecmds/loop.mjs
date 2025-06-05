import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "loop",
    description: "Want some loop bro?",
    usage: "<track|queue|off>",
    run: async (client, message, args) => {
        if (!message.member?.voice?.channel) return;
        const player = client.aqua.players.get(message.guildId);
        if (!player) return message.reply({ content: "Nothing is playing" });
        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;

        const mode = args[0]?.toLowerCase();
        if (!["track", "queue", "off"].includes(mode)) {
            return message.reply({ content: "Usage: !loop <track|queue|off>" });
        }

        switch (mode) {
            case "track":
                player.setLoop('track');
                break;
            case "queue":
                player.setLoop('queue');
                break;
            case "off":
                player.setLoop('none');
                break;
        }

        const status = mode === "off" ? "disabled" : player.loop ? "enabled" : "disabled";
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x000000)
                    .setDescription(`${mode === "off" ? "Looping" : `Current song loop`} has been ${status}.`)
            ],
        });
    }
}
