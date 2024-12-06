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
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !interaction.member?.voice?.channel) return interaction.reply({ content: "Nothing is playing", ephemeral: true });
        const { guild } = interaction;
        const vc = guild.channels.cache.get(player.voiceChannel);
        if (vc?.id !== interaction.member.voice.channelId)
          return interaction.reply({ content: `im already on <#${vc.id}>`, ephemeral: true });
        const volume = interaction.options.getInteger("volume", true);
        if (volume < 0 || volume > 150) {
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
        
