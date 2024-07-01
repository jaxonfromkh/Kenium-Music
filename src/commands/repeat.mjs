import { RepeatMode } from "distube";
import { ChannelType } from "discord.js";
export const Command = {
  name: "repeat",
  description: "Repeat the current song/queue",
  options: [
    {
      name: "mode",
      description: "The mode you want to set",
      type: 3,
      required: true,
      choices: [
        {
          name: "queue",
          value: "queue",
        },
        {
          name: "song",
          value: "song",
        },
        {
          name: "off",
          value: "off",
        },
      ],
    },
  ],
  run: async (client, interaction) => {
    try {
      await interaction.deferReply({ ephemeral: true });
      const mode = interaction.options.getString("mode");
      const vc = interaction.member?.voice?.channel;
      const { guild, channel } = interaction;

      const lol = guild.channels.cache
        .filter((chnl) => chnl.type == ChannelType.GuildVoice)
        .find((channel) => channel.members.has(client.user.id));
      if (lol && vc.id !== lol.id)
        return interaction.editReply({
          content: `im already on <#${lol.id}>`,
          ephemeral: true,
        });

      if (!vc) return;
      const queue = await client.distube.getQueue(vc);
      if (!queue) return;

      switch (mode) {
        case "queue":
          queue.setRepeatMode(RepeatMode.QUEUE);
          break;
        case "song":
          queue.setRepeatMode(RepeatMode.SONG);
          break;
        case "off":
          queue.setRepeatMode(RepeatMode.DISABLED);
          break;
      }
      await interaction.editReply({
        content: `Set repeat mode to \`${mode}\``,
        ephemeral: true,
      });
    } catch (error) {
      console.log(error);
    }
  },
};
