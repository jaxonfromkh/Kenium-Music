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
      const vc = interaction.member.voice.channel;
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

      if (vc.full) return interaction.reply({ content: "I can't join this vc because it's full", ephemeral: true });


      const query = interaction.options.getString('query');

      const player = client.aqua.createConnection({
        guildId: interaction.guildId,
        voiceChannel: vc.id,
        textChannel: interaction.channel.id,
        deaf: true,
      });

      const result = await client.aqua.resolve({ query, requester: interaction.member });
      const embed = new EmbedBuilder().setColor(0x000000)
      const track = result.tracks.shift();
      
      switch (result.loadType) {
        case "track":
          player.queue.add(track);
          embed.setDescription(
            `Added [${track.info.title}](${track.info.uri}) to the queue.`
          );
          await interaction.reply({ embeds: [embed], ephemeral: true });

          if (!player.playing && !player.paused && player.queue.size > 0) return player.play();

        case "playlist":
          for (const track of result.tracks) {
            track.info.requester = interaction.member;
            player.queue.add(track);
          }

          const playlistInfo = result.data;
          embed.setDescription(
            `Added [${playlistInfo.name}](${query}) playlist to the queue.`
          );
          await interaction.reply({ embeds: [embed], ephemeral: true });
          if (!player.playing && !player.paused && player.queue.size > 0) return player.play();
          break;

        case "search":
          player.queue.add(track);
          embed.setDescription(
            `Added [${track.info.title}](${track.info.uri}) to the queue.`
          );

          await interaction.reply({ embeds: [embed], ephemeral: true });
          if (!player.playing && !player.paused && player.queue.size > 0) return player.play();
      }
    } catch (error) {
      console.log(error);
    }
  },
};