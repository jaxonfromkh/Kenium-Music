// NOTE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!11
// THE FOLLOWING CODE IS IN THE EARLY STAGE OF DEVELOPMENT
// PLEASE DO NOT EXPECT TO WORK PERFECTLY
// mushroom0162 was here xd, took 2 hours to make this
// ======================================================

import {  ActionRowBuilder, StringSelectMenuBuilder} from "discord.js";
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
        const followUp = await interaction.reply({
          content: "Choose songs to play",
          components: [row]
        })
        const response = await followUp.awaitMessageComponent({
          time: 30000
        })
        const value = response.values[0]
        await client.distube.play(vc, value, {
          member: interaction.member,
          textChannel: interaction.channel,
        })
    } catch (error) {
      console.log(error);
    }
  },
};
