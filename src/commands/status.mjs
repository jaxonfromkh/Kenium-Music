import { EmbedBuilder } from "discord.js"; 
import os from 'node:os'; 

export const Command = { 
    name: 'status', 
    description: 'View system metrics', 
    run: async (client, interaction) => { 
        const formatUptime = (ms) => { 
            const days = Math.floor(ms / (1000 * 60 * 60 * 24)); 
            const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)); 
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60)); 
            const seconds = Math.floor((ms % (1000 * 60)) / 1000); 
            return [ 
                days && `${days}d`, 
                hours && `${hours}h`, 
                minutes && `${minutes}m`, 
                seconds && `${seconds}s` 
            ].filter(Boolean).join(' '); 
        }; 

        const nodes = [...client.aqua.nodeMap.values()]; 
        const totalMemory = os.totalmem() / 1073741824; 
        const usedMemory = process.memoryUsage().heapTotal / 1073741824; 
        const freeMemory = os.freemem() / 1073741824; 

        const memory = { 
            total: totalMemory.toFixed(2), 
            used: usedMemory.toFixed(2), 
            free: freeMemory.toFixed(2) 
        }; 

        const cpuCores = os.cpus(); 
        const cpu = { 
            cores: cpuCores.length, 
            model: cpuCores[0]?.model.replace(/\(R\)|®|\(TM\)|™/g, '').trim().split('@')[0].trim() || 'Unknown', 
            load: os.loadavg()[1].toFixed(1) 
        }; 

        const embed = new EmbedBuilder() 
            .setColor(0x2B2D31) 
            .setTitle('🚀 Kenium 2.8.0 - An Open Source Bot') 
            .setDescription([ 
                `### 🔌 Status: ${nodes.some(node => node.connected) ? '🟢 Online' : '🔴 Offline'}`, 
                '```', 
                `⚡ CPU    : ${cpu.model} (${cpu.cores} cores @ ${cpu.load}% load)`, 
                `💾 Memory : ${memory.used}GB / ${memory.total}GB`, 
                `🕒 Uptime : ${formatUptime(process.uptime() * 1000)}`, 
                `📡 Ping   : ${client.ws.ping}ms WS | ${Date.now() - interaction.createdTimestamp}ms Bot`, 
                '```', 
            ].join('\n')) 
            .addFields({ 
                name: '\u200b', 
                value: nodes.map(({ stats, aqua }) => { 
                    const { memory, cpu, players, playingPlayers, uptime } = stats; 
                    return [ 
                        '```', 
                        `🎮 Players : ${players} (${playingPlayers} active)`, 
                        `💾 Memory  : ${(memory.used / 1073741824).toFixed(2)}GB / ${(memory.allocated / 1073741824).toFixed(2)}GB`, 
                        `⚡ CPU     : ${(cpu.lavalinkLoadPercentage ? (cpu.lavalinkLoadPercentage * 100).toFixed(1) : 'N/A')}% | ⏰ Uptime: ${formatUptime(uptime)}`, 
                        `🌊 Aqualink: ${aqua.version}`,
                        '```' 
                    ].join('\n'); 
                }).join('\n') 
            }) 
            .setFooter({ 
                text: '🔄 by mushroom0162', 
                iconURL: 'https://cdn.discordapp.com/attachments/1296093808236302380/1335389585395683419/a62c2f3218798e7eca7a35d0ce0a50d1_1.png' 
            }) 
            .setTimestamp(); 

        await interaction.reply({ embeds: [embed] }); 
    } 
};
