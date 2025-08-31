const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const TimeParser = require('../utils/timeParser.js');
const config = require('../config.json');

const commands = [
    {
        name: 'warn',
        description: 'Warn a user',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Warn a user')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to warn')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the warning')
                    .setMaxLength(1000)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(target.id);

            // Permission checks
            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            if (!member) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'User not found in this server.')], 
                    ephemeral: true 
                });
            }

            if (!PermissionManager.canModerate(interaction.member, member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'You cannot warn this user.')], 
                    ephemeral: true 
                });
            }

            try {
                // Add warning to database
                const expiresAt = TimeParser.getFutureTimestamp('90d'); // Auto-expire after 90 days
                client.db.addWarning(interaction.guild.id, target.id, interaction.user.id, reason, expiresAt.toISOString());

                // Get current warnings
                const warnings = client.db.getWarnings(interaction.guild.id, target.id);
                const warningCount = warnings.length;

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Warning', target.id, interaction.user.id, reason);
                client.logger.logModeration('Warning', target, interaction.user, interaction.guild, reason);

                // Create success embed
                const embed = EmbedManager.createSuccessEmbed('User Warned', 
                    `${target.tag} has been warned.\n**Reason:** ${reason}\n**Total Warnings:** ${warningCount}/${config.maxWarnings}`);

                await interaction.reply({ embeds: [embed] });

                // Send DM to user
                try {
                    const dmEmbed = EmbedManager.createWarningEmbed(`Warning in ${interaction.guild.name}`, 
                        `You have been warned by ${interaction.user.tag}.\n**Reason:** ${reason}\n**Warnings:** ${warningCount}/${config.maxWarnings}`);
                    await target.send({ embeds: [dmEmbed] });
                } catch (error) {
                    // Ignore DM errors
                }

                // Auto-action if max warnings reached
                if (warningCount >= config.maxWarnings) {
                    try {
                        await member.timeout(24 * 60 * 60 * 1000, `Reached maximum warnings (${config.maxWarnings})`); // 24 hours
                        
                        const autoActionEmbed = EmbedManager.createWarningEmbed('Auto-Action Taken', 
                            `${target.tag} has been timed out for 24 hours due to reaching the maximum warning limit.`);
                        await interaction.followUp({ embeds: [autoActionEmbed] });

                        client.db.addModLog(interaction.guild.id, 'Auto-Timeout', target.id, client.user.id, `Maximum warnings reached (${config.maxWarnings})`);
                    } catch (error) {
                        client.logger.error('Failed to timeout user after max warnings:', error);
                    }
                }

                // Send to log channel
                const guildSettings = client.db.getGuildSettings(interaction.guild.id);
                if (guildSettings?.log_channel_id) {
                    const logChannel = interaction.guild.channels.cache.get(guildSettings.log_channel_id);
                    if (logChannel) {
                        const logEmbed = EmbedManager.createModerationEmbed('Warning', target, interaction.user, reason);
                        logEmbed.addFields([{ name: 'Warning Count', value: `${warningCount}/${config.maxWarnings}`, inline: true }]);
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

            } catch (error) {
                client.logger.error('Error in warn command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while warning the user.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'warnings',
        description: 'View warnings for a user',
        permissions: ['helper'],
        data: new SlashCommandBuilder()
            .setName('warnings')
            .setDescription('View warnings for a user')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to check warnings for')
                    .setRequired(true)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');

            if (!PermissionManager.isHelper(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need helper permissions or higher to use this command.')], 
                    ephemeral: true 
                });
            }

            try {
                const warnings = client.db.getWarnings(interaction.guild.id, target.id);

                if (warnings.length === 0) {
                    const embed = EmbedManager.createEmbed('No Warnings', `${target.tag} has no active warnings.`);
                    return interaction.reply({ embeds: [embed] });
                }

                const embed = EmbedManager.createEmbed(`Warnings for ${target.tag}`, 
                    `Total warnings: ${warnings.length}/${config.maxWarnings}`);

                warnings.slice(0, 10).forEach((warning, index) => {
                    const moderator = client.users.cache.get(warning.moderator_id);
                    const createdAt = TimeParser.getDiscordTimestamp(warning.created_at);
                    const expiresAt = warning.expires_at ? TimeParser.getDiscordTimestamp(warning.expires_at) : 'Never';
                    
                    embed.addFields([{
                        name: `Warning #${index + 1}`,
                        value: `**Reason:** ${warning.reason || 'No reason'}\n**Moderator:** ${moderator?.tag || 'Unknown'}\n**Date:** ${createdAt}\n**Expires:** ${expiresAt}`,
                        inline: false
                    }]);
                });

                if (warnings.length > 10) {
                    embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings` });
                }

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                client.logger.error('Error in warnings command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching warnings.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'clear-warnings',
        description: 'Clear all warnings for a user',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('clear-warnings')
            .setDescription('Clear all warnings for a user')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to clear warnings for')
                    .setRequired(true)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            try {
                const warnings = client.db.getWarnings(interaction.guild.id, target.id);
                
                if (warnings.length === 0) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createWarningEmbed('No Warnings', `${target.tag} has no warnings to clear.`)], 
                        ephemeral: true 
                    });
                }

                client.db.clearWarnings(interaction.guild.id, target.id);
                client.db.addModLog(interaction.guild.id, 'Clear Warnings', target.id, interaction.user.id, `Cleared ${warnings.length} warnings`);

                const embed = EmbedManager.createSuccessEmbed('Warnings Cleared', 
                    `Cleared ${warnings.length} warning(s) for ${target.tag}.`);
                
                await interaction.reply({ embeds: [embed] });

                client.logger.logModeration('Clear Warnings', target, interaction.user, interaction.guild, `Cleared ${warnings.length} warnings`);

            } catch (error) {
                client.logger.error('Error in clear-warnings command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while clearing warnings.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'mute',
        description: 'Mute a user',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Mute a user')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to mute')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('duration')
                    .setDescription('Duration of the mute (e.g., 1h, 30m, 1d)')
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the mute')
                    .setMaxLength(1000)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration') || config.defaultMuteTime;
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(target.id);

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            if (!member) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'User not found in this server.')], 
                    ephemeral: true 
                });
            }

            if (!PermissionManager.canModerate(interaction.member, member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'You cannot mute this user.')], 
                    ephemeral: true 
                });
            }

            const durationMs = TimeParser.parseTime(duration);
            if (!durationMs) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Invalid Duration', 'Please provide a valid duration (e.g., 1h, 30m, 1d).')], 
                    ephemeral: true 
                });
            }

            // Maximum mute duration of 28 days (Discord limit)
            const maxDuration = 28 * 24 * 60 * 60 * 1000;
            if (durationMs > maxDuration) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Duration Too Long', 'Maximum mute duration is 28 days.')], 
                    ephemeral: true 
                });
            }

            try {
                const expiresAt = new Date(Date.now() + durationMs);
                
                // Use Discord's timeout feature
                await member.timeout(durationMs, reason);

                // Store in database
                client.db.addMute(interaction.guild.id, target.id, interaction.user.id, reason, expiresAt.toISOString());
                client.db.addModLog(interaction.guild.id, 'Mute', target.id, interaction.user.id, reason, TimeParser.formatTime(durationMs));

                const embed = EmbedManager.createSuccessEmbed('User Muted', 
                    `${target.tag} has been muted for ${TimeParser.formatTime(durationMs)}.\n**Reason:** ${reason}`);

                await interaction.reply({ embeds: [embed] });

                // Send DM to user
                try {
                    const dmEmbed = EmbedManager.createWarningEmbed(`Muted in ${interaction.guild.name}`, 
                        `You have been muted by ${interaction.user.tag} for ${TimeParser.formatTime(durationMs)}.\n**Reason:** ${reason}`);
                    await target.send({ embeds: [dmEmbed] });
                } catch (error) {
                    // Ignore DM errors
                }

                client.logger.logModeration('Mute', target, interaction.user, interaction.guild, reason);

                // Send to log channel
                const guildSettings = client.db.getGuildSettings(interaction.guild.id);
                if (guildSettings?.log_channel_id) {
                    const logChannel = interaction.guild.channels.cache.get(guildSettings.log_channel_id);
                    if (logChannel) {
                        const logEmbed = EmbedManager.createModerationEmbed('Mute', target, interaction.user, reason, TimeParser.formatTime(durationMs));
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

            } catch (error) {
                client.logger.error('Error in mute command:', error);
                
                if (error.code === 50013) {
                    await interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Permission Error', 'I do not have permission to timeout this user.')], 
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while muting the user.')], 
                        ephemeral: true 
                    });
                }
            }
        }
    },

    {
        name: 'unmute',
        description: 'Unmute a user',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('unmute')
            .setDescription('Unmute a user')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to unmute')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the unmute')
                    .setMaxLength(1000)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(target.id);

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            if (!member) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'User not found in this server.')], 
                    ephemeral: true 
                });
            }

            if (!member.isCommunicationDisabled()) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'User is not currently muted.')], 
                    ephemeral: true 
                });
            }

            try {
                await member.timeout(null, reason);
                client.db.removeMute(interaction.guild.id, target.id);
                client.db.addModLog(interaction.guild.id, 'Unmute', target.id, interaction.user.id, reason);

                const embed = EmbedManager.createSuccessEmbed('User Unmuted', 
                    `${target.tag} has been unmuted.\n**Reason:** ${reason}`);

                await interaction.reply({ embeds: [embed] });

                client.logger.logModeration('Unmute', target, interaction.user, interaction.guild, reason);

            } catch (error) {
                client.logger.error('Error in unmute command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while unmuting the user.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'kick',
        description: 'Kick a user from the server',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a user from the server')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to kick')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the kick')
                    .setMaxLength(1000)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(target.id);

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            if (!member) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'User not found in this server.')], 
                    ephemeral: true 
                });
            }

            if (!PermissionManager.canModerate(interaction.member, member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'You cannot kick this user.')], 
                    ephemeral: true 
                });
            }

            if (!member.kickable) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'I cannot kick this user.')], 
                    ephemeral: true 
                });
            }

            try {
                // Send DM before kicking
                try {
                    const dmEmbed = EmbedManager.createWarningEmbed(`Kicked from ${interaction.guild.name}`, 
                        `You have been kicked by ${interaction.user.tag}.\n**Reason:** ${reason}`);
                    await target.send({ embeds: [dmEmbed] });
                } catch (error) {
                    // Ignore DM errors
                }

                await member.kick(reason);
                client.db.addModLog(interaction.guild.id, 'Kick', target.id, interaction.user.id, reason);

                const embed = EmbedManager.createSuccessEmbed('User Kicked', 
                    `${target.tag} has been kicked from the server.\n**Reason:** ${reason}`);

                await interaction.reply({ embeds: [embed] });

                client.logger.logModeration('Kick', target, interaction.user, interaction.guild, reason);

                // Send to log channel
                const guildSettings = client.db.getGuildSettings(interaction.guild.id);
                if (guildSettings?.log_channel_id) {
                    const logChannel = interaction.guild.channels.cache.get(guildSettings.log_channel_id);
                    if (logChannel) {
                        const logEmbed = EmbedManager.createModerationEmbed('Kick', target, interaction.user, reason);
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

            } catch (error) {
                client.logger.error('Error in kick command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while kicking the user.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'ban',
        description: 'Ban a user from the server',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a user from the server')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to ban')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the ban')
                    .setMaxLength(1000))
            .addIntegerOption(option =>
                option.setName('delete_days')
                    .setDescription('Number of days of messages to delete (0-7)')
                    .setMinValue(0)
                    .setMaxValue(7)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete_days') || 0;
            const member = interaction.guild.members.cache.get(target.id);

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            if (member && !PermissionManager.canModerate(interaction.member, member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'You cannot ban this user.')], 
                    ephemeral: true 
                });
            }

            try {
                // Send DM before banning (if user is in server)
                if (member) {
                    try {
                        const dmEmbed = EmbedManager.createWarningEmbed(`Banned from ${interaction.guild.name}`, 
                            `You have been banned by ${interaction.user.tag}.\n**Reason:** ${reason}`);
                        await target.send({ embeds: [dmEmbed] });
                    } catch (error) {
                        // Ignore DM errors
                    }
                }

                await interaction.guild.members.ban(target, {
                    reason: reason,
                    deleteMessageSeconds: deleteDays * 24 * 60 * 60
                });

                client.db.addModLog(interaction.guild.id, 'Ban', target.id, interaction.user.id, reason);

                const embed = EmbedManager.createSuccessEmbed('User Banned', 
                    `${target.tag} has been banned from the server.\n**Reason:** ${reason}${deleteDays > 0 ? `\n**Message Deletion:** ${deleteDays} days` : ''}`);

                await interaction.reply({ embeds: [embed] });

                client.logger.logModeration('Ban', target, interaction.user, interaction.guild, reason);

                // Send to log channel
                const guildSettings = client.db.getGuildSettings(interaction.guild.id);
                if (guildSettings?.log_channel_id) {
                    const logChannel = interaction.guild.channels.cache.get(guildSettings.log_channel_id);
                    if (logChannel) {
                        const logEmbed = EmbedManager.createModerationEmbed('Ban', target, interaction.user, reason);
                        if (deleteDays > 0) {
                            logEmbed.addFields([{ name: 'Message Deletion', value: `${deleteDays} days`, inline: true }]);
                        }
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

            } catch (error) {
                client.logger.error('Error in ban command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while banning the user.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'purge',
        description: 'Delete multiple messages',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('purge')
            .setDescription('Delete multiple messages')
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('Number of messages to delete (1-1000)')
                    .setMinValue(1)
                    .setMaxValue(1000)
                    .setRequired(true))
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Only delete messages from this user')
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the purge')
                    .setMaxLength(1000)),
        async execute(interaction, client) {
            const amount = interaction.options.getInteger('amount');
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            // Check bot permissions
            const requiredPerms = ['ManageMessages', 'ReadMessageHistory'];
            if (!PermissionManager.botHasPermissions(interaction.channel, requiredPerms)) {
                const missingPerms = PermissionManager.getMissingPermissions(interaction.channel, requiredPerms);
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Missing Permissions', `I need the following permissions: ${missingPerms.join(', ')}`)], 
                    ephemeral: true 
                });
            }

            try {
                await interaction.deferReply({ ephemeral: true });

                // Fetch messages
                const messages = await interaction.channel.messages.fetch({ limit: Math.min(amount + 1, 100) });
                let messagesToDelete = messages.filter(msg => msg.id !== interaction.id);

                // Filter by user if specified
                if (targetUser) {
                    messagesToDelete = messagesToDelete.filter(msg => msg.author.id === targetUser.id);
                }

                // Filter out messages older than 14 days (Discord limitation)
                const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                messagesToDelete = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);

                if (messagesToDelete.size === 0) {
                    return interaction.editReply({ 
                        embeds: [EmbedManager.createWarningEmbed('No Messages', 'No messages found to delete (messages must be less than 14 days old).')]
                    });
                }

                // Delete messages
                let deletedCount = 0;
                if (messagesToDelete.size === 1) {
                    await messagesToDelete.first().delete();
                    deletedCount = 1;
                } else {
                    const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
                    deletedCount = deleted.size;
                }

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Purge', targetUser?.id || 'N/A', interaction.user.id, 
                    `${reason} (${deletedCount} messages deleted)`);

                const embed = EmbedManager.createSuccessEmbed('Messages Purged', 
                    `Successfully deleted ${deletedCount} message(s)${targetUser ? ` from ${targetUser.tag}` : ''}.`);

                await interaction.editReply({ embeds: [embed] });

                client.logger.logModeration('Purge', { tag: `${deletedCount} messages`, id: 'N/A' }, interaction.user, interaction.guild, reason);

                // Send to log channel
                const guildSettings = client.db.getGuildSettings(interaction.guild.id);
                if (guildSettings?.log_channel_id) {
                    const logChannel = interaction.guild.channels.cache.get(guildSettings.log_channel_id);
                    if (logChannel && logChannel.id !== interaction.channel.id) {
                        const logEmbed = EmbedManager.createEmbed('Messages Purged', 
                            `${deletedCount} message(s) were deleted in ${interaction.channel}${targetUser ? ` from ${targetUser.tag}` : ''}.`, 
                            config.warningColor);
                        logEmbed.addFields([
                            { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                            { name: 'Channel', value: `${interaction.channel.name} (${interaction.channel.id})`, inline: true },
                            { name: 'Reason', value: reason, inline: false }
                        ]);
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

            } catch (error) {
                client.logger.error('Error in purge command:', error);
                
                const errorMessage = error.code === 50034 
                    ? 'Cannot delete messages older than 14 days.'
                    : 'An error occurred while purging messages.';

                if (interaction.deferred) {
                    await interaction.editReply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', errorMessage)]
                    });
                } else {
                    await interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', errorMessage)], 
                        ephemeral: true 
                    });
                }
            }
        }
    }
];

module.exports = { commands };
