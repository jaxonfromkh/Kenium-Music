import { ChannelType } from "discord.js";

export const Command = {
    name: "loop",
    description: "Want some loop bro?",
    options: [
        {
          name: "mode",
          description: "Choose to loop the current song or the queue.",
          type: 3,
          required: true,
          choices: [
            { name: "song", value: "song" },
            { name: "queue", value: "queue" },
            { name: "off", value: "off" }
          ],
        },
      ],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
        const player = client.manager.players.get(interaction.guildId)
        if (!player) {
            return interaction.reply({ content: "Nothing is playing", ephemeral: true });
        }
        const { guild, channel } = interaction;
  
        const lol = guild.channels.cache
          .filter((chnl) => chnl.type == ChannelType.GuildVoice)
          .find((channel) => channel.members.has(client.user.id));
        if (lol && vc.id !== lol.id)
          return interaction.reply({
            content: `im already on <#${lol.id}>`,
            ephemeral: true,
          });
          
          const mode = interaction.options.getString("mode");

          switch (mode) {
            case "song": {
              player.trackRepeat = !player.trackRepeat;
              const status = player.trackRepeat ? "enabled" : "disabled";
              return interaction.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x000000)
                    .setDescription(`Current song loop has been ${status}.`)
                ],
              });
            }
            case "queue": {
              player.queueRepeat = !player.queueRepeat;
              const status = player.queueRepeat ? "enabled" : "disabled";
              return interaction.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x000000)
                    .setDescription(`Queue loop has been ${status}.`)
                ],
              });
            }
            case "off": {
              player.trackRepeat = false;
              player.queueRepeat = false;
              return interaction.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x000000)
                    .setDescription(`Looping has been disabled.`)
                ],
              });
            }
        }
        }
}