import { EmbedBuilder } from 'discord.js';
import { getGuildSettings, updateGuildSettings, isTwentyFourSevenEnabled } from '../utils/db_helper.mjs';

export const Command = {
    name: "24_7",
    description: "Enables/disables 24/7 mode to keep the bot in voice channel",
    run: async (client, interaction) => {
        // Check if user is in a voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("You need to be in a voice channel to use this command")
                        .setColor(0xFF0000)
                ],
                ephemeral: true
            });
        }
        
        // Create player if it doesn't exist
        const player = client.aqua.players.get(interaction.guildId) || await client.aqua.createConnection({
            guildId: interaction.guildId,
            voiceChannel: interaction.member.voice.channelId,
            textChannel: interaction.channelId,
            deaf: true,
            defaultVolume: 65,
        });
        
        // Check if user is in the same voice channel as the bot
        if (interaction.guild.members.me.voice.channelId && 
            interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("You need to be in the same voice channel as me")
                        .setColor(0xFF0000)
                ],
                ephemeral: true
            });
        }
        
        const guildId = interaction.guildId;
        // Get the current guild settings
        const guildSettings = getGuildSettings(guildId);
        
        // Check if 24/7 mode is currently enabled
        const isEnabled = guildSettings.twentyFourSevenEnabled === true;
        
        if (isEnabled) {
            // Disable 24/7 mode
            updateGuildSettings(guildId, {
                twentyFourSevenEnabled: false,
                voiceChannelId: null,
                textChannelId: null
            });
            
            // Update nickname to remove [24/7] tag
            const botMember = interaction.guild.members.me;
            const newNickname = botMember.nickname?.replace(/ ?\[24\/7\]/u, "") || botMember.user.username;
            await botMember.setNickname(newNickname).catch(err => {
                console.error(`Failed to update nickname: ${err.message}`);
            });
            
            const embed = new EmbedBuilder()
                .setTitle("24/7 Mode")
                .setDescription("24/7 mode has been disabled")
                .setColor(0xFF0000)
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        } else {
            // Enable 24/7 mode
            updateGuildSettings(guildId, {
                twentyFourSevenEnabled: true,
                voiceChannelId: interaction.member.voice.channelId,
                textChannelId: interaction.channelId
            });
            
            // Update nickname to add [24/7] tag
            const botMember = interaction.guild.members.me;
            const newNickname = botMember.nickname ? `${botMember.nickname} [24/7]` : `${botMember.user.username} [24/7]`;
            await botMember.setNickname(newNickname).catch(err => {
                console.error(`Failed to update nickname: ${err.message}`);
            });
            
            const embed = new EmbedBuilder()
                .setTitle("24/7 Mode")
                .setDescription("24/7 mode has been enabled")
                .setColor(0x00FF00)
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }
    }
};
