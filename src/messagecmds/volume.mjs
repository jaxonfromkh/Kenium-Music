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
  run: async (client, message) => { 
    const player = client.aqua.players.get(message.guildId);
    if (!player || !message.member.voice.channel || message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;
    const volume = Number(message.content.split(" ")[1]) || 100;
    if (volume < 0 || volume > 200) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`Use an number between \`0 - 200\`.`),
        ],
      });
    }
    player.setVolume(volume);
    return message.reply({
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
