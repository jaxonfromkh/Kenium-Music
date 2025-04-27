export const Command = {
    name: "jump",
    description: "Jump to a specific position or song in the queue",
    options: [
        {
            name: "position",
            description: "The position in the queue to jump to",
            type: 4,
            required: false,
            autocomplete: true
        },
        {
            name: "name",
            description: "The name of the song to jump to",
            type: 3,
            required: false,
            autocomplete: true
        },
    ],
    async autocomplete(client, interaction) {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !player.queue.length) {
            return interaction.respond([]);
        }

        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.toLowerCase();
        const results = [];

        if (focusedOption.name === "position") {
            for (let i = 0; i < player.queue.length && results.length < 25; i++) {
                const title = player.queue[i].info.title;
                const name = `Song ${i + 1} - ${title.slice(0, 97)}`;
                if (name.toLowerCase().includes(focusedValue)) {
                    results.push({ name, value: i + 1 });
                }
            }
        }

        else if (focusedOption.name === "name") {
            for (let i = 0; i < player.queue.length && results.length < 25; i++) {
                const title = player.queue[i].info.title;
                if (title.toLowerCase().includes(focusedValue)) {
                    results.push({ name: title.slice(0, 100), value: title });
                }
            }
        }

        return interaction.respond(results);
    },
    run: async (client, interaction) => {
        const position = interaction.options.getInteger("position");
        const name = interaction.options.getString("name");
        const player = client.aqua.players.get(interaction.guildId);

        if (!player || interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
        
        if (!position && !name) {
            return interaction.reply({ content: "Please provide either a position or a song name", flags: 64 });
        }

        const queueLength = player.queue.length;
        
        if (position) {
            if (position < 1 || position > queueLength) {
                return interaction.reply({ content: `Position must be between 1 and ${queueLength}`, flags: 64 });
            }
            player.queue.splice(0, position - 1);
            player.stop();
            return interaction.reply({ content: `Jumped to song ${position}`, flags: 64 });
        }
        
        if (name) {
            const songIndex = player.queue.findIndex(song => song.info.title === name);
            
            if (songIndex === -1) {
                return interaction.reply({ content: `Couldn't find "${name}" in the queue`, flags: 64 });
            }
            
            player.queue.splice(0, songIndex);
            player.stop();
            return interaction.reply({ content: `Jumped to "${name}"`, flags: 64 });
        }
    },
};
