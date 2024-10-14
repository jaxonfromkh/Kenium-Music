export const Command = {
  name: "pause",
  description: "Pause the current playing song",
  options: [],

  run: async (client, interaction) => {
      const player = client.riffy.players.get(interaction.guild.id);
      if (!player) {
          return interaction.reply({ content: "Nothing is playing", ephemeral: true });
      }
      if (player.paused) {
          return interaction.reply({ content: "The player is already paused", ephemeral: true });
      }
      player.pause(true);

      return interaction.reply(`Paused the current track`);
      }
}