export const Command = {
  name: "import",
  description: "Import a queue from a file (txt, pdf)",
  options: [
    {
      name: "file",
      description: "The file to import",
      type: 11,
      required: true,
      filter: (attachment) =>
        ["text/plain", "application/pdf", "application/x-pdf"].includes(attachment.contentType),
    },
  ],
  run: async (client, interaction) => {
    const replyError = async (msg) => {
      await interaction.reply({ content: msg, ephemeral: true });
    };

    try {
      const file = interaction.options.getAttachment("file");
      if (!file) {
        return await replyError("Please provide a file");
      }

      // Fetch the file content
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error("Failed to fetch file");
      }
      const text = await response.text();

      // Extract valid YouTube URLs
      const queue = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(line));

      if (queue.length < 2) {
        return await replyError("No valid URLs found in the file. Please ensure there are at least 2 URLs.");
      }

      const vc = interaction.member.voice.channel;
      if (!vc) {
        return await replyError("You need to be in a voice channel to import a queue.");
      }

      // Create or get the player connection
      const player = client.aqua.createConnection({
        guildId: interaction.guildId,
        voiceChannel: vc.id,
        textChannel: interaction.channel.id,
        deaf: true,
      });

      // Resolve tracks from the queue
      const trackPromises = queue.map(async (url) => {
        try {
          const searchResult = await client.aqua.resolve({ query: url, requester: interaction.member });
          return searchResult.tracks[0] || null; // Return the first track or null
        } catch (error) {
          console.error(`Failed to resolve track: ${url}`, error);
          return null; 
        }
      });

      const tracks = await Promise.all(trackPromises);
      const validTracks = tracks.filter(Boolean);

      // Add valid tracks to the player queue
      validTracks.forEach(track => player.queue.add(track));
      
      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }

      await interaction.reply({
        content: `Successfully imported ${validTracks.length} songs.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Failed to import queue:", error);
      await replyError("Failed to import queue. Please try again later.");
    }
  },
};
