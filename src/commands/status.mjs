import { EmbedBuilder } from "discord.js";
import os from 'node:os';

export const Command = {
    name: 'status',
    description: 'Bot and Lavalink status',
    run: async (client, interaction) => {
        function msToTime(duration) {
            const days = Math.floor(duration / (1000 * 60 * 60 * 24));
            const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((duration % (1000 * 60)) / 1000);
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }

        const nodes = Array.from(client.aqua.nodeMap.values());
        const connected = nodes.some((node) => node.connected);
        const botUptime = msToTime(process.uptime() * 1000);
        const botMemoryAllocated = (os.totalmem() / 1024 / 1024).toFixed(2);
        const botMemoryUsed = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2);
        const botMemoryFree = (os.freemem() / 1024 / 1024).toFixed(2);
        const botMemoryReserved = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const cpuCores = os.cpus().length;
        const cpuModel = os.cpus()[0].model;
        const cpuSpeed = (os.cpus()[0].speed / 1000).toFixed(2);
        const systemLoad = os.loadavg()[0].toFixed(2);
        const cpuLoad = os.loadavg()[1].toFixed(2);
        const discordPing = client.ws.ping;

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('Lavalink Status')
            .setDescription(`\`Lavalink ${connected ? 'Connected' : 'Disconnected'}\``)
            .addFields([
                {
                    name: 'Nodes',
                    value: nodes.map((node) => {
                        const memoryAllocated = (node.stats.memory.allocated / 1024 / 1024).toFixed(2);
                        const memoryUsed = (node.stats.memory.used / 1024 / 1024).toFixed(2);
                        const memoryFree = (node.stats.memory.free / 1024 / 1024).toFixed(2);
                        const memoryReserved = (node.stats.memory.reservable / 1024 / 1024).toFixed(2);
                        const cpuCoresNode = node.stats.cpu.cores;
                        const cpuSystemLoad = node.stats.cpu.systemLoad.toFixed(2);
                        const cpuLavalinkLoad = node.stats.cpu.lavalinkLoad.toFixed(2);
                        const uptime = msToTime(node.stats.uptime);

                        return `
\`\`\`ini
[Powered by: mushroom0162]
============================
[Players]: ${node.stats.players}
[Active Players]: ${node.stats.playingPlayers}
[Lavalink Uptime]: ${uptime}
[Ping (Discord)]: ${discordPing} ms
[Ping (Lavalink + bot)]: ${Date.now() - interaction.createdTimestamp} ms
[Memory]:
    Allocated: ${memoryAllocated} MB
    Used: ${memoryUsed} MB
    Free: ${memoryFree} MB
    Reserved: ${memoryReserved} MB
[CPU]:
    Cores: ${cpuCoresNode}
    System Load: ${cpuSystemLoad}%
    Lavalink Load: ${cpuLavalinkLoad}%
============================
[BOT SECTION]:
[Bot Uptime]: ${botUptime}
[Bot Memory]:
    Allocated: ${botMemoryAllocated} MB
    Used: ${botMemoryUsed} MB
    Free: ${botMemoryFree} MB
    Reserved: ${botMemoryReserved} MB
[CPU]:
    Cores: ${cpuCores}
    System Load: ${systemLoad}%
    CPU Load: ${cpuLoad}%
    Model: ${cpuModel}
    Speed: ${cpuSpeed} GHz
\`\`\`
                        `;
                    }).join('\n'),
                    inline: true
                }
            ])
            .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });
    }
}