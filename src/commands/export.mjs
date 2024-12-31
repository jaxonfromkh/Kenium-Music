import { AttachmentBuilder } from "discord.js";

const PLATFORMS = {
    YOUTUBE: 'youtube',
    SOUNDCLOUD: 'soundcloud',
    SPOTIFY: 'spotify',
};

export const Command = {
    name: "export",
    description: "Export the queue",
    options: [],
    run: async (client, interaction) => {
        const player = client.aqua.players.get(interaction.guildId);
        
        if (!player || player.queue.length === 0) {
            return interaction.reply({ content: player ? "Queue is empty" : "Nothing is playing", ephemeral: true });
        }

        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
            return interaction.reply({ content: "You must be in the same voice channel to use this command.", ephemeral: true });
        }

        const tracks = player.queue.map(track => track.info.uri);
        let fileName = 'Kenium_2.5.0';
        const platforms = new Set();

        for (const uri of tracks) {
            if (uri.includes(PLATFORMS.YOUTUBE)) platforms.add(PLATFORMS.YOUTUBE);
            if (uri.includes(PLATFORMS.SOUNDCLOUD)) platforms.add(PLATFORMS.SOUNDCLOUD);
            if (uri.includes(PLATFORMS.SPOTIFY)) platforms.add(PLATFORMS.SPOTIFY);
        }

        if (platforms.has(PLATFORMS.YOUTUBE)) fileName += '_youtube';
        if (platforms.has(PLATFORMS.SOUNDCLOUD)) fileName += '_soundcloud';
        if (platforms.has(PLATFORMS.SPOTIFY)) fileName += '_spotify';
        fileName += '.txt';

        const attachment = new AttachmentBuilder(Buffer.from(tracks.join('\n')), { name: fileName });
        
        const reply = await interaction.reply({
            files: [attachment],
            content: 'This will be Deleted after 1 minute!\n Pro tip: You can use </import:1305541038496153660> to import the queue'
        });

        const deleteTimeout = setTimeout(async () => {
            try {
                await reply.delete();
            } catch (err) {
                console.error("Failed to delete interaction reply:", err);
            }
        }, 60000);

        interaction.client.on('interactionDelete', () => {
            clearTimeout(deleteTimeout);
        });
    }
};
