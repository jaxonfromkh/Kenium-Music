import { ChannelType } from "discord.js";

export const Command = {
  name: "play",
  description: "Play some song!",
  options: [
    {
      name: "song",
      description:
        "the song you want to play / or a link / or a direct discord link",
      type: 3,
      required: true,
    },
  ],
  run: async (client, interaction) => {
    const vc = interaction.member?.voice?.channel;

    const song = interaction.options.getString("song");
    await interaction.deferReply({ ephemeral: true });
    try {
      if (!vc)
        return interaction.editReply({
          content: "Please join a vc first",
          ephemeral: true,
        });

      if (!song)
        return interaction.editReply({
          content: "Please provide a song",
          ephemeral: true,
        });
      const { guild, channel } = interaction;

      const lol = guild.channels.cache
        .filter((chnl) => chnl.type == ChannelType.GuildVoice)
        .find((channel) => channel.members.has(client.user.id));
      if (lol && vc.id !== lol.id)
        return interaction.editReply({
          content: `im already on <#${lol.id}>`,
          ephemeral: true,
        });

      await interaction.editReply({ content: "- 🎵 Loading...", ephemeral: true });
      await client.distube.voices.create(vc);

      await client.distube.play(vc, song, {
        member: interaction.member,
        textChannel: interaction.channel,
      });
    } catch (error) {
      console.error(error);
    }
  },
};
