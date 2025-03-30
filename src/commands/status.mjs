import { EmbedBuilder } from "discord.js";
import os from 'node:os';


const CPU_CACHE = {
  model: os.cpus()[0]?.model.replace(/\(R\)|®|\(TM\)|™/g, '').trim().split('@')[0].trim() || 'Unknown',
  cores: os.cpus().length,
  lastCheck: 0,
  loadAvg: [0, 0, 0]
};


const formatters = {
  uptime: (() => {
    const cache = new Map();
    
    return (ms) => {
      const cacheKey = Math.floor(ms / 1000);
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      
      const seconds = Math.floor(ms / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      const result = [
        days > 0 && `${days}d`,
        hours > 0 && `${hours}h`,
        minutes > 0 && `${minutes}m`,
        `${secs}s`
      ].filter(Boolean).join(' ');
      
      cache.set(cacheKey, result);
      if (cache.size > 100) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      
      return result;
    };
  })(),
  
  memory: (() => {
    const cache = new Map();
    const GB = 1073741824;
    const MB = 1048576;
    
    return (bytes, inGB = false) => {
      const roundedBytes = Math.round(bytes / MB) * MB;
      const cacheKey = `${roundedBytes}-${inGB}`;
      
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      
      const result = inGB 
        ? `${(roundedBytes / GB).toFixed(2)} GB`
        : `${(roundedBytes / MB).toFixed(2)} MB`;
      
      cache.set(cacheKey, result);
      if (cache.size > 50) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      
      return result;
    };
  })()
};

const createProgressBar = (used, total, length = 10) => {
  const progress = Math.min(Math.round((used / total) * length), length);
  return `${'▰'.repeat(progress)}${'▱'.repeat(length - progress)}`;
};

export const Command = {
  name: 'status',
  description: 'View system metrics and node status',
  cooldown: 10,
  
  run: async (client, interaction) => {
    await interaction.deferReply();
    
    const now = Date.now();
    if (now - CPU_CACHE.lastCheck > 5000) {
      CPU_CACHE.loadAvg = os.loadavg();
      CPU_CACHE.lastCheck = now;
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercentage = (usedMemory / totalMemory * 100).toFixed(1);
    const processMemory = process.memoryUsage();
    
    const pingTime = Date.now() - interaction.createdTimestamp;
    const nodes = [...client.aqua.nodeMap.values()];
    const isOnline = nodes.some(node => node.connected);
    const connectedNodes = nodes.filter(node => node.connected).length;

    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return (a.options?.identifier || '').localeCompare(b.options?.identifier || '');
    });
    
    const activeNode = sortedNodes.find(node => node.connected);
    const { stats = {}, aqua = {} } = activeNode || {};
    const { memory = {}, cpu = {}, players = 0, playingPlayers = 0, uptime = 0 } = stats;
    
    const cpuLoad = cpu?.lavalinkLoadPercentage 
      ? (cpu.lavalinkLoadPercentage * 100).toFixed(1) + '%' 
      : 'N/A';
    
    const memoryUsed = memory?.used || 0;
    const memoryTotal = memory?.reservable || 0;
    const lavalinkMemoryPercentage = (memoryUsed / memoryTotal * 100).toFixed(1);
    
    const embed = new EmbedBuilder()
      .setColor(0) 
      .setAuthor({
        name: `System ${isOnline ? '●' : '○'} ${isOnline ? 'Online' : 'Offline'}`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setDescription([
        '```ansi',
        `\u001b[1;94m┌────────────────── \u001b[1;97mKENIUM 3.2.0\u001b[1;94m ─────────────────┐\u001b[0m`,
        '',
        `\u001b[1;90m SYSTEM METRICS \u001b[0m`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mCPU    \u001b[0m ${CPU_CACHE.model}`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mLoad   \u001b[0m [${createProgressBar(CPU_CACHE.loadAvg[0] / CPU_CACHE.cores, 1, 12)}] ${(CPU_CACHE.loadAvg[0] / CPU_CACHE.cores * 100).toFixed(1)}%`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mMemory \u001b[0m [${createProgressBar(usedMemory, totalMemory, 12)}] ${memoryPercentage}% (${formatters.memory(usedMemory, true)})`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mHeap   \u001b[0m ${formatters.memory(processMemory.heapUsed)} / ${formatters.memory(processMemory.heapTotal)}`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mUptime \u001b[0m ${formatters.uptime(process.uptime() * 1000)}`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mPing   \u001b[0m API: ${client.ws.ping}ms | Gateway: ${pingTime}ms`,
        '',
        `\u001b[1;90m LAVALINK \u001b[1;94m${connectedNodes}/${nodes.length}\u001b[0m`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mPlayers \u001b[0m ${playingPlayers} active / ${players} total`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mMemory  \u001b[0m [${createProgressBar(memoryUsed, memoryTotal, 12)}] ${lavalinkMemoryPercentage}% (${formatters.memory(memoryUsed, true)})`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mCPU     \u001b[0m ${cpuLoad} | Uptime: ${formatters.uptime(uptime)}`,
        `\u001b[1;94m❯\u001b[0m \u001b[1;97mVersion \u001b[0m ${aqua?.version || 'Unknown'}`,
        '',
        `\u001b[1;94m└─────────────────────────────────────────────────┘\u001b[0m`,
        '```'
      ].join('\n'))
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ 
      embeds: [embed],
    });
  }
};
