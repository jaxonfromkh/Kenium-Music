export const Command = {
    name: "jump",
    description: "Jump to a specific position in the queue",
    options: [
        {
            name: "position",
            description: "The position in the queue to jump to",
            type: 4,
            required: true,
            autocomplete: true
        },
    ],
    async autocomplete(client, interaction) {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !player.queue.length) {
            return interaction.respond([]);
        }

        const focusedValue = interaction.options.getFocused().toLowerCase();
        const results = [];

        for (let i = 0; i < player.queue.length && results.length < 25; i++) {
            const title = player.queue[i].info.title;
            const name = `Song ${i + 1} - ${title}`;
            if (name.toLowerCase().includes(focusedValue)) {
                results.push({ name, value: i + 1 });
            }
        }

        return interaction.respond(results);
    },
    run: async (client, interaction) => {
        const position = interaction.options.getInteger("position");
        const player = client.aqua.players.get(interaction.guildId);

        if (!player || interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        const queueLength = player.queue.length;
        if (position < 1 || position > queueLength) {
            return interaction.reply({ content: `Position must be between 1 and ${queueLength}`, flags: 64 });
        }

        player.queue.splice(0, position - 1);
        player.stop();
        return interaction.reply({ content: `Jumped to song ${position}`, flags: 64 });
    },
};
