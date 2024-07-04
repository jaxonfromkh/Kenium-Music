import { SearchResultType } from "@distube/youtube";
import { ChannelType } from "discord.js";

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
      await interaction.deferReply({ ephemeral: true });
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
          await client.distube.play(vc, interaction.options.getString("query"), {
            member: interaction.member,
            textChannel: interaction.channel,
          });
          break;

        case "soundcloud":
        const results = client.SoundCloudPlugin.search(interaction.options.getString("query"), "track", 1)
       
        results.then((results) => {
          client.distube.play(vc, results[0].url, {
            member: interaction.member,
            textChannel: interaction.channel,
          });
        });
        break;
            case "file":
          await interaction.editReply({
            content: '🎵 | Loading...'
          })
          const attachment = interaction.options.getAttachment("query");

          if (!attachment) {
            return interaction.editReply({
              content: "No attachment found",
              ephemeral: true,
            });
          }

          await client.distube.play(vc, attachment.url, {
            member: interaction.member,
            textChannel: interaction.channel,
          }).catch(() => interaction.editReply("Error playing file || URL is not supported"));
          break;

      }

    } catch (error) {
      console.log(error);
    }
  },
};
