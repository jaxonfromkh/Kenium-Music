import {  EmbedBuilder } from "discord.js";

export const Command = {
  name: "volume",
  description: "Want some volume bro?",
  options: [
    {
      name: "volume",
      description: "Enter the volume amount to set",
      type: 4,
      required: true,
    },
  ],
  run: async (client, interaction) => {
    const player = client.aqua.players.get(interaction.guildId);
    if (!player || !interaction.member.voice.channel || interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
    const volume = interaction.options.getInteger("volume", true);
    if (volume < 0 || volume > 200) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`Use an number between \`0 - 200\`.`),
        ],
      });
    }
    player.setVolume(volume);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x000000)
          .setDescription(
            `Volume is now set to **${player.volume}%**`
          ),
      ],
    });
  }
}
