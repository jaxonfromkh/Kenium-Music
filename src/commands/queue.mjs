import { EmbedBuilder, ChannelType } from "discord.js";

export const Command = {
  name: "queue",
  description: "Show the queue!",
  run: async (client, interaction) => {
    const vc = interaction.member?.voice?.channel;
    if (!vc) return;

    const queue = await client.distube.getQueue(vc);

    if (!queue) {
      return interaction.reply({ content: "No queue", ephemeral: true });
    }

    const { guild, channel } = interaction;

    const lol = guild.channels.cache
      .filter((chnl) => chnl.type == ChannelType.GuildVoice)
      .find((channel) => channel.members.has(client.user.id));
    if (lol && vc.id !== lol.id)
      return interaction.reply({
        content: `im already on <#${lol.id}>`,
        ephemeral: true,
      });

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("Queue")
      .setTimestamp();

    await interaction.reply({
      embeds: [
        embed.setDescription(
          `${queue.songs.map(
            (song, id) =>
              `\n**${id + 1}** | ${song.name} - \`${song.formattedDuration}\``
          )}`
        ),
      ],
    });
  },
};
