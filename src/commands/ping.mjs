import { EmbedBuilder } from 'discord.js';

export const Command = {
    name: "ping",
    description: "Pong!",
    run: async (client, interaction) => {
        try {
            const apiPing = client.ws.ping;
            const botPing = Date.now() - interaction.createdTimestamp;

            const embed = new EmbedBuilder()
                .setColor(0x000000)
                .setTitle("Pong!")
                .addFields(
                    { name: "API Ping", value: `\`${apiPing}\` ms`, inline: true },
                    { name: "Bot Ping", value: `\`${botPing}\` ms`, inline: true }
                )
                .setFooter({ text: "Made by mushroom0162" });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
        }
    }
};
