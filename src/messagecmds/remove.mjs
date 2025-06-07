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
        },
    ],
    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player || !message.member?.voice?.channel) return;
        if (message.guild.members.me.voice.channelId !== message.member.voice.channelId) return;
        
        const queueLength = player.queue.length;
    
        if (queueLength === 0) {
            return message.reply("Queue is empty.");
        }
        
        const trackNumber = Number(message.content.split(" ")[1]) || 0;
        
        if (isNaN(trackNumber) || trackNumber < 1 || trackNumber > queueLength) {
            return message.reply(`Invalid track number. Please choose a number between 1 and ${queueLength}.`);
        }
    
        const trackIndex = trackNumber - 1;
        const removedTrack = player.queue[trackIndex];
        
        if (!removedTrack) {
            return message.reply("Could not find the specified track.");
        }
        
        player.queue.splice(trackIndex, 1);
        
        const embed = new EmbedBuilder()
            .setColor(0)
            .setDescription(`Removed: [${removedTrack.info.title}](${removedTrack.info.uri})`);
        
        return message.reply({ embeds: [embed] });
    },
};
