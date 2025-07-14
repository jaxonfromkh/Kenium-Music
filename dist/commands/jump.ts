import { createIntegerOption, Command, Declare, type CommandContext, Middlewares, createStringOption, Options } from 'seyfert'

@Middlewares(['checkPlayer', 'checkVoice'])
@Options({
    name: createStringOption({
        description: 'The song to jump to',
        required: false,
        autocomplete: async (interaction: any) => {
            try {
                const player = interaction.client.aqua.players.get(interaction.guildId!);
                if (!player?.queue?.length) return [];
                
                const focused = interaction.getInput()?.toLowerCase() || "";
                const results = [];
                
                for (let i = 0; i < player.queue.length && results.length < 25; i++) {
                    const title = player.queue[i].info.title;
                    if (!focused || title.toLowerCase().includes(focused)) {
                        results.push({ 
                            name: title.length > 100 ? title.slice(0, 97) + "..." : title, 
                            value: title 
                        });
                    }
                }
                
                return interaction.respond(results);
            } catch (error) {
                console.error('Name autocomplete error:', error);
                return [];
            }
        }
    }),
    position: createIntegerOption({
        description: 'The song number to jump to',
        required: false,
        autocomplete: async (interaction: any) => {
            try {
                const player = interaction.client.aqua.players.get(interaction.guildId!);
                if (!player?.queue?.length) return [];
                
                const focused = interaction.getInput()?.toLowerCase() || "";
                const results = [];
                
                for (let i = 0; i < player.queue.length && results.length < 25; i++) {
                    const title = player.queue[i].info.title;
                    const displayTitle = title.length > 94 ? title.slice(0, 91) + "..." : title;
                    const name = `${i + 1}. ${displayTitle}`;
                    
                    if (!focused || name.toLowerCase().includes(focused)) {
                        results.push({ name, value: i + 1 });
                    }
                }
                
                return interaction.respond(results);
            } catch (error) {
                console.error('Position autocomplete error:', error);
                return [];
            }
        }
    })
})
@Declare({
    name: 'jump',
    description: 'Jump to a specific position or song in the queue',
}) 
export default class JumpCommand extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const player = ctx.client.aqua.players.get(ctx.guildId!);
            if (!player?.queue?.length) {
                await ctx.editOrReply({ content: 'No songs in queue', flags: 64 });
                return;
            }

            const { position, name } = ctx.options as { position?: number; name?: string };

            if (position !== undefined) {
                if (position < 1 || position > player.queue.length) {
                    await ctx.editOrReply({ 
                        content: `Position must be between 1 and ${player.queue.length}`, 
                        flags: 64 
                    });
                    return;
                }
                
                if (position === 1) {
                    await ctx.editOrReply({ content: 'Already at position 1', flags: 64 });
                    return;
                }
                
                player.queue.splice(0, position - 1);
                player.stop();
                await ctx.editOrReply({ content: `Jumped to song ${position}`, flags: 64 });
                return;
            }

            if (name) {
                const songIndex = player.queue.findIndex(song => song.info.title === name);

                if (songIndex === -1) {
                    await ctx.editOrReply({ content: `Couldn't find "${name}" in the queue`, flags: 64 });
                    return;
                }

                if (songIndex === 0) {
                    await ctx.editOrReply({ content: `"${name}" is already playing`, flags: 64 });
                    return;
                }

                player.queue.splice(0, songIndex);
                player.stop();
                await ctx.editOrReply({ content: `Jumped to song "${name}"`, flags: 64 });
                return;
            }

            await ctx.editOrReply({ 
                content: 'Please specify either a position number or song name', 
                flags: 64 
            });

        } catch (error: any) {
            if (error?.code === 10065) return;
            
            console.error('Jump command error:', error);
            await ctx.editOrReply({ 
                content: 'An error occurred while jumping to the song', 
                flags: 64 
            }).catch(() => {});
        }
    }
}