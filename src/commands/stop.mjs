import { ChannelType } from "discord.js";

export const Command = {
    name: "stop",
    description: "stop the music",
    options: [],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
  
        const { guild, channel } = interaction;
  
        const lol = guild.channels.cache
          .filter((chnl) => chnl.type == ChannelType.GuildVoice)
          .find((channel) => channel.members.has(client.user.id));
        if (lol && vc.id !== lol.id)
          return interaction.reply({
            content: `im already on <#${lol.id}>`,
            ephemeral: true,
          });

        const player = client.riffy.players.get(interaction.guildId);
        if (!player) return;
        player.destroy();
        await interaction.reply({
          content: "Stopped the music",
          ephemeral: true,
        })
    }
}
