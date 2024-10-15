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

          let player = await client.kazagumo.createPlayer({
            guildId: interaction.guildId,
            textId: channel.id,
            voiceId: vc.id,
            volume: 100
        })
       
        let result = await  client.kazagumo.search(query, {requester: interaction.author});
        if (!result.tracks.length) return msg.reply("No results found!");

        if (result.type === "PLAYLIST") player.queue.add(result.tracks); // do this instead of using for loop if you want queueUpdate not spammy
        else player.queue.add(result.tracks[0]);

        if (!player.playing && !player.paused) player.play();
        return interaction.reply({content: result.type === "PLAYLIST" ? `Queued ${result.tracks.length} from ${result.playlistName}` : `Queued ${result.tracks[0].title}`});

    } catch (error) {
      console.log(error);
    }
  },
};