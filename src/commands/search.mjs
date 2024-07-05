import {
  ActionRowBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  ChannelType,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
} from "discord.js";
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
    try {
      const query = interaction.options.getString("query");
      const voiceChannel = interaction.member?.voice?.channel;

      if (!voiceChannel) {
        return await interaction.reply({
          content: "Please join a voice channel first",
          ephemeral: true,
        });
      }
      const { guild, channel } = interaction;
      const lol = guild.channels.cache
        .filter((chnl) => chnl.type == ChannelType.GuildVoice)
        .find((channel) => channel.members.has(client.user.id));
      if (lol && voiceChannel.id !== lol.id)
        return await interaction.reply({
          content: `im already on <#${lol.id}>`,
          ephemeral: true,
        });

      if (isURL(query)) {
        await interaction.reply({
          content: "URL is not supported",
          ephemeral: true,
        });
        return;
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
        .setColor("White")
        .setAuthor({
          name: "Search Results",
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp()
        .setFooter({
          text:
            "Toddys Music Bot •  Requested by " +
            interaction.user.username.toString(),
        })
        .setDescription("Select a song to play below xd");

      const response = await interaction.reply({
        components: [selectMenuRow],
        embeds: [embed],
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });

      collector.on("collect", async (interaction) => {
        await interaction.deferUpdate();

        if (interaction.values[0] === "cancel") {
          collector.stop();
          return;
        }

        if (interaction.user === interaction.user) {
          await interaction.followUp({
            content: "🎵  |  Added to queue",
            ephemeral: true,
          });
          await client.distube.play(voiceChannel, interaction.values[0], {
            member: interaction.member,
            textChannel: interaction.channel,
          });
        }
      });

      collector.on("end", async () => {
        await interaction.editReply({
          components: [],
          content: "Search timed out || Cancelled search",
          embeds: [],
        });
      });
    } catch (error) {
      console.log(error);
    }
  },
};

// Note: Unstable code yet

