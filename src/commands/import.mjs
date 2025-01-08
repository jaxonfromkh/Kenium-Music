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
      await interaction.reply({ content: msg, flags: 64 });
    };

    const errorMessages = [];

    try {
      const file = interaction.options.getAttachment("file");
      if (!file) {
        errorMessages.push("Please provide a file");
        return await replyError(errorMessages.join('\n'));
      }

      const response = await fetch(file.url);
      if (!response.ok) {
        errorMessages.push("Failed to fetch file");
        return await replyError(errorMessages.join('\n'));
      }

      const text = await response.text();
      const queue = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be|open\.spotify\.com|soundcloud\.com)\/.+$/.test(line));

      if (queue.length < 2) {
        errorMessages.push("No valid URLs found in the file. Please ensure there are at least 2 URLs.");
        return await replyError(errorMessages.join('\n'));
      }

      const vc = interaction.member.voice.channel;
      if (!vc) {
        errorMessages.push("You need to be in a voice channel to import a queue.");
        return await replyError(errorMessages.join('\n'));
      }

      const player = client.aqua.createConnection({
        guildId: interaction.guildId,
        voiceChannel: vc.id,
        textChannel: interaction.channel.id,
        deaf: true,
      });

      const trackPromises = queue.map(async (url) => {
        try {
          const searchResult = await client.aqua.resolve({ query: url, requester: interaction.member });
          return searchResult.tracks[0] || null;
        } catch (error) {
          console.error(`Failed to resolve track: ${url}`, error);
          return null;
        }
      });

      const tracks = await Promise.all(trackPromises);
      const validTracks = tracks.filter(Boolean);

      if (validTracks.length > 0) {
        player.queue.push(...validTracks);
        if (!player.playing && !player.paused) {
          player.play();
        }
        await interaction.reply({
          content: `Successfully imported ${validTracks.length} songs.`,
          flags: 64,
        });
      } else {
        errorMessages.push("No valid tracks found after resolving URLs.");
        await replyError(errorMessages.join('\n'));
      }
    } catch (error) {
      console.error("Failed to import queue:", error);
      await replyError("Failed to import queue. Please try again later.");
    }
  },
};