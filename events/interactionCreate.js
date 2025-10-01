const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField, 
    RESTJSONErrorCodes, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');

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
            client.logger?.error('Error in interactionCreate handler:', error);
        }
    }
};

// Handle slash command interactions with enhanced features
async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        client.logger?.warn(`Unknown slash command: ${interaction.commandName}`);
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('Unknown Command', 'This command is not recognized.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if command is disabled
    const disabledCommand = client.db.getDisabledCommand?.(interaction.guild.id, interaction.commandName);
    if (disabledCommand) {
        const disabledEmbed = EmbedManager.createErrorEmbed(
            '🔒 Command Disabled', 
            'This command has been disabled by server administrators.'
        )
        .addFields(
            { name: '📝 Reason', value: disabledCommand.reason || 'No reason provided', inline: false },
            { name: '👤 Disabled By', value: `<@${disabledCommand.disabledby}>`, inline: true },
            { name: '⏰ Date', value: `<t:${Math.floor(new Date(disabledCommand.createdat).getTime() / 1000)}:F>`, inline: true }
        )
        .setColor('#FF6B6B');

        return safeReply(interaction, {
            embeds: [disabledEmbed],
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Set cooldown
    client.cooldowns.set(cooldownKey, Date.now() + cooldownTime);
    setTimeout(() => client.cooldowns.delete(cooldownKey), cooldownTime);

    try {
        await command.execute(interaction, client);

        // Log command usage with enhanced details
        if (client.logger?.logCommand) {
            client.logger.logCommand(interaction.commandName, interaction.user, interaction.guild, {
                options: interaction.options?.data,
                channel: interaction.channel?.name
            });
        }
    } catch (error) {
        client.logger?.error(`Error executing slash command ${interaction.commandName}:`, error);

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
            await safeReply(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral }, true);
        } else {
            await safeReply(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
}

// Handle autocomplete interactions
async function handleAutocomplete(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command?.autocomplete) {
        return;
    }

    try {
        await command.autocomplete(interaction);
    } catch (error) {
        client.logger?.error(`Error in autocomplete for ${interaction.commandName}:`, error);
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
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        client.logger?.error('Error handling button interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('💥 Button Error', 'An error occurred while processing your request.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

// Handle select menu interactions
async function handleSelectMenuInteraction(interaction, client) {
    try {
        if (interaction.customId === 'selfrole_select') {
            await handleSelfRoleSelection(interaction, client);
        } else if (interaction.customId === 'ticket_staff_roles') {
            await handleTicketStaffRoleSelection(interaction, client);
        } else if (interaction.customId.startsWith('filter_')) {
            await handleFilterSelection(interaction, client);
        } else {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('❓ Unknown Menu', 'This select menu interaction is not recognized.')],
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        client.logger?.error('Error handling select menu interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('💥 Menu Error', 'An error occurred while processing your selection.')],
                flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        client.logger?.error('Error handling modal submit:', error);
        if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
                embeds: [EmbedManager.createErrorEmbed('💥 Modal Error', 'An error occurred while processing your request.')],
                flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
    }

    if (giveaway.ended) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎁 Giveaway Ended', 'This giveaway has already ended.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if giveaway has expired
    if (new Date(giveaway.endsat) < new Date()) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎁 Giveaway Expired', 'This giveaway has expired.')],
            flags: MessageFlags.Ephemeral
        });
    }

    const entries = client.db.getGiveawayEntries(giveaway.id);
    const hasEntered = entries.some(entry => entry.userid === interaction.user.id);

    if (hasEntered) {
        // Remove entry
        client.db.removeGiveawayEntry(giveaway.id, interaction.user.id);
        const newEntryCount = entries.length - 1;

        const embed = createGiveawayEmbed(giveaway, newEntryCount);
        await interaction.update({ embeds: [embed] });
        await safeReply(interaction, {
            embeds: [EmbedManager.createSuccessEmbed('✅ Left Giveaway', 'You have successfully left the giveaway.')],
            flags: MessageFlags.Ephemeral
        }, true);
    } else {
        // Add entry
        client.db.addGiveawayEntry(giveaway.id, interaction.user.id);
        const newEntryCount = entries.length + 1;

        const embed = createGiveawayEmbed(giveaway, newEntryCount);
        await interaction.update({ embeds: [embed] });
        await safeReply(interaction, {
            embeds: [EmbedManager.createSuccessEmbed('🎉 Entered Giveaway', 'You have successfully entered the giveaway!')],
            flags: MessageFlags.Ephemeral
        }, true);
    }
}

// TICKET SYSTEM - Enhanced ticket creation with FIXED PERMISSIONS
async function handleCreateTicketButton(interaction, client) {
    const settings = client.db.getTicketSettings(interaction.guild.id);

    if (!settings) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎫 Ticket System Not Setup', 'The ticket system has not been configured for this server.')],
            flags: MessageFlags.Ephemeral
        });
    }

    const category = interaction.guild.channels.cache.get(settings.category_id);
    if (!category) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎫 Category Not Found', 'The ticket category could not be found. Please run /ticket-setup again.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // ADDED: Check bot permissions BEFORE attempting to create channel
    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed(
                '🚫 Bot Missing Permissions', 
                'I need **Manage Channels** permission to create ticket channels. Please contact an administrator.'
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    // Check bot permissions in the category
    const categoryPermissions = category.permissionsFor(botMember);
    if (!categoryPermissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed(
                '🚫 Bot Missing Category Permissions', 
                'I need **Manage Channels** permission in the ticket category. Please contact an administrator.'
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if user already has an open ticket
    const existingTicket = client.db.getUserTicket?.(interaction.guild.id, interaction.user.id);
    if (existingTicket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🎫 Ticket Already Exists', `You already have an open ticket: <#${existingTicket.channel_id}>`)],
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Get next ticket number
        const ticketNumber = client.db.getNextTicketNumber ? 
            client.db.getNextTicketNumber(interaction.guild.id) :
            (settings.next_ticket_number || 1);

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
                    PermissionsBitField.Flags.EmbedLinks,
                    PermissionsBitField.Flags.ManageChannels // ADDED: Bot needs this to manage the ticket
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
            'Created via ticket panel',
            ticketNumber
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
        client.logger?.error('Error creating ticket from button:', error);

        let errorMessage = 'Failed to create ticket channel. Please contact an administrator.';
        if (error.code === 50013) {
            errorMessage = 'I don\'t have permission to create channels. Please ensure I have **Manage Channels** permission in this server and the ticket category.';
        }

        await interaction.editReply({
            embeds: [EmbedManager.createErrorEmbed('💥 Error', errorMessage)]
        });
    }
}

// Enhanced close ticket button handling
async function handleCloseTicketButton(interaction, client) {
    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('❌ Not a Ticket', 'This button can only be used in ticket channels.')],
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
    }

    if (!PermissionManager.isHelper(interaction.member)) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('🚫 Permission Denied', 'Only staff members can claim tickets.')],
            flags: MessageFlags.Ephemeral
        });
    }

    if (ticket.claimed_by) {
        const claimedUser = await client.users.fetch(ticket.claimed_by).catch(() => null);
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed(
                '⚠️ Already Claimed', 
                `This ticket is already claimed by ${claimedUser ? claimedUser.tag : 'Unknown User'}`
            )],
            flags: MessageFlags.Ephemeral
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
        client.logger?.warn('Could not update channel name for claimed ticket:', error.message);
    }
}

// Handle ticket close modal
async function handleTicketCloseModal(interaction, client) {
    const closeReason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';

    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('❌ Not a Ticket', 'This modal can only be used in ticket channels.')],
            flags: MessageFlags.Ephemeral
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
                client.logger?.error('Error deleting ticket channel:', error);
            }
        }, 10000);
    } catch (error) {
        client.logger?.error('Error closing ticket from modal:', error);
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
    const validRoleIds = selfRoles.map(role => role.roleid);

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

        await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        client.logger?.error('Error updating self-roles:', error);
        await safeReply(interaction, {
            embeds: [EmbedManager.createErrorEmbed('💥 Error', 'Failed to update your roles. Please try again.')],
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle ticket staff role selection (for ticket panel setup)
async function handleTicketStaffRoleSelection(interaction, client) {
    if (!client.tempPanelData) client.tempPanelData = new Map();

    const storageKey = `${interaction.user.id}_${interaction.guild.id}`;
    const panelData = client.tempPanelData.get(storageKey);

    if (!panelData) {
        return safeReply(interaction, {
            content: '❌ Panel setup session expired. Please run the command again.',
            flags: MessageFlags.Ephemeral
        });
    }

    const selectedRoleIds = interaction.values;

    // Get current settings
    const currentSettings = client.db.getTicketSettings(panelData.guildId);

    // Update settings with camelCase for database helper
    client.db.setTicketSettings(panelData.guildId, {
        categoryId: currentSettings?.category_id,
        logChannelId: currentSettings?.log_channel_id,
        staffRoleIds: selectedRoleIds,  // Pass as array, helper will JSON.stringify
        nextTicketNumber: currentSettings?.next_ticket_number || 1
    });

    // Create the ticket panel
    const embed = EmbedManager.createEmbed(
        panelData.title,
        panelData.description,
        null
    ).setColor('#00FF00');

    const button = new ButtonBuilder()
        .setCustomId('createticketbutton')
        .setLabel(panelData.buttonText)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫');

    const row = new ActionRowBuilder().addComponents(button);

    // First update the interaction to confirm
    await interaction.update({
        content: '✅ **Step 2 Complete!** Ticket panel created below.',
        components: []
    });

    // Then send the PUBLIC ticket panel
    await interaction.followUp({
        embeds: [embed],
        components: [row]
        // No flags = public message
    });

    // Clean up temp data
    client.tempPanelData.delete(storageKey);
}

// Helper function to create giveaway embed
function createGiveawayEmbed(giveaway, entryCount) {
    const embed = EmbedManager.createEmbed(
        `🎉 ${giveaway.title}`,
        giveaway.description || 'No description provided',
        null
    ).addFields(
        { name: '🎁 Prize', value: giveaway.title, inline: true },
        { name: '👥 Entries', value: entryCount.toString(), inline: true },
        { name: '🏆 Winners', value: giveaway.winnercount.toString(), inline: true },
        { name: '⏰ Ends', value: `<t:${Math.floor(new Date(giveaway.endsat).getTime() / 1000)}:F>`, inline: false }
    ).setColor('#FF69B4').setTimestamp();

    return embed;
}

// Placeholder handlers for future features (PRESERVED)
async function handleLeaderboardPagination(interaction, client) {
    await safeReply(interaction, { content: 'Leaderboard pagination coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleUserProfilePagination(interaction, client) {
    await safeReply(interaction, { content: 'User profile pagination coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleWarnConfirmation(interaction, client) {
    await safeReply(interaction, { content: 'Warning confirmation coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleMuteConfirmation(interaction, client) {
    await safeReply(interaction, { content: 'Mute confirmation coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleRoleButton(interaction, client) {
    await safeReply(interaction, { content: 'Role button handling coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleFilterSelection(interaction, client) {
    await safeReply(interaction, { content: 'Filter selection coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleReportModal(interaction, client) {
    await safeReply(interaction, { content: 'Report modal coming soon!', flags: MessageFlags.Ephemeral });
}

async function handleSuggestionModal(interaction, client) {
    await safeReply(interaction, { content: 'Suggestion modal coming soon!', flags: MessageFlags.Ephemeral });
}

// FIXED: Safe reply function with proper flags
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
