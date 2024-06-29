import { ChannelType } from "discord.js";

export const Command = {
  name: "leave",
  description: "Leave the voice channel!",
  run: async (client, interaction) => {
    const vc = interaction.member?.voice?.channel;
    if (!vc) return;
    const { guild, channel } = interaction;

    const lol = guild.channels.cache
      .filter((chnl) => chnl.type == ChannelType.GuildVoice)
      .find((channel) => channel.members.has(client.user.id));
    if (lol && vc.id !== lol.id)
      return interaction.reply({
        content: `im already on <#${lol.id}>`,
        ephemeral: true,
      });

    try {
      await client.distube.voices.leave(vc);
      await interaction.reply({
        content: "Left the voice channel",
        ephemeral: true,
      });
    } catch (error) {
      console.log(error);
      await interaction.reply({
        content: "Something went wrong",
        ephemeral: true,
      });
    }
  },
};
