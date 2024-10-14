import { ChannelType } from "discord.js";
export const Command = {
  name: "play",
  description: "Play some song!",
  options: [
        {
          name: 'query',
          description: 'The song you want to search for',
          type: 3,
          required: true,
        },
  ],

  run: async (client, interaction) => {
    try {

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

      if(vc.full) return interaction.reply({ content: "I can't join this vc because it's full", ephemeral: true });


          const query = interaction.options.getString('query');

          const player = client.riffy.createConnection({
              guildId: interaction.guild.id,
              voiceChannel: interaction.member.voice.channel.id,
              textChannel: interaction.channel.id,
              deaf: true,
          })
  
          const resolve = await client.riffy.resolve({ query: query, requester: interaction.member });
          const { loadType, tracks, playlistInfo } = resolve;
  
          if (loadType === 'playlist') {
              for (const track of resolve.tracks) {
                  track.info.requester = interaction.member;
                  player.queue.add(track);
              }
  
              await interaction.reply(`Added ${tracks.length} songs from ${playlistInfo.name} playlist.`);
  
              if (!player.playing && !player.paused) return player.play();
  
          } else if (loadType === 'search' || loadType === 'track') {
              const track = tracks.shift();
              track.info.requester = interaction.member;
  
              player.queue.add(track);
  
              await interaction.reply(`Added **${track.info.title}** to the queue.`);
              if (!player.playing && !player.paused) return player.play();
        }
      
    } catch (error) {
      console.log(error);
    }
  },
};