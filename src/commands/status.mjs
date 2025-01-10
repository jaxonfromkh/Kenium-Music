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
        
        const nodes = [...client.aqua.nodeMap.values()]; 
        const connected = nodes.some(node => node.connected); 
        const botUptime = msToTime(process.uptime() * 1000); 
        const totalMemoryMB = (os.totalmem() / 1024 / 1024).toFixed(2); 
        const usedMemoryMB = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2); 
        const freeMemoryMB = (os.freemem() / 1024 / 1024).toFixed(2); 
        const cpuStats = os.cpus(); 
        const cpuCores = cpuStats.length; 
        const { model: cpuModel, speed: cpuSpeed } = cpuStats[0]; 
        const cpuSpeedGHz = (cpuSpeed / 1000).toFixed(2); 
        const cpuLoad = os.loadavg()[1].toFixed(2); 
        const discordPing = client.ws.ping; 
        const replyTime = Date.now() - interaction.createdTimestamp;


        const embed = new EmbedBuilder() 
            .setColor(0x000000) 
            .setTitle('Lavalink Status') 
            .setDescription(`\`Lavalink ${connected ? 'Connected' : 'Disconnected'}\``) 
            .setTimestamp(); 

        const formatMemory = (memory) => ({
            allocatedMB: (memory.allocated / 1024 / 1024).toFixed(2),
            usedMB: (memory.used / 1024 / 1024).toFixed(2),
            freeMB: (memory.free / 1024 / 1024).toFixed(2),
            reservedMB: (memory.reservable / 1024 / 1024).toFixed(2),
            freePercentage: ((memory.free / memory.allocated) * 100).toFixed(2),
            usedPercentage: ((memory.used / memory.allocated) * 100).toFixed(2),
        }); 

        const nodeFields = nodes.map(({ stats, aqua }) => { 
            const { memory, cpu, players, playingPlayers, uptime } = stats; 
            const { allocatedMB, usedMB, freeMB, reservedMB, freePercentage, usedPercentage } = formatMemory(memory); 
            const uptimeFormatted = msToTime(uptime); 
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
[Ping (Bot)]: ${replyTime} ms 
[Aqualink Version]: ${aqua.version} 
[Memory]: 
    Allocated: ${allocatedMB} MB 
    Used: ${usedMB} MB 
    Free: ${freeMB} MB 
    Reserved: ${reservedMB} MB 
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
