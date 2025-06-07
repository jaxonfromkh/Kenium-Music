import { AttachmentBuilder } from "discord.js";

export const Command = {
  name: "export",
  description: "Export the queue",
  options: [],
  run: async (client, interaction) => {
    const player = client.aqua.players.get(interaction.guildId);
    if (!player || player.queue.length === 0) {
      return interaction.reply({ 
        content: !player ? "Nothing is playing" : "Queue is empty", 
        flags: 64 
      });
    }

    const botVcId = interaction.guild.members.me.voice.channelId;
    const userVcId = interaction.member.voice.channelId;
    if (botVcId !== userVcId) {
      return interaction.reply({ 
        content: "You must be in the same voice channel to use this command.", 
        flags: 64 
      });
    }

    let containsPlatforms = { youtube: false, soundcloud: false, spotify: false };
    const trackURIs = [];
    
    for (const track of player.queue) {
      const uri = track.info.uri;
      trackURIs.push(uri);
      
      if (!containsPlatforms.youtube && uri.includes("youtube")) containsPlatforms.youtube = true;
      if (!containsPlatforms.soundcloud && uri.includes("soundcloud")) containsPlatforms.soundcloud = true;
      if (!containsPlatforms.spotify && uri.includes("spotify")) containsPlatforms.spotify = true;
    }

    const fileNameParts = ["Kenium_3.5.0"];
    if (containsPlatforms.youtube) fileNameParts.push("youtube");
    if (containsPlatforms.soundcloud) fileNameParts.push("soundcloud");
    if (containsPlatforms.spotify) fileNameParts.push("spotify");
    const fileName = fileNameParts.join("_") + ".txt";

    const buffer = Buffer.from(trackURIs.join("\n"));
    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    
    try {
      const replyMessage = await interaction.reply({
        files: [attachment],
        content: "This will be deleted after 1 minute!\nPro tip: Use </import:1305541038496153660> to import the queue",
      });

      const timer = setTimeout(() => {
        replyMessage.delete().catch(err => console.error("Failed to delete interaction reply:", err));
      }, 60000);

      const cleanupListener = () => clearTimeout(timer);
      interaction.client.once("interactionDelete", cleanupListener);
      
      setTimeout(() => {
        interaction.client.removeListener("interactionDelete", cleanupListener);
      }, 60000);
      
    } catch (err) {
      console.error("Failed to send export reply:", err);
    }
  },
};