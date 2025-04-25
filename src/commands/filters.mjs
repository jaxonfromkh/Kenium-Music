export const Command = {
  name: "filters",
  description: "use filters on the music",
  options: [
    {
      name: "filter",
      type: 3, 
      description: "Choose a filter to apply",
      required: true,
      choices: [
        { name: "8D", value: "8d" },
        { name: "Equalizer", value: "equalizer" },
        { name: "Karaoke", value: "karaoke" },
        { name: "Timescale", value: "timescale" },
        { name: "Tremolo", value: "tremolo" },
        { name: "Vibrato", value: "vibrato" },
        { name: "Rotation", value: "rotation" },
        { name: "Distortion", value: "distortion" },
        { name: "Channel Mix", value: "channelMix" },
        { name: "Low Pass", value: "lowPass" },
        { name: "Bassboost", value: "bassboost" },
        { name: "Slowmode", value: "slowmode" },
        { name: "Nightcore", value: "nightcore" },
        { name: "Vaporwave", value: "vaporwave" },
        { name: "Clear", value: "clear" },
      ],
    },
  ],
  run: async (client, interaction) => {
    try {
      const player = client.aqua.players.get(interaction.guildId);
      if (!player || !interaction.member.voice.channel || interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
        return interaction.reply({
          content: "You must be in the same voice channel as the bot to use this command.",
          flags: 64,
        });
      }

      const filter = interaction.options.getString("filter");

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
        case "channelMix":
          player.filters.setChannelMix({ leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 });
          break;
        case "lowPass":
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
        default:
          return interaction.reply({
            content: "Invalid filter selected.",
            flags: 64,
          });
      }

      await interaction.reply({
        content: `Applied ${filter} filter.`,
        flags: 64,
      });
    } catch (error) {
      console.log(error);
      interaction.reply({
        content: "An error occurred while applying the filter.",
        flags: 64,
      });
    }
  },
};
