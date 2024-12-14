import { AttachmentBuilder } from "discord.js";

export const Command = {
    name: "export",
    description: "Export the queue",
    options: [],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        if (!player || player.queue.length === 0) {
            return interaction.reply({ content: player ? "Queue is empty" : "Nothing is playing", ephemeral: true });
        }
        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;
        const attachment = new AttachmentBuilder(Buffer.from(player.queue.map(track => track.info.uri).join('\n')), { name: `Kenium_2.4.0.txt` });
        const reply = await interaction.reply({ files: [attachment], content: 'This will be Deleted after 1 minute!\n Pro tip: You can use </import:1305541038496153660> to import the queue' });
        
        setTimeout(async () => {
            try {
                await reply.delete();
            } catch (err) {
                console.error("Failed to delete interaction reply:", err);
            }
        }, 60000);

    }
};
