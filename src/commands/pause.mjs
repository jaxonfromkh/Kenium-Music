import { ChannelType } from "discord.js";

export const Command = {
    name: "pause",
    description: "Pause the current playing song",

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
        const player = client.aqua.players.get(interaction.guildId)
        if (!player) {
            return interaction.reply({ content: "Nothing is playing", ephemeral: true });
        }
        if (player.paused) {
            return interaction.reply({ content: "The player is already paused", ephemeral: true });
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
          
        player.pause(true);

        return interaction.reply({
            content: 'Paused the song',
            ephemeral: true
        })
        }
}