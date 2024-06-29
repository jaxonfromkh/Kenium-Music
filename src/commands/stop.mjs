export const Command = {
    name: "stop",
    description: "Stop the music!",
    run: async (client, interaction) => {
        try {
            const vc = interaction.member?.voice?.channel;
            if (!vc) return;
            await client.distube.stop(vc)
        } catch(error) {
            console.log(error)
        }
    }
}