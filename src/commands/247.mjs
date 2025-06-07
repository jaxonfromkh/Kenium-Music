import { EmbedBuilder } from 'discord.js';
import { getGuildSettings, updateGuildSettings } from '../utils/db_helper.mjs';

export const Command = {
    name: "24_7",
    description: "Enables/disables 24/7 mode to keep the bot in voice channel",
    run: async (client, interaction) => {
        if (!interaction.member.voice.channel) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("You need to be in a voice channel to use this command")
                        .setColor(0xFF0000)
                ],
                flags: 64
            });
        }

        let player = client.aqua.players.get(interaction.guildId);
        if (!player) {
            player = await client.aqua.createConnection({
                guildId: interaction.guildId,
                voiceChannel: interaction.member.voice.channelId,
                textChannel: interaction.channelId,
                deaf: true,
                defaultVolume: 65,
            });
        }

        if (interaction.guild.members.me.voice.channelId && 
            interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("You need to be in the same voice channel as me")
                        .setColor(0xFF0000)
                ],
                flags: 64
            });
        }

        const guildId = interaction.guildId;
        const guildSettings = getGuildSettings(guildId);

        const currentEnabled = guildSettings.twentyFourSevenEnabled === true;
        const newEnabled = !currentEnabled;

        updateGuildSettings(guildId, {
            twentyFourSevenEnabled: newEnabled,
            voiceChannelId: newEnabled ? interaction.member.voice.channelId : null,
            textChannelId: newEnabled ? interaction.channelId : null
        });

        const botMember = interaction.guild.members.me;
        let newNickname;
        if (newEnabled) {
            newNickname = botMember.nickname ? `${botMember.nickname} [24/7]` : `${botMember.user.username} [24/7]`;
        } else {
            newNickname = botMember.nickname?.replace(/ ?\[24\/7\]/u, "") || botMember.user.username;
        }

        if (botMember.nickname !== newNickname) {
            await botMember.setNickname(newNickname).catch(err => {
                console.error(`Failed to update nickname: ${err.message}`);
            });
        }

        const action = newEnabled ? "enabled" : "disabled";
        const color = newEnabled ? 0x00FF00 : 0xFF0000;
        const embed = new EmbedBuilder()
            .setTitle("24/7 Mode")
            .setDescription(`24/7 mode has been ${action}`)
            .setColor(color)
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};