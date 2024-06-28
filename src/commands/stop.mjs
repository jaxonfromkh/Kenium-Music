export const Command = {
    name: "stop",
    description: "Stop the music!",
    run: async (client, interaction) => {
        const vc = interaction.member?.voice?.channel;
        if (!vc) return;
        await client.distube.stop(vc)
    }
}