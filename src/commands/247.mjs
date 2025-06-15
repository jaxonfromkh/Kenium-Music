import { EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildSettings, updateGuildSettings } from '../utils/db_helper.mjs';

export const Command = {
    name: "24_7",
    description: "Enables/disables 24/7 mode or edits its settings",
    options: [
        {
            name: 'edit',
            description: 'Edit the 24/7 mode settings or toggle mode',
            type: 3, // String type for choices
            required: false,
            choices: [
                { name: 'Toggle 24/7 mode', value: 'toggle' },
                { name: 'Voice channel', value: 'voice_channel' },
                { name: 'Text channel', value: 'text_channel' },
                { name: 'Volume', value: 'volume' }
            ]
        },
        {
            name: 'voice_channel',
            description: 'The voice channel to set for 24/7 mode',
            type: 7, // Channel type
            required: false,
            channel_types: [ChannelType.GuildVoice]
        },
        {
            name: 'text_channel',
            description: 'The text channel to set for 24/7 mode',
            type: 7, // Channel type
            required: false,
            channel_types: [ChannelType.GuildText]
        },
        {
            name: 'volume',
            description: 'The volume to set (0-100)',
            type: 4, // Integer type
            required: false,
            min_value: 0,
            max_value: 100
        }
    ],
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

        const guildId = interaction.guildId;
        const guildSettings = getGuildSettings(guildId);
        let player = client.aqua.players.get(guildId);

        // Create player if it doesn't exist
        if (!player) {
            player = await client.aqua.createConnection({
                guildId: guildId,
                voiceChannel: interaction.member.voice.channelId,
                textChannel: interaction.channelId,
                deaf: true,
                defaultVolume: guildSettings.volume || 65
            });
        }

        // Check if bot is in a different voice channel
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

        const editChoice = interaction.options.getString('edit') || 'toggle';
        const newVoiceChannel = interaction.options.getChannel('voice_channel');
        const newTextChannel = interaction.options.getChannel('text_channel');
        const newVolume = interaction.options.getInteger('volume');

        const embed = new EmbedBuilder().setTimestamp();
        const updatedSettings = { ...guildSettings };

        // Handle the choices
        switch (editChoice) {
            case 'toggle':
                const currentEnabled = guildSettings.twentyFourSevenEnabled === true;
                const newEnabled = !currentEnabled;
                updatedSettings.twentyFourSevenEnabled = newEnabled;
                updatedSettings.voiceChannelId = newEnabled ? interaction.member.voice.channelId : null;
                updatedSettings.textChannelId = newEnabled ? interaction.channelId : null;
                updateGuildSettings(guildId, updatedSettings);

                // Update bot nickname
                const botMember = interaction.guild.members.me;
                let newNickname;
                if (newEnabled) {
                    newNickname = botMember.nickname ? `${botMember.nickname} [24/7]` : `${botMember.user.username} [24/7]`;
                } else {
                    newNickname = botMember.nickname?.replace(/ ?\[24\/7\]/gu, "") || botMember.user.username;
                }

                if (botMember.nickname !== newNickname) {
                    await botMember.setNickname(newNickname).catch(err => {
                        console.error(`Failed to update nickname: ${err.message}`);
                    });
                }

                embed.setTitle("24/7 Mode")
                    .setDescription(`24/7 mode has been ${newEnabled ? "enabled" : "disabled"}`)
                    .setColor(newEnabled ? 0x00FF00 : 0xFF0000);
                break;

            case 'voice_channel':
                if (!newVoiceChannel) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("Please specify a voice channel to set")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
                if (!guildSettings.twentyFourSevenEnabled) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("24/7 mode must be enabled to change the voice channel")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
                updatedSettings.voiceChannelId = newVoiceChannel.id;
                updateGuildSettings(guildId, updatedSettings);
                if (player) {
                    await player.setVoiceChannel(newVoiceChannel.id);
                    player.destroy();
                }
                embed.setTitle("24/7 Mode Updated")
                    .setDescription(`Voice channel set to ${newVoiceChannel}`)
                    .setColor(0);
                break;

            case 'text_channel':
                if (!newTextChannel) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("Please specify a text channel to set")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
                if (!guildSettings.twentyFourSevenEnabled) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("24/7 mode must be enabled to change the text channel")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
                updatedSettings.textChannelId = newTextChannel.id;
                updateGuildSettings(guildId, updatedSettings);
                if (player) {
                    await player.setTextChannel(newTextChannel.id);
                    player.destroy();
                }
                embed.setTitle("24/7 Mode Updated")
                    .setDescription(`Text channel set to ${newTextChannel}`)
                    .setColor(0);
                break;

            case 'volume':
                if (newVolume === null) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("Please specify a volume value (0-100)")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
                if (!guildSettings.twentyFourSevenEnabled) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("24/7 mode must be enabled to change the volume")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
                updatedSettings.volume = newVolume;
                updateGuildSettings(guildId, updatedSettings);
                if (player) {
                    await player.setVolume(newVolume);
                }
                embed.setTitle("24/7 Mode Updated")
                    .setDescription(`Volume set to ${newVolume}%`)
                    .setColor(0);
                break;

            default:
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("Invalid edit option selected")
                            .setColor(0xFF0000)
                    ],
                    ephemeral: true
                });
        }

        return interaction.reply({ embeds: [embed] });
    }
};
