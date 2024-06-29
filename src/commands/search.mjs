// NOTE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!11
// THE FOLLOWING CODE IS IN THE EARLY STAGE OF DEVELOPMENT
// PLEASE DO NOT EXPECT TO WORK PERFECTLY
// mushroom0162 was here xd, took 2 hours to make this
// ======================================================

import {  ActionRowBuilder, StringSelectMenuBuilder, ComponentType} from "discord.js";
import { SearchResultType } from "@distube/youtube";
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
    const vc = interaction.member?.voice?.channel;
    if (!vc) return;

    try {
      const results = await client.youtubeStuff.search(query, {
        type: SearchResultType.VIDEO,
        limit: 3,
        safeSearch: false,
      });
      const options = results.map((result) => {
        return {
          label: result.name,
          value: result.url ,
        }});
      
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
          .setCustomId("search")
          .setPlaceholder("Select a song")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options)
        )
        const response = await interaction.reply({
          content: "Select a song",
          components: [row],
        })

        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 30_000,
        })

        collector.on("collect", async (i) => {
         if (i.user.id === interaction.user.id) {
            await i.deferUpdate();
            await client.distube.play(vc, i.values[0], {
              member: interaction.member,
              textChannel: interaction.channel,
            });
          } else {
            await i.reply({
              content: 'these are not for u',
              ephemeral: true
            })
          }
        });

        collector.on('end', async collected => {
          await interaction.editReply({
            components: [],
            content: 'Timed Out'
          })
        })
    } catch (error) {
      console.log(error);
    }
  },
};
