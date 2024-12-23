import { ChannelType, EmbedBuilder } from "discord.js";

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
      const { guild, member } = interaction;
      const vc = member.voice.channel;
      if (!vc) return;

      const lol = guild.channels.cache.find(
        (chnl) => chnl.type === ChannelType.GuildVoice && chnl.members.has(client.user.id)
      );
      if (lol && vc.id !== lol.id) {
        return interaction.reply({
          content: `im already on <#${lol.id}>`,
          ephemeral: true,
        });
      }
      const query = interaction.options.getString('query');

      const player = client.aqua.createConnection({
        guildId: interaction.guildId,
        voiceChannel: vc.id,
        textChannel: interaction.channel.id,
        deaf: true,
      });

      const result = await client.aqua.resolve({ query, requester: interaction.member });
      const embed = new EmbedBuilder().setColor(0x000000)
      const tracks = result.tracks;
      
           switch (result.loadType) {
        case "track":
          player.queue.add(tracks[0]);
          embed.setDescription(
            `Added [${tracks[0].info.title}](${tracks[0].info.uri}) to the queue.`
          );
          break;
        case "search":
          player.queue.add(tracks.shift());
          embed.setDescription(
            `Added [${tracks[0].info.title}](${tracks[0].info.uri}) to the queue.`
          );
          break;
        case "playlist":
          for (const track of tracks) {
            player.queue.add(track);
          }

          embed.setDescription(
            `Added [${result.playlistInfo.name}](${query}) playlist to the queue.`
          );
          break;
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });

      if (!player.playing && !player.paused && player.queue.size > 0) player.play();
    } catch (error) {
      console.log(error);
    }
  },
};
