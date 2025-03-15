import { EmbedBuilder } from "discord.js";
import os from 'node:os';

const CPU_INFO = {
  model: os.cpus()[0]?.model.replace(/\(R\)|®|\(TM\)|™/g, '').trim().split('@')[0].trim() || 'Unknown',
  cores: os.cpus().length,
  lastCheck: 0,
  loadAvg: [0, 0, 0]
};

const formatUptime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return [
    days && `${days}d`,
    hours && `${hours}h`,
    minutes && `${minutes}m`,
    secs && `${secs}s`
  ].filter(Boolean).join(' ') || '0s';
};

const formatMemory = (() => {
  const cache = new Map();
  const GB = 1073741824;
  const MB = 1048576;
  
  return (bytes, inGB = false) => {
    const key = `${bytes}-${inGB}`;
    if (cache.has(key)) return cache.get(key);
    
    const result = inGB 
      ? `${(bytes / GB).toFixed(2)} GB`
      : `${(bytes / MB).toFixed(2)} MB`;
    
    cache.set(key, result);
    return result;
  };
})();

const createProgressBar = (used, total, length = 10) => {
  const progress = Math.round((used / total) * length);
  return `\`[${'━'.repeat(progress)}⚪${'─'.repeat(length - progress)}]\``;
};

export const Command = {
  name: 'status',
  description: 'View system metrics and node status',
  cooldown: 10,
  
  run: async (client, interaction) => {
    await interaction.deferReply();
    
    const now = Date.now();
    if (now - CPU_INFO.lastCheck > 5000) {
      CPU_INFO.loadAvg = os.loadavg();
      CPU_INFO.lastCheck = now;
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
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
    
    const embed = new EmbedBuilder()
      .setColor(0)
      .setAuthor({
      name: `System ${isOnline ? '● Online' : '● Offline'}`,
      iconURL: client.user.displayAvatarURL(),
      })
      .setDescription([
      '```ansi',
      `\u001b[1;94m┌────── \u001b[1;97mKENIUM 3.0.4\u001b[1;94m ──────┐\u001b[0m`,
      `\u001b[1;90m SYS \u001b[0m`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mCPU \u001b[0m ${CPU_INFO.model}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mLoad \u001b[0m ${createProgressBar(CPU_INFO.loadAvg[0] / CPU_INFO.cores, 1)}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mMem \u001b[0m ${createProgressBar(usedMemory, totalMemory)} ${formatMemory(usedMemory, true)}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mProc \u001b[0m ${formatMemory(processMemory.heapUsed)} • ${formatMemory(processMemory.heapTotal)}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mUptime \u001b[0m ${formatUptime(process.uptime() * 1000)}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mPing \u001b[0m ${client.ws.ping}ms • ${pingTime}ms`,
      `\u001b[1;90m LAVALINK \u001b[1;94m${connectedNodes}/${nodes.length}\u001b[0m`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mPlayers \u001b[0m ${players} • ${playingPlayers}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mMem \u001b[0m ${createProgressBar(memoryUsed, memoryTotal)} ${formatMemory(memoryUsed, true)}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mCPU \u001b[0m ${cpuLoad} • ${formatUptime(uptime)}`,
      `\u001b[1;94m❯\u001b[0m \u001b[1;97mVersion \u001b[0m ${aqua?.version || 'Unknown'}`,
      `\u001b[1;94m└───────────────────────────┘\u001b[0m`,
      '```'
      ].join('\n'))
      .setFooter({
      text: `Requested by ${interaction.user.tag} • by mushroom0162`,
      iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ 
      embeds: [embed],
    });
  }
};
