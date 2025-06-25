import fg from 'fast-glob';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType 
} from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, '.');

const COMMAND_CATEGORIES = {
  music: {
    name: '🎵 Music',
    description: 'Music playback and control commands',
    keywords: ['play', 'pause', 'stop', 'skip', 'queue', 'volume', 'loop', 'shuffle', 'nowplaying', 'lyrics', 'playlist']
  },
  utility: {
    name: '🔧 Utility',
    description: 'Helpful utility commands',
    keywords: ['help', 'ping', 'status', 'clear', 'search', 'grab', 'export', 'import']
  },
  moderation: {
    name: '🛡️ Moderation',
    description: 'Server moderation commands',
    keywords: ['kick', 'ban', 'mute', 'warn', 'purge', 'timeout']
  },
  fun: {
    name: '🎮 Fun & Games',
    description: 'Entertainment and fun commands',
    keywords: ['game', 'fun', 'joke', 'meme', '8ball', 'dice', 'coinflip']
  },
  admin: {
    name: '⚙️ Admin',
    description: 'Server administration commands',
    keywords: ['config', 'settings', 'role', 'channel', 'server', 'prefix', 'autoplay', 'filters']
  }
};

let commandsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000;

async function getCommands() {
  const now = Date.now();
  if (commandsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return commandsCache;
  }
  
  const files = await fg('*.mjs', { cwd: commandsDir });
  const commandFiles = files.filter(file => file !== 'help.mjs');
  
  const commands = await Promise.all(
    commandFiles.map(async (file) => {
      try {
        const module = await import(pathToFileURL(join(commandsDir, file)).href);
        return module.Command;
      } catch {
        return null;
      }
    })
  );
  
  commandsCache = commands.filter(cmd => cmd !== null).sort((a, b) => a.name.localeCompare(b.name));
  cacheTimestamp = now;
  return commandsCache;
}

function categorizeCommand(command) {
  const commandName = command.name.toLowerCase();
  for (const [categoryKey, category] of Object.entries(COMMAND_CATEGORIES)) {
    if (category.keywords.some(keyword => commandName.includes(keyword))) {
      return categoryKey;
    }
  }
  return 'utility';
}

function createMainEmbed(commands) {
  const categorizedCommands = Object.keys(COMMAND_CATEGORIES).reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
  
  commands.forEach(command => {
    const category = categorizeCommand(command);
    categorizedCommands[category].push(command);
  });
  
  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot Help Center')
    .setDescription('Welcome to the help center! Use the menu below to explore different command categories.')
    .setColor(0x5865F2)
    .setTimestamp();
  
  Object.entries(COMMAND_CATEGORIES).forEach(([key, category]) => {
    const commandCount = categorizedCommands[key].length;
    if (commandCount > 0) {
      embed.addFields({
        name: category.name,
        value: `${category.description}\n*${commandCount} command${commandCount !== 1 ? 's' : ''}*`,
        inline: true
      });
    }
  });
  
  embed.addFields({
    name: '💡 How to Use',
    value: '• Select a category from the dropdown menu\n• Click the buttons to navigate\n• Use `/command_name` to run commands',
    inline: false
  });
  
  return embed;
}

function createCategoryEmbed(categoryKey, commands) {
  const category = COMMAND_CATEGORIES[categoryKey];
  const categoryCommands = commands.filter(cmd => categorizeCommand(cmd) === categoryKey);
  
  const embed = new EmbedBuilder()
    .setTitle(`${category.name} Commands`)
    .setDescription(category.description)
    .setColor(0x5865F2)
    .setTimestamp();
  
  if (categoryCommands.length === 0) {
    embed.addFields({
      name: 'No Commands',
      value: 'No commands found in this category.',
      inline: false
    });
  } else {
    const chunks = [];
    for (let i = 0; i < categoryCommands.length; i += 10) {
      chunks.push(categoryCommands.slice(i, i + 10));
    }
    
    chunks.forEach((chunk, index) => {
      const commandList = chunk
        .map(cmd => `**${cmd.name}** - ${cmd.description || 'No description available'}`)
        .join('\n');
      
      embed.addFields({
        name: chunks.length > 1 ? `Commands (${index + 1}/${chunks.length})` : 'Commands',
        value: commandList,
        inline: false
      });
    });
  }
  
  embed.setFooter({ text: `${categoryCommands.length} command${categoryCommands.length !== 1 ? 's' : ''} in this category` });
  
  return embed;
}

function createComponents(showBackButton = false) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('Choose a command category...')
    .addOptions(
      Object.entries(COMMAND_CATEGORIES).map(([key, category]) => ({
        label: category.name.replace(/^[^\s]+\s/, ''),
        description: category.description,
        value: key,
        emoji: category.name.match(/^[^\s]+/)?.[0]
      }))
    );
  
  const buttons = new ActionRowBuilder();
  
  if (showBackButton) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('help_back')
        .setLabel('← Back to Overview')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  
  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId('help_refresh')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('❌ Close')
      .setStyle(ButtonStyle.Danger)
  );
  
  const components = [new ActionRowBuilder().addComponents(selectMenu)];
  if (buttons.components.length > 0) {
    components.push(buttons);
  }
  
  return components;
}

export const Command = {
  name: 'help',
  description: 'Interactive help menu with organized command categories.',
  
  run: async (client, message) => {
    try {
      const commands = await getCommands();
      const embed = createMainEmbed(commands);
      const components = createComponents();
      
      const response = await message.channel.send({
        embeds: [embed],
        components: components
      });
      
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 300000
      });
      
      const buttonCollector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000
      });
      
      collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({
            content: 'Only the command user can interact with this menu.',
            flags: 64
          });
          return;
        }
        
        const categoryKey = interaction.values[0];
        const categoryEmbed = createCategoryEmbed(categoryKey, commands);
        const categoryComponents = createComponents(true);
        
        await interaction.update({
          embeds: [categoryEmbed],
          components: categoryComponents
        });
      });
      
      buttonCollector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({
            content: 'Only the command user can interact with this menu.',
            flags: 64
          });
          return;
        }
        
        switch (interaction.customId) {
          case 'help_back':
            const mainEmbed = createMainEmbed(commands);
            const mainComponents = createComponents();
            await interaction.update({
              embeds: [mainEmbed],
              components: mainComponents
            });
            break;
            
          case 'help_refresh':
            commandsCache = null;
            const refreshedCommands = await getCommands();
            const refreshedEmbed = createMainEmbed(refreshedCommands);
            const refreshedComponents = createComponents();
            await interaction.update({
              embeds: [refreshedEmbed],
              components: refreshedComponents
            });
            break;
            
          case 'help_close':
            await interaction.update({
              embeds: [embed.setColor(0x99AAB5).setTitle('🤖 Help Menu Closed')],
              components: []
            });
            collector.stop();
            buttonCollector.stop();
            break;
        }
      });
      
      collector.on('end', async () => {
        try {
          await response.edit({
            components: []
          });
        } catch (error) {
          console.log('Could not disable components:', error.message);
        }
      });
      
    } catch (error) {
      console.error('Error in help command:', error);
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('An error occurred while loading the help menu.')
            .setColor(0xFF0000)
        ]
      });
    }
  }
};