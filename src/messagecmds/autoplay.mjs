import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "autoplay",
    description: "Toggle autoplay",
    options: [],
    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guild.id);

        if (!player) {
            return message.reply({ 
                content: "Nothing is playing", 
                flags: 64 
            });
        }

        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) {
            return message.reply({ 
                content: "You must be in the same voice channel as the bot.", 
                flags: 64 
            });
        }

        const newState = !player.isAutoplayEnabled;
        player.setAutoplay(newState);

        const embed = new EmbedBuilder()
            .setColor(newState ? "#000000" : "#000000") 
            .setTitle("Autoplay Status")
            .setDescription(`Autoplay has been **${newState ? "enabled" : "disabled"}**.`)
            .setFooter({ text: "Autoplay Toggle", iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        return message.reply({
            embeds: [embed],
            flags: 64
        });
    }
};
