export const Command = {
    name: "skip",
    description: "Skip the current playing song",
    options: [],

    run: async (client, interaction) => {

         const player = client.kazagumo.getPlayer(interaction.guildId)


        if (!player) {

            return interaction.reply({ content: "Nothing is playing", ephemeral: true })

        }




        if(player.queue.totalSize == 1) return interaction.reply({ content: "No song to skip", ephemeral: true })

        player.skip()

        return interaction.reply(`Skipped the current track`)

    },
}