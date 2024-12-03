import { ChannelType } from "discord.js";

export const Command = {
    name: "skip",
    description: "Skip the current playing song",
    options: [],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;

        const player = client.aqua.players.get(interaction.guildId)


        if (!player) {

            return interaction.reply({ content: "Nothing is playing", ephemeral: true })

        }

        if (player.queue.size == 0) return interaction.reply({ content: "No song to skip", ephemeral: true })

        const { guild, channel } = interaction;

        const lol = guild.channels.cache
            .filter((chnl) => chnl.type == ChannelType.GuildVoice)
            .find((channel) => channel.members.has(client.user.id));
        if (lol && vc.id !== lol.id)
            return interaction.reply({
                content: `im already on <#${lol.id}>`,
                ephemeral: true,
            });

        player.stop()

        return interaction.reply(`Skipped the current track`)

    },
}