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
    async autocomplete(client, message) {
        
        const player = client.aqua.players.get(message.guildId);
        if (!player?.queue?.length) {
            return message.respond([]);
        }
        
        const focusedValue = message.options.getFocused().toString().toLowerCase();
        
        const choices = player.queue
            .slice(0, 25)
            .map((track, index) => {
                const name = formatTrackName(`${index + 1}: ${track.info.title}`);
                return { name, value: index + 1 };
            })
            .filter(choice => !focusedValue || choice.name.toLowerCase().includes(focusedValue));

        const validChoices = choices.filter(choice => choice.name.length >= 1 && choice.name.length <= 100);

        return message.respond(validChoices.slice(0, 25));
    },
    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player || !message.member?.voice?.channel) return;
        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;
        
        const queueLength = player.queue.length;
    
        if (queueLength === 0) {
            return message.reply("📭 Queue is empty.");
        }
        
        const trackNumber = message.options.getInteger("track_number");
        
        if (trackNumber < 1 || trackNumber > queueLength) {
            return message.reply(`❌ Invalid track number. Please choose a number between 1 and ${queueLength}.`);
        }
    
        const trackIndex = trackNumber - 1;
        const removedTrack = player.queue[trackIndex];
        
        if (!removedTrack) {
            return message.reply("❌ Could not find the specified track.");
        }
        
        player.queue.splice(trackIndex, 1);
        
        const embed = new EmbedBuilder()
            .setColor(0)
            .setDescription(`🗑️ **Removed:** [${removedTrack.info.title}](${removedTrack.info.uri})`);
        
        return message.reply({ embeds: [embed] });
    },
};