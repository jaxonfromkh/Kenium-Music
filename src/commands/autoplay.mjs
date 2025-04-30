import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "autoplay",
    description: "Toggle autoplay",
    options: [],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guild.id);

        if (!player) {
            return interaction.reply({ 
                content: "Nothing is playing", 
                flags: 64 
            });
        }

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
            return interaction.reply({ 
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

        return interaction.reply({
            embeds: [embed],
            flags: 64
        });
    }
};
