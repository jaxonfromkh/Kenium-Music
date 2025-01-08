const ownerId = "1053363102017662976";
import { EmbedBuilder } from "discord.js";
export const Command = {
  name: "serverlist",
  description: "owner only cmd, just for me check servers",
  run: async (client, interaction) => {

    const user = interaction.user;
    if (!user || !ownerId.includes(user.id)) return interaction.reply({
      content: "Only the owner of the bot can use this command",
      flags: 64,
    });

    const guilds = client.guilds.cache.sort((a, b) => b.memberCount - a.memberCount);
    const description = guilds
      .map((guild, i) => `**${i + 1}** - ${guild.name} | ${guild.memberCount} Members\n`)
      .slice(0, 10)
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0, 0, 0)
      .setDescription(`Total Servers - ${client.guilds.cache.size}\n\n${description}`);

    await interaction.reply({ embeds: [embed] });

  },
};


