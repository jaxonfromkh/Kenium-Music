import { ChannelType } from "discord.js";

export const Command = {
  name: "stop",
  description: "stop the music",
  options: [],

  run: async (client, interaction) => {
    const player = client.aqua.players.get(interaction.guildId)
    if (!player || !interaction.member.voice.channel || interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
    player.stop()
    await interaction.reply({
      content: "Stopped the music",
      ephemeral: true,
    })
  }
}
