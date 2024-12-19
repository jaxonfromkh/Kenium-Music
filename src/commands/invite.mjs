import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export const Command = {
    name: "invite",
    description: "Invite kenium cuz yes",
    options: [],
    run: async (client, interaction) => {
        // Create the embed
        const embed = new EmbedBuilder()
            .setAuthor({ 
                name: "Kenium v2.4.0 | by mushroom0162", 
                iconURL: client.user.avatarURL() 
            })
            .setDescription(`**Invite me to your server with [\`This link\`](https://discord.com/oauth2/authorize?client_id=1202232935311495209) and I'll try my best to play music...
            Inviting me helps my lazy dev to keep this updated and hosted... ITS FREE!**`)
            .setColor(0x000000)
            .setImage('https://cdn.discordapp.com/attachments/1180230815997767681/1318584563764822056/Untitled_1.png');

        // Create the action row with buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setEmoji('😴')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://top.gg/bot/1202232935311495209")
                    .setLabel("top.gg"),
                new ButtonBuilder()
                    .setEmoji('😴')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://github.com/ToddyTheNoobDud/Thorium-Music")
                    .setLabel("Github"),
                new ButtonBuilder()
                    .setEmoji('😴')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://discord.rovelstars.com/bots/1202232935311495209")
                    .setLabel("RovelStars"),
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};