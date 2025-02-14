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
        const cpuModel = cpuStats[0]?.model || 'Unknown'; 
        const cpuSpeed = (cpuStats[0]?.speed / 1000).toFixed(2) || '0.00'; 
        const discordPing = client.ws.ping; 
        const replyTime = Date.now() - interaction.createdTimestamp; 
        
        const embed = new EmbedBuilder() 
            .setColor(0x000000)
            .setTitle('⚙️ System Status') 
            .setDescription(`**Lavalink:** \`${connected ? 'Connected ✅' : 'Disconnected ❌'}\``) 
            .addFields( 
                { name: '📊 Bot Stats', value: `**Uptime:** \`${botUptime}\`\n**Memory:** \`Total: ${totalMemoryMB} MB\` | \`Used: ${usedMemoryMB} MB\` | \`Free: ${freeMemoryMB} MB\`\n**CPU:** \`Cores: ${cpuCores}\` | \`Speed: ${cpuSpeed} GHz\` | \`Load: ${os.loadavg()[1].toFixed(2)}%\`\n**Ping:** \`Discord: ${discordPing}ms\` | \`Bot: ${replyTime}ms\``, inline: false }, 
                { name: '🌐 Node Stats', value: nodes.map(({ stats }) => { 
                    const { memory, cpu, players, playingPlayers, uptime } = stats; 
                    const uptimeFormatted = msToTime(uptime); 
                    const cpuLavalinkLoadPercentage = (cpu.lavalinkLoadPercentage * 100).toFixed(2); 
                    return `**Players:** \`${players}\` | **Active:** \`${playingPlayers}\`\n**Uptime:** \`${uptimeFormatted}\`\n**Memory:** \`Allocated: ${(memory.allocated / 1024 / 1024).toFixed(2)} MB\` | \`Used: ${(memory.used / 1024 / 1024).toFixed(2)} MB\` | \`Free: ${(memory.free / 1024 / 1024).toFixed(2)} MB\`\n**CPU:** \`Cores: ${cpu.cores}\` | \`Load: ${cpuLavalinkLoadPercentage}%\``; 
                }).join('\n\n'), inline: false } 
            ) 
            .setFooter({ text: 'Powered by mushroom0162', iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png' }) 
            .setTimestamp(); 

        await interaction.reply({ embeds: [embed] }); 
    } 
};
