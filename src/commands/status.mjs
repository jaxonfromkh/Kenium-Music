import { EmbedBuilder } from "discord.js";
import  os  from 'node:os';
export const Command = {
    name: 'status',
    description: 'Bot and Lavalink status',
    run: async (client, interaction) => {
        function msToTime(duration) {
            const days = Math.floor(duration / (1000 * 60 * 60 * 24));
            const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((duration % (1000 * 60)) / 1000);

            return days + "d " + hours + "h " + minutes + "m " + seconds + "s";
        }        
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('Lavalink Status')
            .setDescription(`\`Lavalink ${client.manager.nodes.some((node) => node.connected) ? 'Connected' : 'Disconnected'}\``)
            .addFields([
                {
                    name: 'Nodes',
                    value: client.manager.nodes.map((node) => `
                        \`\`\`ini
    [Powered by: mushroom0162]
    ============================
[Players]: ${node.stats.players}
[Active Players]: ${node.stats.playingPlayers}
[Lavalink Uptime]: ${msToTime(node.stats.uptime)}
[Ping (Discord)] : ${client.ws.ping} ms
[Ping (Lavalink + bot)] : ${Date.now() - interaction.createdTimestamp} ms
[Memory]:
    Allocated: ${(node.stats.memory.allocated / 1024 / 1024).toFixed(2)}MB
    Used: ${(node.stats.memory.used / 1024 / 1024).toFixed(2)}MB
    Free: ${(node.stats.memory.free / 1024 / 1024).toFixed(2)}MB
    Reserved: ${(node.stats.memory.reservable / 1024 / 1024).toFixed(2)}MB
[CPU]:
    Cores: ${node.stats.cpu.cores}
    System Load: ${node.stats.cpu.systemLoad.toFixed(2)}%
    Lavalink Load: ${node.stats.cpu.lavalinkLoad.toFixed(2)}%
    ============================
        [BOT SECTION]:
[Bot Uptime]: ${msToTime(process.uptime() * 1000)}
[Bot Memory]:
    Allocated: ${(os.totalmem() / 1024 / 1024).toFixed(2)}MB
    Used: ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)}MB
    Free: ${(os.freemem() / 1024 / 1024).toFixed(2)}MB
    Reserved: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB
[CPU]:
    Cores: ${os.cpus().length}
    System Load: ${os.loadavg()[0].toFixed(2)}%
    CPU Load: ${os.loadavg()[1].toFixed(2)}%
    Model: ${os.cpus()[0].model}
    Speed: ${(os.cpus()[0].speed / 1000).toFixed(2)}GHz
                        \`\`\`
    ============================`).join('\n'),
                    inline: true
                }
            ])
            .setTimestamp();
        await interaction.reply({
            embeds: [embed]
        });
    }
}
