
const URL_PATTERN = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.?be|open\.spotify\.com|soundcloud\.com)\/.+$/i;

export const Command = {
  name: "import",
  description: "Import a queue from a file (txt, pdf)",
  options: [
    {
      name: "file",
      description: "The file to import",
      type: 11,
      required: true,
      filter: (attachment) => {
        const validTypes = new Set(["text/plain", "application/pdf", "application/x-pdf"]);
        return validTypes.has(attachment.contentType);
      },
    },
  ],
  run: async (client, interaction) => {
    const replyError = (msg) => interaction.reply({ content: msg, flags: 64 });
    
    try {
      const file = interaction.options.getAttachment("file");
      const voiceChannel = interaction.member.voice.channel;
      
      if (!file) return replyError("Please provide a file");
      if (!voiceChannel) return replyError("You need to be in a voice channel to import a queue.");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(file.url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) return replyError("Failed to fetch file");
        
        const text = await response.text();
        
        const urls = [];
        for (const line of text.split('\n')) {
          const trimmedLine = line.trim();
          if (trimmedLine && URL_PATTERN.test(trimmedLine)) {
            urls.push(trimmedLine);
          }
        }
        
        if (urls.length < 2) {
          return replyError("No valid URLs found in the file. Please ensure there are at least 2 URLs.");
        }

        const player = client.aqua.createConnection({
          guildId: interaction.guildId,
          voiceChannel: voiceChannel.id,
          textChannel: interaction.channel.id,
          deaf: true,
          shouldDeleteMessage: true
        });

        const BATCH_SIZE = 10;
        const tracks = [];
        
        for (let i = 0; i < urls.length; i += BATCH_SIZE) {
          const batch = urls.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(url => {
            return client.aqua
              .resolve({ query: url, requester: interaction.member })
              .then(result => result.tracks[0] || null)
              .catch(error => {
                console.error(`Failed to resolve track: ${url}`, error.message || 'Unknown error');
                return null;
              });
          });
          
          const batchResults = await Promise.all(batchPromises);
          tracks.push(...batchResults.filter(Boolean));
        }

        if (tracks.length === 0) {
          return replyError("No valid tracks found after resolving URLs.");
        }

        player.queue.push(...tracks);
        if (!player.playing && !player.paused) {
          player.play();
        }
        
        const plural = tracks.length === 1 ? '' : 's';
        await interaction.reply({ content: `Successfully imported ${tracks.length} song${plural}.`, flags: 64 });
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          return replyError("File download timed out. Please try again with a smaller file.");
        }
        throw fetchError;
      }
      
    } catch (error) {
      console.error("Failed to import queue:", error.message || error);
      await replyError("Failed to import queue. Please try again later.");
    }
  },
};
