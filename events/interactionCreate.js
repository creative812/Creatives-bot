const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, RESTJSONErrorCodes, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        console.log('🔄 interactionCreate.js Handler fired for:', interaction.customId || interaction.commandName);

        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                await handleSlashCommand(interaction, client);
            }
            // Handle button interactions
            else if (interaction.isButton()) {
                await handleButtonInteraction(interaction, client);
            }
            // Handle select menu interactions
            else if (interaction.isStringSelectMenu()) {
                await handleSelectMenuInteraction(interaction, client);
            }
            // Handle modal submissions
            else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction, client);
            }
            // Handle autocomplete interactions
            else if (interaction.isAutocomplete()) {
                await handleAutocomplete(interaction, client);
            }
        } catch (error) {
            client.logger.error('Error in interactionCreate handler:', error);
        }
    }
};

// Handle slash command interactions with enhanced features
async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        client.logger.warn(`Unknown slash command: ${interaction.commandName}`);
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('Unknown Command', 'This command is not recognized.')],
            ephemeral: true
        });
    }

    // Check if command is disabled
    const disabledCommand = client.db.getDisabledCommand(interaction.guild.id, interaction.commandName);
    if (disabledCommand) {
        const disabledEmbed = EmbedManager.createErrorEmbed(
            '🔒 Command Disabled', 
            'This command has been disabled by server administrators.'
        )
        .addFields(
            { name: '📝 Reason', value: disabledCommand.reason || 'No reason provided', inline: false },
            { name: '👤 Disabled By', value: `<@${disabledCommand.disabled_by}>`, inline: true },
            { name: '⏰ Date', value: `<t:${Math.floor(new Date(disabledCommand.created_at).getTime() / 1000)}:F>`, inline: true }
        )
        .setColor('#FF6B6B');

        return safeReply(interaction, {
            embeds: [disabledEmbed],
            ephemeral: true
        });
    }

    // Enhanced permission checking with detailed messages
    if (command.permissions && !checkPermissions(interaction.member, command.permissions)) {
        const permissionEmbed = EmbedManager.createErrorEmbed(
            '🚫 Permission Denied', 
            `You need **${command.permissions.join(' or ')}** permissions to use this command.`
        )
        .addFields(
            { name: '💡 Your Permission Level', value: getPermissionLevel(interaction.member), inline: true },
            { name: '🔒 Required Level', value: command.permissions.join(' or '), inline: true }
        )
        .setColor('#FF6B6B');

        return safeReply(interaction, {
            embeds: [permissionEmbed],
            ephemeral: true
        });
    }

    // Rate limiting for slash commands
    if (!client.cooldowns) client.cooldowns = new Map();

    const cooldownKey = `${interaction.user.id}-${interaction.commandName}`;
    const cooldownTime = command.cooldown || 3000; // Default 3 second cooldown

    if (client.cooldowns.has(cooldownKey)) {
        const remainingTime = Math.ceil((client.cooldowns.get(cooldownKey) - Date.now()) / 1000);
        if (remainingTime > 0) {
            return safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed(
                    '⏰ Cooldown Active',
                    `Please wait ${remainingTime} second(s) before using this command again.`
                )],
                ephemeral: true
            });
        }
    }

    // Set cooldown
    client.cooldowns.set(cooldownKey, Date.now() + cooldownTime);
    setTimeout(() => client.cooldowns.delete(cooldownKey), cooldownTime);

    try {
        await command.execute(interaction, client);

        // Log command usage with enhanced details
        client.logger.logCommand(interaction.commandName, interaction.user, interaction.guild, {
            options: interaction.options?.data,
            channel: interaction.channel?.name
        });
    } catch (error) {
        client.logger.error(`Error executing slash command ${interaction.commandName}:`, error);

        const errorEmbed = EmbedManager.createErrorEmbed(
            '💥 Command Error', 
            'An unexpected error occurred while executing this command. The issue has been logged.'
        )
        .addFields(
            { name: '🔍 Error ID', value: `\`${Date.now()}-${interaction.commandName}\``, inline: true },
            { name: '💬 Support', value: 'Please contact server administrators if this persists.', inline: false }
        )
        .setColor('#FF0000');

        if (interaction.replied || interaction.deferred) {
            await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true }, true);
        } else {
            await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
        }
    }
}

// Handle autocomplete interactions
async function handleAutocomplete(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
        return;
    }

    try {
        await command.autocomplete(interaction);
    } catch (error) {
        client.logger.error(`Error in autocomplete for ${interaction.commandName}:`, error);
    }
}

// Handle button interactions with comprehensive coverage
async function handleButtonInteraction(interaction, client) {
    try {
        // Giveaway interactions
        if (interaction.customId === 'giveaway_enter') {
            await handleGiveawayEntry(interaction, client);
        } 
        // Ticket system interactions
        else if (interaction.customId === 'createticketbutton') {
            await handleCreateTicketButton(interaction, client);
        } else if (interaction.customId === 'closeticketbutton') {
            await handleCloseTicketButton(interaction, client);
        } else if (interaction.customId === 'claimticketbutton') {
            await handleClaimTicketButton(interaction, client);
        } 
        // Pagination interactions
        else if (interaction.customId.startsWith('leaderboard-')) {
            await handleLeaderboardPagination(interaction, client);
        } else if (interaction.customId.startsWith('user-profile-')) {
            await handleUserProfilePagination(interaction, client);
        }
        // Moderation interactions
        else if (interaction.customId.startsWith('warn-')) {
            await handleWarnConfirmation(interaction, client);
        } else if (interaction.customId.startsWith('mute-')) {
            await handleMuteConfirmation(interaction, client);
        }
        // Self-role interactions
        else if (interaction.customId.startsWith('role-')) {
            await handleRoleButton(interaction, client);
        }
        else {
            // Handle unknown button interactions with helpful message
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed(
                    '❓ Unknown Button', 
                    'This button interaction is not recognized or may have expired.'
                )],
                ephemeral: true
            });
        }
    } catch (error) {
        client.logger.error('Error handling button interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('💥 Button Error', 'An error occurred while processing your request.')],
                ephemeral: true
            });
        }
    }
}

// Handle select menu interactions
async function handleSelectMenuInteraction(interaction, client) {
    try {
        if (interaction.customId === 'selfrole_select') {
            await handleSelfRoleSelection(interaction, client);
        } else if (interaction.customId.startsWith('filter_')) {
            await handleFilterSelection(interaction, client);
        } else {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('❓ Unknown Menu', 'This select menu interaction is not recognized.')],
                ephemeral: true
            });
        }
    } catch (error) {
        client.logger.error('Error handling select menu interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('💥 Menu Error', 'An error occurred while processing your selection.')],
                ephemeral: true
            });
        }
    }
}

// Handle modal submissions
async function handleModalSubmit(interaction, client) {
    try {
        if (interaction.customId === 'closeticketmodal') {
            await handleTicketCloseModal(interaction, client);
        } else if (interaction.customId.startsWith('report-')) {
            await handleReportModal(interaction, client);
        } else if (interaction.customId.startsWith('suggestion-')) {
            await handleSuggestionModal(interaction, client);
        } else {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('❓ Unknown Modal', 'This modal submission is not recognized.')],
                ephemeral: true
            });
        }
    } catch (error) {
        client.logger.error('Error handling modal submit:', error);
        if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('💥 Modal Error', 'An error occurred while processing your request.')],
                ephemeral: true
            });
        }
    }
}

// Enhanced giveaway entry handling
async function handleGiveawayEntry(interaction, client) {
    const messageId = interaction.message.id;
    const giveaway = client.db.getGiveaway(messageId);

    if (!giveaway) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎁 Giveaway Not Found', 'This giveaway no longer exists.')],
            ephemeral: true
        });
    }

    if (giveaway.ended) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎁 Giveaway Ended', 'This giveaway has already ended.')],
            ephemeral: true
        });
    }

    // Check if giveaway has expired
    if (new Date(giveaway.ends_at) < new Date()) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎁 Giveaway Expired', 'This giveaway has expired.')],
            ephemeral: true
        });
    }

    const entries = client.db.getGiveawayEntries(giveaway.id);
    const hasEntered = entries.some(entry => entry.user_id === interaction.user.id);

    if (hasEntered) {
        // Remove entry
        client.db.removeGiveawayEntry(giveaway.id, interaction.user.id);
        const newEntryCount = entries.length - 1;

        const embed = EmbedManager.createGiveawayEmbed(giveaway, newEntryCount);
        await interaction.update({ embeds: [embed] });
        await safeReply(interaction, {
            embeds: [EmbedManager.createSuccessEmbed('✅ Left Giveaway', 'You have successfully left the giveaway.')],
            ephemeral: true
        }, true);
    } else {
        // Add entry
        client.db.addGiveawayEntry(giveaway.id, interaction.user.id);
        const newEntryCount = entries.length + 1;

        const embed = EmbedManager.createGiveawayEmbed(giveaway, newEntryCount);
        await interaction.update({ embeds: [embed] });
        await safeReply(interaction, {
            embeds: [EmbedManager.createSuccessEmbed('🎉 Entered Giveaway', 'You have successfully entered the giveaway!')],
            ephemeral: true
        }, true);
    }
}

// Enhanced ticket creation
async function handleCreateTicketButton(interaction, client) {
    const settings = client.db.getTicketSettings(interaction.guild.id);

    if (!settings) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎫 Ticket System Not Setup', 'The ticket system has not been configured for this server.')],
            ephemeral: true
        });
    }

    const category = interaction.guild.channels.cache.get(settings.category_id);
    if (!category) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎫 Category Not Found', 'The ticket category could not be found.')],
            ephemeral: true
        });
    }

    // Check if user already has an open ticket
    const existingTicket = client.db.getUserTicket(interaction.guild.id, interaction.user.id);
    if (existingTicket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎫 Ticket Already Exists', `You already have an open ticket: <#${existingTicket.channel_id}>`)],
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Create ticket channel with enhanced setup
        const ticketNumber = client.db.getNextTicketNumber(interaction.guild.id);
        const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}`;

        // Parse staff role IDs safely
        let staffRoleIds = [];
        if (settings.staff_role_ids) {
            try {
                staffRoleIds = JSON.parse(settings.staff_role_ids);
                if (!Array.isArray(staffRoleIds)) {
                    staffRoleIds = [settings.staff_role_ids];
                }
            } catch {
                staffRoleIds = [settings.staff_role_ids];
            }
        }

        // Enhanced permission overwrites
        const permissionOverwrites = [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks
                ]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.EmbedLinks
                ]
            }
        ];

        // Add staff role permissions
        staffRoleIds.forEach(roleId => {
            if (interaction.guild.roles.cache.has(roleId)) {
                permissionOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                });
            }
        });

        // Create the ticket channel
        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: permissionOverwrites,
            topic: `Ticket #${ticketNumber} - ${interaction.user.tag} (${interaction.user.id})`
        });

        // Save ticket to database
        const ticketId = client.db.createTicket(
            interaction.guild.id,
            interaction.user.id,
            ticketChannel.id,
            ticketNumber,
            'Created via ticket panel'
        );

        // Create enhanced ticket embed
        const ticketEmbed = EmbedManager.createEmbed(
            '🎫 Support Ticket Created',
            `Welcome ${interaction.user}! Thank you for creating a support ticket.`,
            null
        ).addFields(
            { name: '🆔 Ticket ID', value: `#${ticketNumber}`, inline: true },
            { name: '👤 Created By', value: interaction.user.tag, inline: true },
            { name: '⏰ Created At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '📋 Next Steps', value: 'Please describe your issue or question in detail. A staff member will assist you shortly.', inline: false },
            { name: '⚠️ Important', value: 'Do not share personal information like passwords or payment details.', inline: false }
        ).setColor('#00FF00').setTimestamp();

        const ticketRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('claimticketbutton')
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🙋'),
                new ButtonBuilder()
                    .setCustomId('closeticketbutton')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        // Create staff role mentions
        let staffMentions = '';
        if (staffRoleIds.length > 0) {
            staffMentions = staffRoleIds.map(roleId => `<@&${roleId}>`).join(' ');
        }

        await ticketChannel.send({
            content: `${interaction.user}${staffMentions ? ' ' + staffMentions : ''}`,
            embeds: [ticketEmbed],
            components: [ticketRow]
        });

        await interaction.editReply({
            embeds: [EmbedManager.createSuccessEmbed('🎫 Ticket Created', `Your ticket has been created: ${ticketChannel}`)]
        });

        // Enhanced logging
        if (settings.log_channel_id) {
            const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
            if (logChannel) {
                const logEmbed = EmbedManager.createEmbed(
                    '🎫 New Ticket Created',
                    'A new ticket has been created',
                    null
                ).addFields(
                    { name: '🆔 Ticket Number', value: `#${ticketNumber}`, inline: true },
                    { name: '👤 Created by', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                    { name: '📍 Channel', value: ticketChannel.toString(), inline: true },
                    { name: '📊 Method', value: 'Ticket Panel', inline: true }
                ).setColor('#00FF00').setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        }
    } catch (error) {
        client.logger.error('Error creating ticket from button:', error);
        await interaction.editReply({
            embeds: [EmbedManager.createErrorEmbed('💥 Error', 'Failed to create ticket channel. Please contact an administrator.')]
        });
    }
}

// Enhanced close ticket button handling
async function handleCloseTicketButton(interaction, client) {
    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('❌ Not a Ticket', 'This button can only be used in ticket channels.')],
            ephemeral: true
        });
    }

    const settings = client.db.getTicketSettings(interaction.guild.id);

    // Check permissions with enhanced validation
    let canClose = false;

    // Ticket owner can close
    if (ticket.user_id === interaction.user.id) {
        canClose = true;
    }

    // Staff members can close
    if (PermissionManager.isHelper(interaction.member)) {
        canClose = true;
    }

    // Check staff roles
    if (!canClose && settings?.staff_role_ids) {
        try {
            let staffRoleIds = JSON.parse(settings.staff_role_ids);
            if (!Array.isArray(staffRoleIds)) {
                staffRoleIds = [settings.staff_role_ids];
            }
            canClose = staffRoleIds.some(roleId => interaction.member.roles.cache.has(roleId));
        } catch {
            canClose = interaction.member.roles.cache.has(settings.staff_role_ids);
        }
    }

    if (!canClose) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🚫 Permission Denied', 'Only staff members or the ticket owner can close tickets.')],
            ephemeral: true
        });
    }

    // Show modal for close reason
    const modal = new ModalBuilder()
        .setCustomId('closeticketmodal')
        .setTitle('Close Ticket Confirmation');

    const reasonInput = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Reason for closing (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Enter a reason for closing this ticket...')
        .setMaxLength(500);

    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

// Enhanced claim ticket button handling
async function handleClaimTicketButton(interaction, client) {
    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('❌ Not a Ticket', 'This button can only be used in ticket channels.')],
            ephemeral: true
        });
    }

    if (!PermissionManager.isHelper(interaction.member)) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🚫 Permission Denied', 'Only staff members can claim tickets.')],
            ephemeral: true
        });
    }

    if (ticket.claimed_by) {
        const claimedUser = await client.users.fetch(ticket.claimed_by).catch(() => null);
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed(
                '⚠️ Already Claimed', 
                `This ticket is already claimed by ${claimedUser ? claimedUser.tag : 'Unknown User'}`
            )],
            ephemeral: true
        });
    }

    client.db.claimTicket(ticket.id, interaction.user.id);

    const embed = EmbedManager.createSuccessEmbed(
        '🙋 Ticket Claimed', 
        `${interaction.user} has claimed this ticket and will assist you.`
    ).addFields(
        { name: '⏰ Claimed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    );

    await safeReply(interaction, { embeds: [embed] });

    // Update channel name to show claimed status
    try {
        const currentName = interaction.channel.name;
        if (!currentName.includes('-claimed')) {
            await interaction.channel.setName(`${currentName}-claimed`);
        }
    } catch (error) {
        client.logger.warn('Could not update channel name for claimed ticket:', error.message);
    }
}

// Handle ticket close modal
async function handleTicketCloseModal(interaction, client) {
    const closeReason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';

    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('❌ Not a Ticket', 'This modal can only be used in ticket channels.')],
            ephemeral: true
        });
    }

    await interaction.deferReply();

    try {
        // Close the ticket in database
        client.db.closeTicket(ticket.id, interaction.user.id);

        const embed = EmbedManager.createEmbed(
            '🔒 Ticket Closed',
            `This ticket has been closed by ${interaction.user}`,
            null
        ).addFields(
            { name: '📝 Reason', value: closeReason, inline: false },
            { name: '⏰ Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '⚡ Channel Deletion', value: 'This channel will be deleted in 10 seconds', inline: true }
        ).setColor('#FF0000').setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Enhanced logging
        const settings = client.db.getTicketSettings(interaction.guild.id);
        if (settings?.log_channel_id) {
            const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
            if (logChannel) {
                const user = await client.users.fetch(ticket.user_id).catch(() => null);
                const duration = Math.round((Date.now() - new Date(ticket.created_at).getTime()) / 60000);

                const logEmbed = EmbedManager.createEmbed(
                    '🔒 Ticket Closed',
                    `Ticket #${ticket.ticket_number} has been closed`,
                    null
                ).addFields(
                    { name: '👤 Original Creator', value: user ? `${user.tag} (${user.id})` : 'Unknown User', inline: true },
                    { name: '🔒 Closed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                    { name: '📝 Reason', value: closeReason, inline: false },
                    { name: '⏱️ Duration', value: `${duration} minutes`, inline: true },
                    { name: '🙋 Claimed By', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed', inline: true }
                ).setColor('#FF0000').setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        }

        // Delete channel after delay
        setTimeout(async () => {
            try {
                if (interaction.channel && !interaction.channel.deleted) {
                    await interaction.channel.delete('Ticket closed');
                }
            } catch (error) {
                client.logger.error('Error deleting ticket channel:', error);
            }
        }, 10000);
    } catch (error) {
        client.logger.error('Error closing ticket from modal:', error);
        await interaction.editReply({
            embeds: [EmbedManager.createErrorEmbed('💥 Error', 'Failed to close ticket. Please try again.')]
        });
    }
}

// Enhanced self-role selection handling
async function handleSelfRoleSelection(interaction, client) {
    const selectedRoleIds = interaction.values;
    const member = interaction.member;

    // Get self-assignable roles
    const selfRoles = client.db.getSelfRoles(interaction.guild.id);
    const validRoleIds = selfRoles.map(role => role.role_id);

    const rolesToAdd = [];
    const rolesToRemove = [];
    const errors = [];

    // Process each valid role
    for (const roleId of validRoleIds) {
        const hasRole = member.roles.cache.has(roleId);
        const shouldHaveRole = selectedRoleIds.includes(roleId);

        if (shouldHaveRole && !hasRole) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                // Check if bot can assign this role
                if (role.position >= interaction.guild.members.me.roles.highest.position) {
                    errors.push(`Cannot assign **${role.name}** - role hierarchy issue`);
                } else {
                    rolesToAdd.push({ id: roleId, name: role.name });
                }
            }
        } else if (!shouldHaveRole && hasRole) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                rolesToRemove.push({ id: roleId, name: role.name });
            }
        }
    }

    try {
        // Apply role changes
        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd.map(r => r.id), 'Self-role assignment');
        }
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove.map(r => r.id), 'Self-role removal');
        }

        // Create response
        let description = '';
        if (rolesToAdd.length > 0) {
            description += `**✅ Added:** ${rolesToAdd.map(r => r.name).join(', ')}\n`;
        }
        if (rolesToRemove.length > 0) {
            description += `**❌ Removed:** ${rolesToRemove.map(r => r.name).join(', ')}\n`;
        }
        if (errors.length > 0) {
            description += `**⚠️ Errors:** ${errors.join(', ')}`;
        }
        if (!description) {
            description = 'No changes were made.';
        }

        const embed = EmbedManager.createSuccessEmbed('🎭 Roles Updated', description.trim());

        await safeReply(interaction, { embeds: [embed], ephemeral: true });
    } catch (error) {
        client.logger.error('Error updating self-roles:', error);
        await safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('💥 Error', 'Failed to update your roles. Please try again.')],
            ephemeral: true
        });
    }
}

// Placeholder handlers for future features
async function handleLeaderboardPagination(interaction, client) {
    await safeReply(interaction, { content: 'Leaderboard pagination coming soon!', ephemeral: true });
}

async function handleUserProfilePagination(interaction, client) {
    await safeReply(interaction, { content: 'User profile pagination coming soon!', ephemeral: true });
}

async function handleWarnConfirmation(interaction, client) {
    await safeReply(interaction, { content: 'Warning confirmation coming soon!', ephemeral: true });
}

async function handleMuteConfirmation(interaction, client) {
    await safeReply(interaction, { content: 'Mute confirmation coming soon!', ephemeral: true });
}

async function handleRoleButton(interaction, client) {
    await safeReply(interaction, { content: 'Role button handling coming soon!', ephemeral: true });
}

async function handleFilterSelection(interaction, client) {
    await safeReply(interaction, { content: 'Filter selection coming soon!', ephemeral: true });
}

async function handleReportModal(interaction, client) {
    await safeReply(interaction, { content: 'Report modal coming soon!', ephemeral: true });
}

async function handleSuggestionModal(interaction, client) {
    await safeReply(interaction, { content: 'Suggestion modal coming soon!', ephemeral: true });
}

// Safe reply function to handle interaction states
async function safeReply(interaction, options, isFollowUp = false) {
    try {
        if (interaction.replied || interaction.deferred) {
            if (interaction.isRepliable() && !isFollowUp) {
                return await interaction.followUp(options);
            } else if (isFollowUp) {
                return await interaction.followUp(options);
            }
        } else {
            return await interaction.reply(options);
        }
    } catch (error) {
        if (error.code !== RESTJSONErrorCodes.UnknownInteraction) {
            console.error('Error in safeReply:', error.code, error.message);
        }
        return null;
    }
}

// Helper functions
function checkPermissions(member, permissions) {
    return permissions.some(perm => {
        switch (perm) {
            case 'admin':
                return PermissionManager.isAdmin(member);
            case 'moderator':
                return PermissionManager.isModerator(member);
            case 'helper':
                return PermissionManager.isHelper(member);
            case 'user':
            default:
                return true;
        }
    });
}

function getPermissionLevel(member) {
    if (PermissionManager.isAdmin(member)) return 'Administrator';
    if (PermissionManager.isModerator(member)) return 'Moderator';
    if (PermissionManager.isHelper(member)) return 'Helper';
    return 'User';
}