import fetch from "node-fetch";

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

    let player;
    let queue;

    try {
      const file = interaction.options.getAttachment("file");
      if (!file) {
        await replyError("Please provide a file");
        return;
      }

      // Fetch the file content
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error("Failed to fetch file");
      }

      const text = await response.text();
      const lines = text.split("\n");

      queue = lines
        .filter((line) => line.startsWith("https://"))
        .map((line) => ({ url: line.trim() }));

      if (queue.length < 2) {
        return await replyError("No valid URLs found in the file. Please ensure there are at least 2 URLs.");
      }

      const vc = interaction.member.voice.channel;
      if (!vc) {
        return await replyError("You need to be in a voice channel to import a queue.");
      }

      player = client.manager.create({
        guild: interaction.guildId,
        voiceChannel: vc.id,
        textChannel: interaction.channel.id,
        volume: 100,
        selfDeafen: true,
      });

      if (player.state !== "CONNECTED") {
        player.connect();
      }

      const tracks = await Promise.all(
        queue.map(async (track) => {
          try {
            const searchResult = await client.manager.search(track.url, interaction.user);
            return searchResult.tracks.length > 0 ? searchResult.tracks[0] : null;
          } catch (error) {
            console.error(`Error searching track: ${track.url}`, error);
            return null; 
          }
        })
      );

      const validTracks = tracks.filter(Boolean);
      for (const track of validTracks) {
        player.queue.add(track);
      }

      if (!player.playing && !player.paused && player.queue.size > 0) {
        player.play();
      }

      return await interaction.reply({
        content: `Successfully imported ${validTracks.length} songs.`,
        ephemeral: true,
      });

    } catch (error) {
      console.error("Failed to import queue:", error);
      await replyError("Failed to import queue. Please try again later.");
    } finally {
      player = null;
      queue = null;
    }
  },
};