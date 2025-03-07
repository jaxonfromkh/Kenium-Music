import { EmbedBuilder } from "discord.js";
import os from 'node:os';

const CPU_MODEL_REGEX = /\(R\)|®|\(TM\)|™/g;

const formatUptime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  return [
    days && `${days}d`,
    hours % 24 && `${hours % 24}h`,
    minutes % 60 && `${minutes % 60}m`,
    seconds % 60 && `${seconds % 60}s`
  ].filter(Boolean).join(' ');
};

const formatMemory = (bytes, inGB = false) => {
  return inGB 
    ? (bytes / 1073741824).toFixed(2) + 'GB'
    : (bytes / 1048576).toFixed(2) + 'MB';
};

export const Command = {
  name: 'status',
  description: 'View system metrics',
  run: async (client, interaction) => {
    await interaction.deferReply();
    
    const totalMemory = os.totalmem();
    const usedMemory = process.memoryUsage().heapTotal;
    const cpuInfo = os.cpus()[0];
    const cpuModel = cpuInfo 
      ? cpuInfo.model.replace(CPU_MODEL_REGEX, '').trim().split('@')[0].trim() 
      : 'Unknown';
    const nodes = [...client.aqua.nodeMap.values()];
    const isOnline = nodes.some(node => node.connected);
    
    const pingTime = Date.now() - interaction.createdTimestamp;
    
    const embed = new EmbedBuilder()
      .setColor(isOnline ? 0x43B581 : 0xF04747)
      .setAuthor({
        name: `System Status: ${isOnline ? 'Online' : 'Offline'}`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setDescription([
        '```ansi',
        `\u001b[1;36m ⚙️ System Information\u001b[0m`,
        `\u001b[1;33m ⚡ CPU    :\u001b[0m ${cpuModel} (${os.cpus().length} cores @ ${os.loadavg()[1].toFixed(1)}% load)`,
        `\u001b[1;33m 💾 Memory :\u001b[0m ${formatMemory(usedMemory)} / ${formatMemory(totalMemory, true)}`,
        `\u001b[1;33m 🕒 Uptime :\u001b[0m ${formatUptime(process.uptime() * 1000)}`,
        `\u001b[1;33m 📡 Ping   :\u001b[0m ${client.ws.ping}ms WS | ${pingTime}ms Bot`,
        '```',
      ].join('\n'))
      .setFooter({
        text: `🔄 Last updated: ${new Date().toLocaleString()} | by mushroom0162`,
      })
      .setTimestamp();

    if (nodes.length > 0) {
      for (const [index, node] of nodes.entries()) {
        const { stats, aqua } = node;
        if (!stats) continue;
        
        const { memory, cpu, players, playingPlayers, uptime } = stats;
        const cpuLoad = cpu.lavalinkLoadPercentage 
          ? (cpu.lavalinkLoadPercentage * 100).toFixed(1) + '%' 
          : 'N/A';
            
        embed.addFields({
          name: `🌊 Node ${index + 1} ${node.connected ? '🟢' : '🔴'}`,
          value: [
            '```ansi',
            `\u001b[1;36mNode Information\u001b[0m`,
            `\u001b[1;33m 🎮 Players :\u001b[0m ${players || 0} (${playingPlayers || 0} active)`,
            `\u001b[1;33m 💾 Memory  :\u001b[0m ${formatMemory(memory?.used || 0, true)} / ${formatMemory(memory?.reservable || 0, true)}`,
            `\u001b[1;33m ⚡ CPU     :\u001b[0m ${cpuLoad} | \u001b[1;33m⏰ Uptime:\u001b[0m ${formatUptime(uptime || 0)}`,
            `\u001b[1;33m 🌊 Version :\u001b[0m ${aqua?.version || 'Unknown'}`,
            '```'
          ].join('\n'),
          inline: false
        });
      }
    }

    embed.setFooter({
      text: `Requested by ${interaction.user.tag} | by mushroom0162`,
      iconURL: interaction.user.displayAvatarURL(),
    });

    await interaction.editReply({ embeds: [embed] });
  }
};
