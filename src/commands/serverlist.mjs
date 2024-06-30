const ownerId = "1053363102017662976"
import { EmbedBuilder } from "discord.js";
export const Command = {
  name: "serverlist",
  description: "owner only cmd, just for me check servers",
  run: async (client, interaction) => {

    const user = interaction.user;
    if (!user) return;

    if (user.id === ownerId || ownerId.includes(user.id)) { 
        let i0 = 0;
        let i1 = 10;
        let page = 1;
        let description =
          `Total Servers - ${client.guilds.cache.size}\n\n` +
          client.guilds.cache
            .sort((a, b) => b.memberCount - a.memberCount)
            .map((r) => r)
            .map(
              (r, i) =>
                `**${i + 1}** - ${r.name} | ${r.memberCount} Members\nID - ${r.id}`
            )
            .slice(0, 10)
            .join("\n\n");
    
        let embed = new EmbedBuilder()
    
          .setColor(0, 0, 0)
          .setDescription(description);
    
        let msg = await interaction.reply({
          embeds: [embed],
        });
    } else {
       await interaction.reply({
         content: "Only the owner of the bot can use this command",
         ephemeral: true
       })
    }
   
  },
};
