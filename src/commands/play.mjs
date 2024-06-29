import { EmbedBuilder, ChannelType } from "discord.js";

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

    try {
      if (!vc)
        return interaction.reply({
          content: "Please join a vc first",
          ephemeral: true,
        });

      if (!song)
        return interaction.reply({
          content: "Please provide a song",
          ephemeral: true,
        });
      const { guild, channel } = interaction;
      const lol = guild.channels.cache
        .filter((chnl) => chnl.type == ChannelType.GuildVoice)
        .find((channel) => channel.members.has(client.user.id));
      if (lol && vc.id !== lol.id)
        return interaction.reply({
          content: `im already on <#${lol.id}>`,
          ephemeral: true,
        });

      await client.distube.voices.create(vc);

      await client.distube.play(vc, song, {
        member: interaction.member,
        textChannel: interaction.channel,
      });
    } catch (error) {
      console.error(error);
      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("Something went wrong...")
        .setTimestamp()
        .setFooter({ text: "made by mushroom0162, Sorry for the error :(" });
      return interaction.reply({
        embeds: [embed.setDescription(`* ❌ Error: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
