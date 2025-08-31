const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const config = require('../config.json');

const commands = [
    {
        name: 'assign-role',
        description: 'Assign a role to a user',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('assign-role')
            .setDescription('Assign a role to a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to assign the role to')
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('Role to assign')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for role assignment')
                    .setMaxLength(500)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');
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

            // Check if bot can manage the role
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'I cannot assign this role because it is higher than or equal to my highest role.')], 
                    ephemeral: true 
                });
            }

            // Check if user can manage the role
            if (role.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'You cannot assign this role because it is higher than or equal to your highest role.')], 
                    ephemeral: true 
                });
            }

            // Check if role is managed by integration
            if (role.managed) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'This role is managed by an integration and cannot be manually assigned.')], 
                    ephemeral: true 
                });
            }

            // Check if user already has the role
            if (member.roles.cache.has(role.id)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createWarningEmbed('Already Has Role', `${target.tag} already has the ${role.name} role.`)], 
                    ephemeral: true 
                });
            }

            try {
                await member.roles.add(role, reason);

                const embed = EmbedManager.createSuccessEmbed('Role Assigned', 
                    `Successfully assigned the **${role.name}** role to ${target.tag}.\n**Reason:** ${reason}`);

                await interaction.reply({ embeds: [embed] });

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Role Added', target.id, interaction.user.id, 
                    `Added role: ${role.name} - Reason: ${reason}`);

                client.logger.logModeration('Role Added', target, interaction.user, interaction.guild, `${role.name} - ${reason}`);

            } catch (error) {
                client.logger.error('Error in assign-role command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while assigning the role.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'remove-role',
        description: 'Remove a role from a user',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('remove-role')
            .setDescription('Remove a role from a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to remove the role from')
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('Role to remove')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for role removal')
                    .setMaxLength(500)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');
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

            // Check if bot can manage the role
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'I cannot remove this role because it is higher than or equal to my highest role.')], 
                    ephemeral: true 
                });
            }

            // Check if user can manage the role
            if (role.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'You cannot remove this role because it is higher than or equal to your highest role.')], 
                    ephemeral: true 
                });
            }

            // Check if role is managed by integration
            if (role.managed) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'This role is managed by an integration and cannot be manually removed.')], 
                    ephemeral: true 
                });
            }

            // Check if user doesn't have the role
            if (!member.roles.cache.has(role.id)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createWarningEmbed('Does Not Have Role', `${target.tag} does not have the ${role.name} role.`)], 
                    ephemeral: true 
                });
            }

            try {
                await member.roles.remove(role, reason);

                const embed = EmbedManager.createSuccessEmbed('Role Removed', 
                    `Successfully removed the **${role.name}** role from ${target.tag}.\n**Reason:** ${reason}`);

                await interaction.reply({ embeds: [embed] });

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Role Removed', target.id, interaction.user.id, 
                    `Removed role: ${role.name} - Reason: ${reason}`);

                client.logger.logModeration('Role Removed', target, interaction.user, interaction.guild, `${role.name} - ${reason}`);

            } catch (error) {
                client.logger.error('Error in remove-role command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while removing the role.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'auto-role',
        description: 'Set up automatic role assignment for new members',
        permissions: ['admin'],
        data: new SlashCommandBuilder()
            .setName('auto-role')
            .setDescription('Set up automatic role assignment for new members')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set the auto-role for new members')
                    .addRoleOption(option =>
                        option.setName('role')
                            .setDescription('Role to automatically assign to new members')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove the auto-role'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('View the current auto-role setting')),
        async execute(interaction, client) {
            if (!PermissionManager.isAdmin(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const subcommand = interaction.options.getSubcommand();

            try {
                if (subcommand === 'set') {
                    const role = interaction.options.getRole('role');

                    // Check if bot can assign the role
                    if (role.position >= interaction.guild.members.me.roles.highest.position) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Error', 'I cannot assign this role because it is higher than or equal to my highest role.')], 
                            ephemeral: true 
                        });
                    }

                    if (role.managed) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Error', 'This role is managed by an integration and cannot be used as auto-role.')], 
                            ephemeral: true 
                        });
                    }

                    // Check bot permissions
                    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Missing Permissions', 'I need the "Manage Roles" permission to assign auto-roles.')], 
                            ephemeral: true 
                        });
                    }

                    client.db.setGuildSetting(interaction.guild.id, 'auto_role_id', role.id);

                    const embed = EmbedManager.createSuccessEmbed('Auto-Role Set', 
                        `The **${role.name}** role will now be automatically assigned to new members.`);

                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'remove') {
                    const current = client.db.getGuildSettings(interaction.guild.id);
                    
                    if (!current?.auto_role_id) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createWarningEmbed('No Auto-Role', 'There is no auto-role currently set.')], 
                            ephemeral: true 
                        });
                    }

                    client.db.setGuildSetting(interaction.guild.id, 'auto_role_id', null);

                    const embed = EmbedManager.createSuccessEmbed('Auto-Role Removed', 
                        'Auto-role assignment has been disabled.');

                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'view') {
                    const settings = client.db.getGuildSettings(interaction.guild.id);
                    
                    if (!settings?.auto_role_id) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createEmbed('Auto-Role Settings', 'No auto-role is currently set.')], 
                            ephemeral: true 
                        });
                    }

                    const role = interaction.guild.roles.cache.get(settings.auto_role_id);
                    const roleText = role ? role.toString() : `Unknown Role (${settings.auto_role_id})`;

                    const embed = EmbedManager.createEmbed('Auto-Role Settings', 
                        `**Current Auto-Role:** ${roleText}`);

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }

            } catch (error) {
                client.logger.error('Error in auto-role command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing auto-role settings.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'self-roles',
        description: 'Manage self-assignable roles',
        permissions: ['admin'],
        data: new SlashCommandBuilder()
            .setName('self-roles')
            .setDescription('Manage self-assignable roles')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('Add a self-assignable role')
                    .addRoleOption(option =>
                        option.setName('role')
                            .setDescription('Role to make self-assignable')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('emoji')
                            .setDescription('Emoji for this role (optional)')
                            .setRequired(false))
                    .addStringOption(option =>
                        option.setName('description')
                            .setDescription('Description for this role (optional)')
                            .setMaxLength(200)
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove a self-assignable role')
                    .addRoleOption(option =>
                        option.setName('role')
                            .setDescription('Role to remove from self-assignable')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all self-assignable roles'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('panel')
                    .setDescription('Create a self-role selection panel')),
        async execute(interaction, client) {
            if (!PermissionManager.isAdmin(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const subcommand = interaction.options.getSubcommand();

            try {
                if (subcommand === 'add') {
                    const role = interaction.options.getRole('role');
                    const emoji = interaction.options.getString('emoji');
                    const description = interaction.options.getString('description');

                    // Check if bot can assign the role
                    if (role.position >= interaction.guild.members.me.roles.highest.position) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Error', 'I cannot assign this role because it is higher than or equal to my highest role.')], 
                            ephemeral: true 
                        });
                    }

                    if (role.managed) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Error', 'This role is managed by an integration and cannot be self-assigned.')], 
                            ephemeral: true 
                        });
                    }

                    // Check if role is already a self-role
                    const existingSelfRoles = client.db.getSelfRoles(interaction.guild.id);
                    if (existingSelfRoles.some(sr => sr.role_id === role.id)) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createWarningEmbed('Already Self-Assignable', `The ${role.name} role is already self-assignable.`)], 
                            ephemeral: true 
                        });
                    }

                    client.db.addSelfRole(interaction.guild.id, role.id, emoji, description);

                    const embed = EmbedManager.createSuccessEmbed('Self-Role Added', 
                        `The **${role.name}** role is now self-assignable.${emoji ? `\n**Emoji:** ${emoji}` : ''}${description ? `\n**Description:** ${description}` : ''}`);

                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'remove') {
                    const role = interaction.options.getRole('role');

                    const existingSelfRoles = client.db.getSelfRoles(interaction.guild.id);
                    if (!existingSelfRoles.some(sr => sr.role_id === role.id)) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createWarningEmbed('Not Self-Assignable', `The ${role.name} role is not currently self-assignable.`)], 
                            ephemeral: true 
                        });
                    }

                    client.db.removeSelfRole(interaction.guild.id, role.id);

                    const embed = EmbedManager.createSuccessEmbed('Self-Role Removed', 
                        `The **${role.name}** role is no longer self-assignable.`);

                    await interaction.reply({ embeds: [embed] });

                } else if (subcommand === 'list') {
                    const selfRoles = client.db.getSelfRoles(interaction.guild.id);

                    if (selfRoles.length === 0) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createEmbed('Self-Assignable Roles', 'No self-assignable roles have been set up.')], 
                            ephemeral: true 
                        });
                    }

                    const embed = EmbedManager.createEmbed('Self-Assignable Roles', 
                        'Here are all the self-assignable roles in this server:');

                    selfRoles.forEach(selfRole => {
                        const role = interaction.guild.roles.cache.get(selfRole.role_id);
                        if (role) {
                            const fieldValue = `${selfRole.emoji || '🔹'} ${role.toString()}${selfRole.description ? `\n${selfRole.description}` : ''}`;
                            embed.addFields([{ name: role.name, value: fieldValue, inline: true }]);
                        }
                    });

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (subcommand === 'panel') {
                    const selfRoles = client.db.getSelfRoles(interaction.guild.id);

                    if (selfRoles.length === 0) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('No Self-Roles', 'You need to add some self-assignable roles first using `/self-roles add`.')], 
                            ephemeral: true 
                        });
                    }

                    // Create select menu for roles (max 25 options)
                    const roleOptions = selfRoles.slice(0, 25).map(selfRole => {
                        const role = interaction.guild.roles.cache.get(selfRole.role_id);
                        if (!role) return null;

                        return {
                            label: role.name,
                            description: selfRole.description || `Get the ${role.name} role`,
                            value: role.id,
                            emoji: selfRole.emoji || undefined
                        };
                    }).filter(option => option !== null);

                    if (roleOptions.length === 0) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Error', 'No valid self-assignable roles found.')], 
                            ephemeral: true 
                        });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('self_role_select')
                        .setPlaceholder('Select roles to add or remove')
                        .setMinValues(0)
                        .setMaxValues(Math.min(roleOptions.length, 25))
                        .addOptions(roleOptions);

                    const row = new ActionRowBuilder().addComponents(selectMenu);

                    const embed = EmbedManager.createEmbed('🎭 Self-Assignable Roles', 
                        'Use the dropdown menu below to add or remove roles from yourself.\n\nSelecting a role you already have will remove it.\nSelecting a role you don\'t have will add it.');

                    embed.addFields([{ 
                        name: 'Available Roles', 
                        value: roleOptions.map(opt => `${opt.emoji || '🔹'} **${opt.label}**${opt.description && opt.description !== `Get the ${opt.label} role` ? `\n└ ${opt.description}` : ''}`).join('\n'), 
                        inline: false 
                    }]);

                    await interaction.reply({ embeds: [embed], components: [row] });
                }

            } catch (error) {
                client.logger.error('Error in self-roles command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing self-roles.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'role',
        description: 'Get or remove a self-assignable role',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('role')
            .setDescription('Get or remove a self-assignable role')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('Role to add or remove from yourself')
                    .setRequired(true)),
        async execute(interaction, client) {
            const role = interaction.options.getRole('role');
            const member = interaction.member;

            try {
                // Check if role is self-assignable
                const selfRoles = client.db.getSelfRoles(interaction.guild.id);
                const isSelfAssignable = selfRoles.some(sr => sr.role_id === role.id);

                if (!isSelfAssignable) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Not Self-Assignable', `The ${role.name} role is not self-assignable.`)], 
                        ephemeral: true 
                    });
                }

                // Check if bot can manage the role
                if (role.position >= interaction.guild.members.me.roles.highest.position) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'I cannot manage this role because it is higher than or equal to my highest role.')], 
                        ephemeral: true 
                    });
                }

                const hasRole = member.roles.cache.has(role.id);

                if (hasRole) {
                    // Remove role
                    await member.roles.remove(role, 'Self-role removal');
                    
                    const embed = EmbedManager.createSuccessEmbed('Role Removed', 
                        `Successfully removed the **${role.name}** role from yourself.`);
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    // Add role
                    await member.roles.add(role, 'Self-role assignment');
                    
                    const embed = EmbedManager.createSuccessEmbed('Role Added', 
                        `Successfully added the **${role.name}** role to yourself.`);
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }

            } catch (error) {
                client.logger.error('Error in role command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing your role.')], 
                    ephemeral: true 
                });
            }
        }
    }
];

module.exports = { commands };
