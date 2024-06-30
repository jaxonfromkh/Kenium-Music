import { ChannelType } from "discord.js";

export const Command = {
    name: 'volume',
    description: 'Set the volume',
    options: [
        {
            name: 'volume',
            description: 'The volume you want to set',
            type: 4,
            required: true,
            min_value: 1,
            max_value: 200
        }
    ],
    run: async (client, interaction) => {
        const volume = interaction.options.getInteger('volume');
        
        const vc = interaction.member?.voice?.channel;

        const song = client.distube.getQueue(vc);
        if(!vc) return;
        if (!song) return;
        const { guild, channel } = interaction;

        const lol = guild.channels.cache
          .filter((chnl) => chnl.type == ChannelType.GuildVoice)
          .find((channel) => channel.members.has(client.user.id));
        if (lol && vc.id !== lol.id)
          return interaction.reply({
            content: `im already on <#${lol.id}>`,
            ephemeral: true,
          });
  
        try {
        client.distube.setVolume(vc, volume);
        await interaction.reply({ content: `Volume set to ${volume}`, ephemeral: true });
        } catch(error) {
            console.log(error);
        }
       
    }
}