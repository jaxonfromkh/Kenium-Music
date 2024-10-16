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
      if (!interaction.replied || interaction.deferred) {
        await interaction.deferReply({
          ephemeral: true,
        });
      }
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

      const player = client.manager.create({
        guild: interaction.guildId,
        voiceChannel: vc.id,
        textChannel: interaction.channel.id,
        volume: 100,
        selfDeafen: true
      });

      if (player.state !== "CONNECTED") player.connect();

      const result = await player.search(query, interaction.user);
      const embed = new EmbedBuilder().setColor(0x000000)

      switch (result.loadType) {
        case "empty":
          if (!player.queue.current) player.destroy();

          embed.setDescription(`Load failed when searching for \`${query}\``);

          return await interaction.editReply({ embeds: [embed] });

        case "error":
          if (!player.queue.current) player.destroy();

          embed.setDescription(`No matches when searching for \`${query}\``);

          return await interaction.editReply({ embeds: [embed] });

        case "track":
          player.queue.add(result.tracks[0]);

          if (!player.playing && !player.paused && !player.queue.length) {
            await player.play();
          }

          embed.setDescription(
            `Added [${result.tracks[0].title}](${result.tracks[0].uri}) to the queue.`
          );

          return await interaction.editReply({ embeds: [embed] });

        case "playlist":
          if (!result.playlist?.tracks) return;

          player.queue.add(result.playlist.tracks);

          if (
            !player.playing &&
            !player.paused &&
            player.queue.size === result.playlist.tracks.length
          ) {
            await player.play();
          }

          embed.setDescription(
            `Added [${result.playlist.name}](${query}) playlist to the queue.`
          );

          return await interaction.editReply({ embeds: [embed] });

        case "search":
          player.queue.add(result.tracks[0]);
          if (!player.playing && !player.paused && !player.queue.length) {
            await player.play();
          }

          embed.setDescription(
            `Added [${result.tracks[0].title}](${result.tracks[0].uri}) to the queue.`
          );

          return await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.log(error);
    }
  },
};