import { ChannelType } from "discord.js";

export const Command = {
    name: "stop",
    description: "Stop the music!",
    run: async (client, interaction) => {
        try {
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

      await client.distube.stop(vc);
      await client.distube.voices.leave(vc)
      await interaction.reply({
        content: "⏹ Stopped",
        ephemeral: true,
      });
    } catch (error) {
      console.log(error);
    }
  },
};
