import { isURL } from "distube";
import { ChannelType } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
export const Command = {
  name: "play",
  description: "Play some song!",
  options: [
    {
      name: 'youtube',
      description: 'Play song from youtube',
      type: 1,
      options: [
        {
          name: 'query',
          description: 'The song you want to search for',
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: 'soundcloud',
      description: 'Play song from soundcloud',
      type: 1,
      options: [
        {
          name: 'query',
          description: 'The song you want to search for',
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: 'file',
      description: 'Play song from file',
      type: 1,
      options: [
        {
          name: 'query',
          description: 'The song you want to search for',
          type: ApplicationCommandOptionType.Attachment,
          required: true,
        },
      ],
    }
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

      switch (interaction.options.getSubcommand()) {

        case "youtube":
          await interaction.reply({
            content: '🎵 | Loading...',
            ephemeral: true
          })
          await client.distube.play(vc, interaction.options.getString("query"), {
            member: interaction.member,
            textChannel: interaction.channel,
          });
          break;

        case "soundcloud":

        if(isURL(interaction.options.getString("query"))) {
          return interaction.reply({ content: "URL is not supported", ephemeral: true });
        }

        const results = client.SoundCloudPlugin.search(interaction.options.getString("query"), "track", 1)
       await interaction.reply({ content: '🎵 | Loading...', ephemeral: true });
        results.then((results) => {
          client.distube.play(vc, results[0].url, {
            member: interaction.member,
            textChannel: interaction.channel,
          });
        });
        break;

        case "file":
          await interaction.reply({
            content: '🎵 | Loading...'
          })
          const attachment = interaction.options.getAttachment("query");

          if (!attachment) {
            return interaction.reply({
              content: "No attachment found",
              ephemeral: true,
            });
          }

          await client.distube.play(vc, attachment.url, {
            member: interaction.member,
            textChannel: interaction.channel,
          }).catch(async () => await interaction.reply({
            content: "Error playing file || URL is not supported", ephemeral: true
          }));
          break;
      }

    } catch (error) {
      console.log(error);
    }
  },
};
