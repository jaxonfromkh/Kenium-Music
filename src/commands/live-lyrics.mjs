export const Command = {
    name: "live-lyrics",
    description: "Enable or disable live lyrics for the current music session.",
    options: [
        {
            name: "state",
            description: "Choose whether to enable or disable live lyrics.",
            type: 3,
            required: true,
            choices: [
                { name: "Enable", value: "on" },
                { name: "Disable", value: "off" }
            ]
        }
    ],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: "No active player found.", flags: 64 });

        const state = interaction.options.getString("state");
        const enabled = !!player.liveLyricsEnabled;

        if (state === "on") {
            if (enabled) {
                return interaction.reply({ content: "⚠️ Live lyrics are already enabled.", flags: 64 });
            }
            player.liveLyricsEnabled = true;
            player.subscribeLiveLyrics?.();
            const msg = await interaction.reply({ content: "✅ Live lyrics enabled. Fetching lyrics...", flags: 64 });
            setTimeout(async () => {
                await msg.delete();
            }, 8000);
        }

        if (state === "off") {
            if (!enabled) {
                return interaction.reply({ content: "⚠️ Live lyrics are already disabled.", flags: 64 });
            }
            player.liveLyricsEnabled = false;
            player.unsubscribeLiveLyrics?.();
            return interaction.reply({ content: "❌ Live lyrics disabled.", flags: 64 });
        }
    }
};
