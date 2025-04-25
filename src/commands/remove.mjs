import { EmbedBuilder } from "discord.js";
function formatTrackName(name) {
    return name.length <= 100 ? name : `${name.substring(0, 97)}...`;
}
export const Command = {
    name: "remove",
    description: "Remove a track from the queue",
    options: [
        {
            name: "track_number",
            description: "The number of the track to remove",
            type: 4,
            required: true,
            autocomplete: true,
        },
    ],
    async autocomplete(client, interaction) {
        
        const player = client.aqua.players.get(interaction.guildId);
        if (!player?.queue?.length) {
            return interaction.respond([]);
        }
        
        const focusedValue = interaction.options.getFocused().toString().toLowerCase();
        
        const choices = player.queue
            .slice(0, 25)
            .map((track, index) => {
                const name = formatTrackName(`${index + 1}: ${track.info.title}`);
                return { name, value: index + 1 };
            })
            .filter(choice => !focusedValue || choice.name.toLowerCase().includes(focusedValue));

        const validChoices = choices.filter(choice => choice.name.length >= 1 && choice.name.length <= 100);

        return interaction.respond(validChoices.slice(0, 25));
    },
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || !interaction.member?.voice?.channel) return;
        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
        
        const queueLength = player.queue.length;
    
        if (queueLength === 0) {
            return interaction.reply("📭 Queue is empty.");
        }
        
        const trackNumber = interaction.options.getInteger("track_number");
        
        if (trackNumber < 1 || trackNumber > queueLength) {
            return interaction.reply(`❌ Invalid track number. Please choose a number between 1 and ${queueLength}.`);
        }
    
        const trackIndex = trackNumber - 1;
        const removedTrack = player.queue[trackIndex];
        
        if (!removedTrack) {
            return interaction.reply("❌ Could not find the specified track.");
        }
        
        player.queue.splice(trackIndex, 1);
        
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Track Removed')
            .setDescription(`Removed [${removedTrack.info.title}](${removedTrack.info.uri}) from the queue.`)
            .setColor(15548997)
            .setTimestamp();
        
        return interaction.reply({ embeds: [embed] });
    },
};