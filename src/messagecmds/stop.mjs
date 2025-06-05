export const Command = {
  name: "stop",
  description: "stop the music",
  options: [],

  run: async (client, message) => { 
    const player = client.aqua.players.get(message.guildId)
    if (!player || !message.member.voice.channel || message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;
    player.stop()
    await message.reply({
      content: "Stopped the music",
      flags: 64,
    })
  }
}
