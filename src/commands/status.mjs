import { EmbedBuilder } from "discord.js"; 
import os from 'node:os'; 

export const Command = { 
    name: 'status', 
    description: 'Bot and Lavalink status', 
    run: async (client, interaction) => { 
        const msToTime = (duration) => { 
            const days = Math.floor(duration / (1000 * 60 * 60 * 24)); 
            const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)); 
            const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60)); 
            const seconds = Math.floor((duration % (1000 * 60)) / 1000); 
            return `${days}d ${hours}h ${minutes}m ${seconds}s`; 
        }; 

        const nodes = Array.from(client.aqua.nodeMap.values()); 
        const connected = nodes.some(node => node.connected); 
        const botUptime = msToTime(process.uptime() * 1000); 
        const totalMemoryMB = (os.totalmem() / 1024 / 1024).toFixed(2); 
        const usedMemoryMB = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2); 
        const freeMemoryMB = (os.freemem() / 1024 / 1024).toFixed(2); 
        const cpuStats = os.cpus(); 
        const cpuCores = cpuStats.length; 
        const cpuModel = cpuStats[0].model; 
        const cpuSpeedGHz = (cpuStats[0].speed / 1000).toFixed(2); 
        const cpuLoad = os.loadavg()[1].toFixed(2); 
        const discordPing = client.ws.ping; 

        const embed = new EmbedBuilder() 
            .setColor(0x000000) 
            .setTitle('Lavalink Status') 
            .setDescription(`\`Lavalink ${connected ? 'Connected' : 'Disconnected'}\``) 
            .setTimestamp(); 

        const nodeFields = nodes.map(({ stats, aqua }) => { 
            const { memory, cpu, players, playingPlayers, uptime } = stats; 
            const memoryAllocatedMB = (memory.allocated / 1024 / 1024).toFixed(2); 
            const memoryUsedMB = (memory.used / 1024 / 1024).toFixed(2); 
            const memoryFreeMB = (memory.free / 1024 / 1024).toFixed(2); 
            const memoryReservedMB = (memory.reservable / 1024 / 1024).toFixed(2); 
            const uptimeFormatted = msToTime(uptime); 
            const freePercentage = ((memory.free / memory.allocated) * 100).toFixed(2); 
            const usedPercentage = ((memory.used / memory.allocated) * 100).toFixed(2); 
            const { cores: cpuCoresNode, systemLoad: cpuSystemLoad, lavalinkLoad, lavalinkLoadPercentage } = cpu; 
            const cpuLavalinkLoadPercentage = (lavalinkLoadPercentage * 100).toFixed(2); 

            return ` 
\`\`\`ini
[Powered by: mushroom0162] 
============================ 
[Players]: ${players} 
[Active Players]: ${playingPlayers} 
[Lavalink Uptime]: ${uptimeFormatted} 
[Ping (Discord)]: ${discordPing} ms 
[Ping (Bot)]: ${Date.now() - interaction.createdTimestamp} ms 
[Aqualink Version]: ${aqua.version} 
[Memory]: 
    Allocated: ${memoryAllocatedMB} MB 
    Used: ${memoryUsedMB} MB 
    Free: ${memoryFreeMB} MB 
    Reserved: ${memoryReservedMB} MB 
    Free Percentage: ${freePercentage}% 
    Used Percentage: ${usedPercentage}% 
[CPU]: 
    Cores: ${cpuCoresNode} 
    System Load: ${cpuSystemLoad}% 
    Lavalink Load: ${lavalinkLoad.toFixed(2)}% 
    Lavalink Load Percentage: ${cpuLavalinkLoadPercentage}% 
============================ 
[BOT SECTION]: 
[Bot Uptime]: ${botUptime} 
[Bot Memory]: 
    Allocated: ${totalMemoryMB} MB 
    Used: ${usedMemoryMB} MB 
    Free: ${freeMemoryMB} MB 
[CPU]: 
    Cores: ${cpuCores} 
    CPU Load: ${cpuLoad}% 
    Model: ${cpuModel} 
    Speed: ${cpuSpeedGHz} GHz 
\`\`\` 
            `; 
        }).join('\n'); 

        embed.addFields({ 
            name: 'Nodes', 
            value: nodeFields, 
            inline: true 
        }); 

        await interaction.reply({ embeds: [embed] }); 
    } 
};
