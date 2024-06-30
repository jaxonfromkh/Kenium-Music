import { ChannelType } from "discord.js";

export const Command = {
  name: "resume",
  description: "Resume the music!",
  run: async (client, interaction) => {
    const vc = interaction.member?.voice?.channel;
    if (!vc) return;
    const song = client.distube.getQueue(vc);

    if (!song) return;
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
      await client.distube.resume(vc);
      await interaction.reply({ content: "▶ Resumed", ephemeral: true });
    } catch (error) {
      console.log(error);
      await interaction.reply({
        content:
          "Something went wrong, ur probaly not in a vc or no song is playing",
        ephemeral: true,
      });
    }
  },
};
