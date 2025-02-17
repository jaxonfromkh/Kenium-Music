const URL_PATTERN = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be|open\.spotify\.com|soundcloud\.com)\/.+$/i;

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
    const replyError = (msg) => interaction.reply({ content: msg, flags: 64 });
    
    try {
      const file = interaction.options.getAttachment("file");
      if (!file) {
        return replyError("Please provide a file");
      }

      const response = await fetch(file.url);
      if (!response.ok) {
        return replyError("Failed to fetch file");
      }

      const text = await response.text();
      const urls = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => URL_PATTERN.test(line));

      if (urls.length < 2) {
        return replyError("No valid URLs found in the file. Please ensure there are at least 2 URLs.");
      }

      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return replyError("You need to be in a voice channel to import a queue.");
      }

      const player = client.aqua.createConnection({
        guildId: interaction.guildId,
        voiceChannel: voiceChannel.id,
        textChannel: interaction.channel.id,
        deaf: true,
      });

      const trackPromises = urls.map((url) =>
        client.aqua
          .resolve({ query: url, requester: interaction.member })
          .then((result) => result.tracks[0] || null)
          .catch((error) => {
            console.error(`Failed to resolve track: ${url}`, error);
            return null;
          })
      );
      const tracks = (await Promise.all(trackPromises)).filter(Boolean);

      if (tracks.length === 0) {
        return replyError("No valid tracks found after resolving URLs.");
      }

      player.queue.push(...tracks);
      if (!player.playing && !player.paused) {
        player.play();
      }
      await interaction.reply({ content: `Successfully imported ${tracks.length} song${tracks.length > 1 ? "s" : ""}.`, flags: 64 });
    } catch (error) {
      console.error("Failed to import queue:", error);
      await replyError("Failed to import queue. Please try again later.");
    }
  },
};
