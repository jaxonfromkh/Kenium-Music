import { AttachmentBuilder } from "discord.js";

const PLATFORMS = {
  YOUTUBE: "youtube",
  SOUNDCLOUD: "soundcloud",
  SPOTIFY: "spotify",
};

export const Command = {
  name: "export",
  description: "Export the queue",
  options: [],
  run: async (client, interaction) => {
    const player = client.aqua.players.get(interaction.guildId);
    if (!player) {
      return interaction.reply({ content: "Nothing is playing", flags: 64 });
    }
    if (player.queue.length === 0) {
      return interaction.reply({ content: "Queue is empty", flags: 64 });
    }

    const botVcId = interaction.guild.members.me.voice.channelId;
    const userVcId = interaction.member.voice.channelId;
    if (botVcId !== userVcId) {
      return interaction.reply({ content: "You must be in the same voice channel to use this command.", flags: 64 });
    }

    const trackURIs = player.queue.map((track) => track.info.uri);
    let fileName = "Kenium_2.8.0";

    if (trackURIs.some((uri) => uri.includes(PLATFORMS.YOUTUBE))) {
      fileName += "_youtube";
    }
    if (trackURIs.some((uri) => uri.includes(PLATFORMS.SOUNDCLOUD))) {
      fileName += "_soundcloud";
    }
    if (trackURIs.some((uri) => uri.includes(PLATFORMS.SPOTIFY))) {
      fileName += "_spotify";
    }
    fileName += ".txt";

    const attachment = new AttachmentBuilder(Buffer.from(trackURIs.join("\n")), { name: fileName });
    const replyMessage = await interaction.reply({
      files: [attachment],
      content: "This will be deleted after 1 minute!\nPro tip: Use </import:1305541038496153660> to import the queue",
    });

    const deleteTimeout = setTimeout(async () => {
      try {
        await replyMessage.delete();
      } catch (err) {
        console.error("Failed to delete interaction reply:", err);
      }
    }, 60000);

    interaction.client.once("interactionDelete", () => clearTimeout(deleteTimeout));
  },
};
