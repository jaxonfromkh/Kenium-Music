import { EmbedBuilder } from 'discord.js'

export const Command = {
    name: "ping",
    description: "Pong!",
    run: async (client, interaction) => {
        try {
            const lavalinkStatus = client.riffy.on("nodeStatusUpdate", (node, payload) => {
                client.riffy.nodes.forEach((n) => {
                    if (n.id === node.id) {
                        lavalinkStatus = {
                            connected: n.connected,
                        };
                    }
                });
            });

            const apiPing = client.ws.ping;
            const ping = Date.now() - interaction.createdTimestamp;
            const embed = new EmbedBuilder()
                .setColor(0x000000)
                .setTitle("Pong!")
                .addFields([
                    {
                        name: "API Ping",
                        value: `\`${apiPing}\` ms`,
                        inline: true,
                    },
                    {
                        name: "Bot Ping",
                        value: `\`${ping}\` ms`,
                        inline: true,
                    },
                    {
                        name: "Lavalink Status",
                        value: lavalinkStatus ? "\`Connected\`" : "Disconnected",
                        inline: false,
                    },
                ])
                .setFooter({ text: "Made by mushroom0162" })
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.log(error)
        }
    }
}

