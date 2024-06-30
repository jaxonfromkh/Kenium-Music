import { ChannelType } from "discord.js";

export const Command = {
  name: "skip",
  description: "Skip the current song",
  run: async (client, interaction) => {
    const vc = interaction.member?.voice?.channel;
    if (!vc) return;
    const { guild, channel } = interaction;
    const song = client.distube.getQueue(vc);

    if (!song) return;
    if(song.songs.length === 1) return interaction.reply({ content: "there is nothing to skip", ephemeral: true });

    const lol = guild.channels.cache
      .filter((chnl) => chnl.type == ChannelType.GuildVoice)
      .find((channel) => channel.members.has(client.user.id));
    if (lol && vc.id !== lol.id)
      return interaction.reply({
        content: `im already on <#${lol.id}>`,
        ephemeral: true,
      });

    try {
      await client.distube.skip(vc);
      await interaction.reply({ content: "Skipped", ephemeral: true });
    } catch (error) {
      console.log(error);
    }
  },
};
