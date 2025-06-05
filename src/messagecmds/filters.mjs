export const Command = {
  name: "filters",
  description: "use filters on the music",
  aliases: ["filter"],
  usage: "<filter>",
  run: async (client, message, args) => {
    try {
      const player = client.aqua.players.get(message.guild.id);
      if (
        !player ||
        !message.member.voice.channel ||
        message.guild.members.me.voice.channelId !== message.member.voice.channelId
      ) {
        return message.reply({
          content: "You must be in the same voice channel as the bot to use this command.",
        });
      }

      const filter = args[0]?.toLowerCase();
      if (
        ![
          "8d", "equalizer", "karaoke", "timescale", "tremolo", "vibrato",
          "rotation", "distortion", "channelmix", "lowpass", "bassboost",
          "slowmode", "nightcore", "vaporwave", "clear"
        ].includes(filter)
      ) {
        return message.reply({
          content: "Invalid filter selected. Available: 8d, equalizer, karaoke, timescale, tremolo, vibrato, rotation, distortion, channelmix, lowpass, bassboost, slowmode, nightcore, vaporwave, clear",
        });
      }

      player.filters.clearFilters();

      switch (filter) {
        case "8d":
          player.filters.set8D(true);
          break;
        case "equalizer":
          player.filters.setEqualizer([{ band: 0, gain: 0.5 }]);
          break;
        case "karaoke":
          player.filters.setKaraoke(true);
          break;
        case "timescale":
          player.filters.setTimescale({ speed: 1.2, pitch: 1.2, rate: 1.0 });
          break;
        case "tremolo":
          player.filters.setTremolo({ depth: 0.5, frequency: 4 });
          break;
        case "vibrato":
          player.filters.setVibrato({ depth: 0.5, frequency: 4 });
          break;
        case "rotation":
          player.filters.setRotation({ rotationHz: 0.2 });
          break;
        case "distortion":
          player.filters.setDistortion({ distortion: 0.5 });
          break;
        case "channelmix":
          player.filters.setChannelMix({ leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 });
          break;
        case "lowpass":
          player.filters.setLowPass({ smoothing: 20 });
          break;
        case "bassboost":
          player.filters.setBassboost(true);
          break;
        case "slowmode":
          player.filters.setSlowmode(true);
          break;
        case "nightcore":
          player.filters.setNightcore(true);
          break;
        case "vaporwave":
          player.filters.setVaporwave(true);
          break;
        case "clear":
          player.filters.clearFilters();
          break;
      }

      await message.reply({
        content: `Applied ${filter} filter.`,
      });
    } catch (error) {
      console.log(error);
      message.reply({
        content: "An error occurred while applying the filter.",
      });
    }
  },
};
