import { Command, Declare, type CommandContext, Embed, Middlewares, createAttachmentOption, Options } from 'seyfert'
import { CooldownType, Cooldown } from '@slipher/cooldown';

@Cooldown({
    type: CooldownType.User,
    interval: 1000 * 60,
    uses: {
        default: 2
    },
})

@Declare({
    name: 'import',
    description: 'Import a queue from a file (txt, pdf)',
})
@Options({
    file: createAttachmentOption({
        description: 'The file to import',
        required: true,
    }),
})
@Middlewares(["checkVoice", "cooldown", "checkPlayer"])

export default class importcmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;
            const { file } = ctx.options as { file: any };

            const response = await fetch(file.url);
            const fileContent = await response.text();

            if (!fileContent.trim()) {
                await ctx.editOrReply({
                    embeds: [new Embed().setDescription('❌ The file is empty').setColor(0xff0000)]
                });
                return;
            }
            const player = client.aqua.players.get(ctx.guildId!);

            const numberRegex = /^\d+\.\s*/;
            const urlRegex = /^https?:\/\/|youtube\.com|youtu\.be|spotify\.com|soundcloud\.com/i;
            const pipeRegex = /\s*\|\s*/;
            
            const tracks = fileContent
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => {
                    const parts = line.split(pipeRegex);
                    if (parts.length === 1) {
                        return { url: line, title: '' };
                    }
                    
                    const [first, second] = parts;
                    
                    if (urlRegex.test(first)) {
                        return { url: first, title: second || '' };
                    }
                    
                    return { 
                        url: second || '', 
                        title: first.replace(numberRegex, '') 
                    };
                })
                .filter(track => track.url && urlRegex.test(track.url));

            if (tracks.length === 0) {
                await ctx.editOrReply({
                    embeds: [new Embed().setDescription('❌ No valid tracks found in the file').setColor(0xff0000)]
                });
                return;
            }

            const embed = new Embed()
                .setDescription(`🎵 Importing ${tracks.length} tracks...`)
                .setColor(0x00ff00);

            await ctx.editOrReply({ embeds: [embed], flags: 64 });

            const batchSize = Math.min(10, Math.max(3, Math.floor(tracks.length / 20)));
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < tracks.length; i += batchSize) {
                const batch = tracks.slice(i, i + batchSize);
                
                const results = await Promise.allSettled(
                    batch.map(async track => {
                        const result = await client.aqua.resolve({
                            query: track.url,
                            requester: ctx.interaction.user
                        });
                        
                        if (result?.tracks?.[0]) {
                            await player.queue.add(result.tracks[0]);
                            return true;
                        }
                        return false;
                    })
                );

                results.forEach(result => {
                    if (result.status === 'fulfilled' && result.value) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                });

                if (i + batchSize < tracks.length) {
                    const delay = Math.max(50, 200 - (successCount / (successCount + failCount)) * 150);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            if (!player.playing && !player.paused && player.queue.length > 0) {
                await player.play();
            }

            const resultEmbed = new Embed()
                .setTitle('📥 Import Complete')
                .setDescription(
                    `✅ Successfully imported: **${successCount}** tracks\n` +
                    (failCount > 0 ? `❌ Failed to import: **${failCount}** tracks\n` : '') +
                    `🎵 Total queue size: **${player.queue.length}** tracks`
                )
                .setColor(0)
                .setTimestamp();

            await ctx.editOrReply({ embeds: [resultEmbed], flags: 64 });
        } catch (error) {
            if (error.code === 10065) return;
        }
    }
}   