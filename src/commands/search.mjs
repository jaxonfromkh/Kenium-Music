import { ActionRowBuilder, ComponentType, StringSelectMenuBuilder, ChannelType, StringSelectMenuOptionBuilder, EmbedBuilder } from "discord.js";
import { SearchResultType } from "@distube/youtube";
import { isURL } from "distube";

export const Command = {
  name: "search",
  description: "Search for a song",
  options: [
    {
      name: "query",
      description: "The song you want to search for",
      type: 3,
      required: true,
    },
  ],
  run: async (client, interaction) => {
       const query = interaction.options.getString("query");
    const voiceChannel = interaction.member?.voice?.channel;
    await interaction.deferReply()

    if (!voiceChannel) {
      return await interaction.editReply({
        content: "Please join a voice channel first",
        ephemeral: true,
      });
    }
    const { guild, channel } = interaction;

    const lol = guild.channels.cache
      .filter((chnl) => chnl.type == ChannelType.GuildVoice)
      .find((channel) => channel.members.has(client.user.id));
    if (lol && voiceChannel.id !== lol.id)
      return interaction.editReply({
        content: `im already on <#${lol.id}>`,
        ephemeral: true,
      });

    try {
      if (isURL(query)) {
        return await interaction.editReply({
          content: "URL is not supported",
          ephemeral: true,
        });
      }

      const searchResults = await client.youtubeStuff.search(query, {
        type: SearchResultType.VIDEO,
        limit: 4,
        safeSearch: false,
      });

      const selectMenuOptions = searchResults.map((result) => ({
        label: result.name,
        description: `Uploader: ${result.uploader.name}, Duration: ${result.formattedDuration}`,
        value: result.url,
      }));

      const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("search")
          .setPlaceholder("Select a song")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(selectMenuOptions)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Cancel")
              .setValue("cancel")
              .setDescription("Cancels the search")
          )
      );
      const embed = new EmbedBuilder()
      .setColor('White')
      .setAuthor({ name: 'Search Results', iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp()
      .setFooter({ text: 'Toddys Music Bot •  Requested by ' + interaction.user.username.toString() })
      .setDescription("Select a song to play below xd")
      const response = await interaction.editReply({
        components: [selectMenuRow],
        embeds: [embed]
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });

      collector.on("collect", async (interaction, i) => {


        if (interaction.values[0] === "cancel") {
          await interaction.deferUpdate();
          await interaction.editReply({
            components: [],
            content: "Cancelled search",
            embeds: [],
          });
          return;
        }

        if (interaction.user === interaction.user) {
            await interaction.deferUpdate();
          await interaction.followUp({
            content: "🎵  |  Added to queue",
            ephemeral: true,
          })
          await client.distube.play(voiceChannel, interaction.values[0], {
            member: interaction.member,
            textChannel: interaction.channel,
          });
        }
       });

      collector.on("end", async () => {
        await interaction.editReply({
          components: [],
          content: "Timed Out",
          embeds: [],
        });
      });
    } catch (error) {
      console.log(error);
    }
  },
};


// Note: Unstable code yet
