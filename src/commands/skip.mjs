import { ChannelType } from "discord.js";

export const Command = {
    name: "skip",
    description: "Skip the current playing song",
    options: [],

    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;

        const player = client.aqua.players.get(interaction.guildId)


        if (!player || player.queue.size == 0) {
            return interaction.reply({ content: player ? "No song to skip" : "Nothing is playing", ephemeral: true });
        }

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        player.stop()

        return interaction.reply(`Skipped the current track`)

    },
}
