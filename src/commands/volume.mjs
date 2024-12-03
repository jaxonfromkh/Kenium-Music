import { ChannelType, EmbedBuilder } from "discord.js";

export const Command = {
    name: "volume",
    description: "Want some volume bro?",
    options: [
        {
          name: "volume",
          description: "Enter the volume amount to set",
          type: 4,
          required: true,
        },
      ],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
        const player = client.aqua.players.get(interaction.guildId)
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
          let volume = interaction.options.getInteger("volume");
          if (isNaN(volume) || volume < 0 || volume > 150) {
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor("Red")
                  .setDescription(`Use an number between \`0 - 150\`.`),
              ],
            });
          }
          player.setVolume(volume);

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x000000)
                .setDescription(
                  `Volume is now set to **${player.volume}%**`
                ),
            ],
          });
        }
        }
        