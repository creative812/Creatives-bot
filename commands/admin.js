const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const TimeParser = require('../utils/timeParser.js');
const fs = require('fs');

const commands = [
    {
        name: 'settings',
        description: 'Manage server settings',
        permissions: ['admin'],
        data: new SlashCommandBuilder()
            .setName('settings')
            .setDescription('Manage server settings')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('View current server settings'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('prefix')
                    .setDescription('Set the command prefix')
                    .addStringOption(option =>
                        option.setName('prefix')
                            .setDescription('New command prefix')
                            .setMaxLength(5)
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('log-channel')
                    .setDescription('Set the moderation log channel')
                    .addChannelOption(option =>
                        option.setName('channel')
                            .setDescription('Channel for moderation logs')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('welcome-channel')
                    .setDescription('Set the welcome channel')
                    .addChannelOption(option =>
                        option.setName('channel')
                            .setDescription('Channel for welcome messages')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('welcome-message')
                    .setDescription('Set the welcome message')
                    .addStringOption(option =>
                        option.setName('message')
                            .setDescription('Welcome message (use {user} for mention, {server} for server name)')
                            .setMaxLength(1000)
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('leave-message')
                    .setDescription('Set the leave message')
                    .addStringOption(option =>
                        option.setName('message')
                            .setDescription('Leave message (use {user} for username, {server} for server name)')
                            .setMaxLength(1000)
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('embed-color')
                    .setDescription('Set the default embed color')
                    .addStringOption(option =>
                        option.setName('color')
                            .setDescription('Hex color code (e.g., #7289DA)')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('automod')
                    .setDescription('Toggle auto-moderation')
                    .addBooleanOption(option =>
                        option.setName('enabled')
                            .setDescription('Enable or disable auto-moderation')
                            .setRequired(true))),
        async execute(interaction, client) {
            if (!PermissionManager.isAdmin(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const subcommand = interaction.options.getSubcommand();

            try {
                if (subcommand === 'view') {
                    const settings = client.db.getGuildSettings(interaction.guild.id) || {};
                    
                    const logChannel = settings.log_channel_id ? `<#${settings.log_channel_id}>` : 'Not set';
                    const welcomeChannel = settings.welcome_channel_id ? `<#${settings.welcome_channel_id}>` : 'Not set';
                    const autoRole = settings.auto_role_id ? `<@&${settings.auto_role_id}>` : 'Not set';
                    
                    const embed = EmbedManager.createEmbed('⚙️ Server Settings', 'Current configuration for this server')
                        .addFields([
                            { name: 'Prefix', value: settings.prefix || '!', inline: true },
                            { name: 'Log Channel', value: logChannel, inline: true },
                            { name: 'Welcome Channel', value: welcomeChannel, inline: true },
                            { name: 'Auto Role', value: autoRole, inline: true },
                            { name: 'Embed Color', value: settings.embed_color || '#7289DA', inline: true },
                            { name: 'Auto-Moderation', value: settings.automod_enabled ? 'Enabled' : 'Disabled', inline: true },
                            { name: 'Welcome Message', value: settings.welcome_message || 'Default message', inline: false },
                            { name: 'Leave Message', value: settings.leave_message || 'Default message', inline: false }
                        ]);

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (subcommand === 'prefix') {
                    const newPrefix = interaction.options.getString('prefix');
                    
                    if (newPrefix.length > 5) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Invalid Prefix', 'Prefix must be 5 characters or less.')], 
                            ephemeral: true 
                        });
                    }

                    client.db.setGuildSetting(interaction.guild.id, 'prefix', newPrefix);

                    const embed = EmbedManager.createSuccessEmbed('Prefix Updated', 
                        `Command prefix has been set to: \`${newPrefix}\``);
                    
                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'log-channel') {
                    const channel = interaction.options.getChannel('channel');
                    
                    if (channel) {
                        // Check if bot can send messages in the channel
                        if (!PermissionManager.botHasPermissions(channel, ['SendMessages', 'EmbedLinks'])) {
                            return interaction.reply({ 
                                embeds: [EmbedManager.createErrorEmbed('Missing Permissions', `I need "Send Messages" and "Embed Links" permissions in ${channel}.`)], 
                                ephemeral: true 
                            });
                        }

                        client.db.setGuildSetting(interaction.guild.id, 'log_channel_id', channel.id);
                        
                        const embed = EmbedManager.createSuccessEmbed('Log Channel Set', 
                            `Moderation logs will now be sent to ${channel}.`);
                        
                        await interaction.reply({ embeds: [embed] });
                    } else {
                        client.db.setGuildSetting(interaction.guild.id, 'log_channel_id', null);
                        
                        const embed = EmbedManager.createSuccessEmbed('Log Channel Removed', 
                            'Moderation logging has been disabled.');
                        
                        await interaction.reply({ embeds: [embed] });
                    }

                } else if (subcommand === 'welcome-channel') {
                    const channel = interaction.options.getChannel('channel');
                    
                    if (channel) {
                        if (!PermissionManager.botHasPermissions(channel, ['SendMessages', 'EmbedLinks'])) {
                            return interaction.reply({ 
                                embeds: [EmbedManager.createErrorEmbed('Missing Permissions', `I need "Send Messages" and "Embed Links" permissions in ${channel}.`)], 
                                ephemeral: true 
                            });
                        }

                        client.db.setGuildSetting(interaction.guild.id, 'welcome_channel_id', channel.id);
                        
                        const embed = EmbedManager.createSuccessEmbed('Welcome Channel Set', 
                            `Welcome and leave messages will now be sent to ${channel}.`);
                        
                        await interaction.reply({ embeds: [embed] });
                    } else {
                        client.db.setGuildSetting(interaction.guild.id, 'welcome_channel_id', null);
                        
                        const embed = EmbedManager.createSuccessEmbed('Welcome Channel Removed', 
                            'Welcome and leave messages have been disabled.');
                        
                        await interaction.reply({ embeds: [embed] });
                    }

                } else if (subcommand === 'welcome-message') {
                    const message = interaction.options.getString('message');
                    
                    client.db.setGuildSetting(interaction.guild.id, 'welcome_message', message);
                    
                    const embed = EmbedManager.createSuccessEmbed('Welcome Message Updated', 
                        message ? `Welcome message set to:\n${message}` : 'Welcome message reset to default.');
                    
                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'leave-message') {
                    const message = interaction.options.getString('message');
                    
                    client.db.setGuildSetting(interaction.guild.id, 'leave_message', message);
                    
                    const embed = EmbedManager.createSuccessEmbed('Leave Message Updated', 
                        message ? `Leave message set to:\n${message}` : 'Leave message reset to default.');
                    
                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'embed-color') {
                    const color = interaction.options.getString('color');
                    
                    if (!/^#[0-9A-F]{6}$/i.test(color)) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Invalid Color', 'Please provide a valid hex color code (e.g., #7289DA).')], 
                            ephemeral: true 
                        });
                    }

                    client.db.setGuildSetting(interaction.guild.id, 'embed_color', color);
                    
                    const embed = EmbedManager.createEmbed('Embed Color Updated', 
                        `Default embed color has been set to: ${color}`, color);
                    
                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'automod') {
                    const enabled = interaction.options.getBoolean('enabled');
                    
                    client.db.setGuildSetting(interaction.guild.id, 'automod_enabled', enabled ? 1 : 0);
                    
                    const embed = EmbedManager.createSuccessEmbed('Auto-Moderation Updated', 
                        `Auto-moderation has been ${enabled ? 'enabled' : 'disabled'}.`);
                    
                    await interaction.reply({ embeds: [embed] });
                }

            } catch (error) {
                client.logger.error('Error in settings command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while updating settings.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'backup',
        description: 'Create or restore server data backup',
        permissions: ['admin'],
        data: new SlashCommandBuilder()
            .setName('backup')
            .setDescription('Create or restore server data backup')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('create')
                    .setDescription('Create a backup of server data'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('info')
                    .setDescription('Show backup information')),
        async execute(interaction, client) {
            if (!PermissionManager.isAdmin(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const subcommand = interaction.options.getSubcommand();

            try {
                if (subcommand === 'create') {
                    await interaction.deferReply({ ephemeral: true });

                    // Create database backup
                    const backupPath = client.db.backup();
                    
                    // Create backup info
                    const backupInfo = {
                        guild_id: interaction.guild.id,
                        guild_name: interaction.guild.name,
                        created_at: new Date().toISOString(),
                        created_by: interaction.user.tag,
                        member_count: interaction.guild.memberCount,
                        settings: client.db.getGuildSettings(interaction.guild.id),
                        warnings_count: client.db.getWarnings(interaction.guild.id, '0').length, // Get all warnings
                        self_roles_count: client.db.getSelfRoles(interaction.guild.id).length
                    };

                    // Create backup file with info
                    const backupData = JSON.stringify(backupInfo, null, 2);
                    const infoPath = backupPath.replace('.db', '_info.json');
                    fs.writeFileSync(infoPath, backupData);

                    // Create attachment
                    const attachment = new AttachmentBuilder(infoPath, { name: `backup_info_${Date.now()}.json` });

                    const embed = EmbedManager.createSuccessEmbed('Backup Created', 
                        `Database backup has been created successfully.\n\n**Backup includes:**\n• Guild settings\n• User warnings\n• Self-roles configuration\n• Moderation logs\n• Giveaway data\n\n**Backup Path:** \`${backupPath}\``);

                    await interaction.editReply({ embeds: [embed], files: [attachment] });

                    // Clean up info file
                    fs.unlinkSync(infoPath);

                } else if (subcommand === 'info') {
                    const settings = client.db.getGuildSettings(interaction.guild.id) || {};
                    const warnings = client.db.getWarnings(interaction.guild.id, '0'); // Get all warnings
                    const selfRoles = client.db.getSelfRoles(interaction.guild.id);
                    const modLogs = client.db.getModLogs(interaction.guild.id, 100);

                    const embed = EmbedManager.createEmbed('📊 Backup Information', 
                        'Current server data that would be included in a backup')
                        .addFields([
                            { name: 'Settings Configured', value: Object.keys(settings).length.toString(), inline: true },
                            { name: 'Total Warnings', value: warnings.length.toString(), inline: true },
                            { name: 'Self-Roles', value: selfRoles.length.toString(), inline: true },
                            { name: 'Moderation Logs', value: modLogs.length.toString(), inline: true },
                            { name: 'Last Backup', value: 'Use `/backup create` to create one', inline: false }
                        ]);

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }

            } catch (error) {
                client.logger.error('Error in backup command:', error);
                
                if (interaction.deferred) {
                    await interaction.editReply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing backup.')], 
                    });
                } else {
                    await interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing backup.')], 
                        ephemeral: true 
                    });
                }
            }
        }
    },

    {
        name: 'logs',
        description: 'View moderation logs',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('logs')
            .setDescription('View moderation logs')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('recent')
                    .setDescription('View recent moderation actions')
                    .addIntegerOption(option =>
                        option.setName('limit')
                            .setDescription('Number of logs to show (1-50)')
                            .setMinValue(1)
                            .setMaxValue(50)
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('user')
                    .setDescription('View logs for a specific user')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to view logs for')
                            .setRequired(true))
                    .addIntegerOption(option =>
                        option.setName('limit')
                            .setDescription('Number of logs to show (1-25)')
                            .setMinValue(1)
                            .setMaxValue(25)
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('cleanup')
                    .setDescription('Clean up old logs (admin only)')),
        async execute(interaction, client) {
            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const subcommand = interaction.options.getSubcommand();

            try {
                if (subcommand === 'recent') {
                    const limit = interaction.options.getInteger('limit') || 10;
                    const logs = client.db.getModLogs(interaction.guild.id, limit);

                    if (logs.length === 0) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createEmbed('No Logs', 'No moderation logs found.')], 
                            ephemeral: true 
                        });
                    }

                    const embed = EmbedManager.createEmbed(`📋 Recent Moderation Logs`, 
                        `Showing ${logs.length} recent moderation action(s)`);

                    logs.forEach((log, index) => {
                        const moderator = client.users.cache.get(log.moderator_id);
                        const target = client.users.cache.get(log.target_user_id);
                        const date = TimeParser.getDiscordTimestamp(log.created_at, 'R');
                        
                        embed.addFields([{
                            name: `${index + 1}. ${log.action_type}`,
                            value: `**Target:** ${target?.tag || 'Unknown User'}\n**Moderator:** ${moderator?.tag || 'Unknown'}\n**Reason:** ${log.reason || 'No reason'}\n**Date:** ${date}`,
                            inline: false
                        }]);
                    });

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (subcommand === 'user') {
                    const user = interaction.options.getUser('user');
                    const limit = interaction.options.getInteger('limit') || 10;
                    
                    const allLogs = client.db.getModLogs(interaction.guild.id, 1000);
                    const userLogs = allLogs.filter(log => log.target_user_id === user.id).slice(0, limit);

                    if (userLogs.length === 0) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createEmbed('No Logs', `No moderation logs found for ${user.tag}.`)], 
                            ephemeral: true 
                        });
                    }

                    const embed = EmbedManager.createEmbed(`📋 Moderation Logs - ${user.tag}`, 
                        `Showing ${userLogs.length} moderation action(s) for this user`);

                    userLogs.forEach((log, index) => {
                        const moderator = client.users.cache.get(log.moderator_id);
                        const date = TimeParser.getDiscordTimestamp(log.created_at, 'R');
                        
                        embed.addFields([{
                            name: `${index + 1}. ${log.action_type}`,
                            value: `**Moderator:** ${moderator?.tag || 'Unknown'}\n**Reason:** ${log.reason || 'No reason'}\n**Date:** ${date}${log.duration ? `\n**Duration:** ${log.duration}` : ''}`,
                            inline: false
                        }]);
                    });

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (subcommand === 'cleanup') {
                    if (!PermissionManager.isAdmin(interaction.member)) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need administrator permissions to clean up logs.')], 
                            ephemeral: true 
                        });
                    }

                    client.db.cleanupOldData();

                    const embed = EmbedManager.createSuccessEmbed('Logs Cleaned Up', 
                        'Old moderation logs and expired warnings have been cleaned up.');

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }

            } catch (error) {
                client.logger.error('Error in logs command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching logs.')], 
                    ephemeral: true 
                });
            }
        }
    }
];

module.exports = { commands };
