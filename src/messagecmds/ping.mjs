import { EmbedBuilder } from 'discord.js'

export const Command = {
    name: "ping",
    description: "Pong!",
    run: async (client, message) => { 
        try {
            const embed = new EmbedBuilder()
                .setColor(0x000000)
                .setTitle("Pong!")
                .addFields([
                    {
                        name: "API Ping",
                        value: `\`${client.ws.ping}\` ms`,
                        inline: true,
                    },
                    {
                        name: "Bot Ping",
                        value: `\`${Date.now() - message.createdTimestamp}\` ms`,
                        inline: true,
                    },
                ])
                .setFooter({ text: "Made by mushroom0162" })
            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.log(error)
        }
    }
}


