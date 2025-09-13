const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        console.log('🟢 [interactionCreate.js] Handler fired for:', interaction.customId || interaction.commandName);

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
    }
};

/**
 * Handle slash command interactions
 */
async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
        client.logger.warn(`Unknown slash command: ${interaction.commandName}`);
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Unknown Command', 'This command is not recognized.')], 
            ephemeral: true 
        });
    }

    // Check permissions
    if (command.permissions && !checkPermissions(interaction.member, command.permissions)) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Permission Denied', 
                `You need ${command.permissions.join(' or ')} permissions to use this command.`)], 
            ephemeral: true 
        });
    }

    try {
        await command.execute(interaction, client);

        // Log command usage
        client.logger.logCommand(interaction.commandName, interaction.user, interaction.guild);
    } catch (error) {
        client.logger.error(`Error executing slash command ${interaction.commandName}:`, error);

        const errorEmbed = EmbedManager.createErrorEmbed('Command Error', 
            'An error occurred while executing this command. Please try again later.');

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

/**
 * Handle button interactions
 */
async function handleButtonInteraction(interaction, client) {
    try {
        if (interaction.customId === 'giveaway_enter') {
            await handleGiveawayEntry(interaction, client);
        } else if (interaction.customId === 'create_ticket_button') {
            await handleCreateTicketButton(interaction, client);
        } else if (interaction.customId === 'close_ticket_button') {
            await handleCloseTicketButton(interaction, client);
        } else if (interaction.customId === 'claim_ticket_button') {
            await handleClaimTicketButton(interaction, client);
        }
        // Add more button handlers here as needed

    } catch (error) {
        client.logger.error('Error handling button interaction:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while processing your request.')], 
                ephemeral: true 
            });
        }
    }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenuInteraction(interaction, client) {
    try {
        if (interaction.customId === 'self_role_select') {
            await handleSelfRoleSelection(interaction, client);
        }
        // Add more select menu handlers here as needed

    } catch (error) {
        client.logger.error('Error handling select menu interaction:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while processing your selection.')], 
                ephemeral: true 
            });
        }
    }
}

/**
 * Handle modal submissions
 */
async function handleModalSubmit(interaction, client) {
    try {
        if (interaction.customId === 'close_ticket_modal') {
            // Handle ticket close modal
            const closeReason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';
            // Add your modal handling logic here
        }
    } catch (error) {
        client.logger.error('Error handling modal submit:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while processing your request.')], 
                ephemeral: true 
            });
        }
    }
}

/**
 * Handle giveaway entry button
 */
async function handleGiveawayEntry(interaction, client) {
    const messageId = interaction.message.id;
    const giveaway = client.db.getGiveaway(messageId);

    if (!giveaway) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Giveaway Not Found', 'This giveaway no longer exists.')], 
            ephemeral: true 
        });
    }

    if (giveaway.ended) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Giveaway Ended', 'This giveaway has already ended.')], 
            ephemeral: true 
        });
    }

    // Check if giveaway has expired
    if (new Date(giveaway.ends_at) <= new Date()) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Giveaway Expired', 'This giveaway has expired.')], 
            ephemeral: true 
        });
    }

    // Check if user already entered
    const entries = client.db.getGiveawayEntries(giveaway.id);
    const hasEntered = entries.some(entry => entry.user_id === interaction.user.id);

    if (hasEntered) {
        // Remove entry
        client.db.removeGiveawayEntry(giveaway.id, interaction.user.id);

        // Update embed with new entry count
        const newEntryCount = entries.length - 1;
        const embed = EmbedManager.createGiveawayEmbed(giveaway, newEntryCount);

        await interaction.update({ embeds: [embed] });

        await interaction.followUp({ 
            embeds: [EmbedManager.createSuccessEmbed('Left Giveaway', 'You have left the giveaway.')], 
            ephemeral: true 
        });
    } else {
        // Add entry
        client.db.addGiveawayEntry(giveaway.id, interaction.user.id);

        // Update embed with new entry count
        const newEntryCount = entries.length + 1;
        const embed = EmbedManager.createGiveawayEmbed(giveaway, newEntryCount);

        await interaction.update({ embeds: [embed] });

        await interaction.followUp({ 
            embeds: [EmbedManager.createSuccessEmbed('Entered Giveaway', 'You have successfully entered the giveaway!')], 
            ephemeral: true 
        });
    }
}

/**
 * Handle self-role selection menu
 */
async function handleSelfRoleSelection(interaction, client) {
    const selectedRoleIds = interaction.values;
    const member = interaction.member;

    // Get self-assignable roles
    const selfRoles = client.db.getSelfRoles(interaction.guild.id);
    const selfRoleIds = selfRoles.map(sr => sr.role_id);

    const added = [];
    const removed = [];
    const errors = [];

    for (const roleId of selectedRoleIds) {
        // Verify role is self-assignable
        if (!selfRoleIds.includes(roleId)) {
            errors.push(`Role is not self-assignable`);
            continue;
        }

        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            errors.push(`Role not found: ${roleId}`);
            continue;
        }

        // Check if bot can manage the role
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            errors.push(`Cannot manage role: ${role.name}`);
            continue;
        }

        try {
            if (member.roles.cache.has(roleId)) {
                // Remove role
                await member.roles.remove(role, 'Self-role removal');
                removed.push(role.name);
            } else {
                // Add role
                await member.roles.add(role, 'Self-role assignment');
                added.push(role.name);
            }
        } catch (error) {
            client.logger.error(`Error managing self-role ${role.name}:`, error);
            errors.push(`Failed to manage role: ${role.name}`);
        }
    }

    // Create response message
    let response = '';
    if (added.length > 0) {
        response += `✅ **Added roles:** ${added.join(', ')}\n`;
    }
    if (removed.length > 0) {
        response += `❌ **Removed roles:** ${removed.join(', ')}\n`;
    }
    if (errors.length > 0) {
        response += `⚠️ **Errors:** ${errors.join(', ')}\n`;
    }
    if (!response) {
        response = 'No changes were made.';
    }

    const embed = EmbedManager.createEmbed('Self-Role Update', response.trim());

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle create ticket button
 */
async function handleCreateTicketButton(interaction, client) {
    // Check if user already has an open ticket
    const existingTicket = client.db.getUserTicket(interaction.guild.id, interaction.user.id);
    if (existingTicket) {
        const channel = interaction.guild.channels.cache.get(existingTicket.channel_id);
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Ticket Already Exists', 
                `You already have an open ticket: ${channel ? channel.toString() : 'Channel not found'}`)], 
            ephemeral: true 
        });
    }

    const settings = client.db.getTicketSettings(interaction.guild.id);
    if (!settings) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Ticket System Not Setup', 
                'The ticket system has not been configured for this server.')], 
            ephemeral: true 
        });
    }

    const category = interaction.guild.channels.cache.get(settings.category_id);
    if (!category) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Category Not Found', 
                'The ticket category could not be found.')], 
            ephemeral: true 
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Create ticket channel
        const ticketNumber = client.db.getNextTicketNumber(interaction.guild.id);
        const channelName = `ticket-${ticketNumber}`;

        // Parse staff role IDs
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

        // Build permission overwrites
        const permissionOverwrites = [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: interaction.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
            },
            {
                id: client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages]
            }
        ];

        // Add staff role permissions
        staffRoleIds.forEach(roleId => {
            if (roleId && interaction.guild.roles.cache.has(roleId)) {
                permissionOverwrites.push({
                    id: roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages]
                });
            }
        });

        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: permissionOverwrites
        });

        // Save ticket to database
        const ticketId = client.db.createTicket(interaction.guild.id, interaction.user.id, ticketChannel.id, 'Created via button', ticketNumber);

        // Create ticket embed
        const ticketEmbed = EmbedManager.createEmbed('🎫 Support Ticket Created', 
            `**Ticket #${ticketNumber}**\n**Created by:** ${interaction.user}\n**Reason:** Created via ticket panel`)
            .addFields([
                { name: '📝 Next Steps', value: 'Please describe your issue or question.\nA staff member will assist you shortly.', inline: false },
                { name: '⚠️ Important', value: 'Do not share personal information in this channel.', inline: false }
            ])
            .setTimestamp();

        const ticketRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket_button')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId('claim_ticket_button')
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👋')
            );

        // Create staff role mentions
        let staffMentions = '';
        if (staffRoleIds.length > 0) {
            staffMentions = ' ' + staffRoleIds.map(roleId => `<@&${roleId}>`).join(' ');
        }

        await ticketChannel.send({ 
            content: `${interaction.user}${staffMentions}`,
            embeds: [ticketEmbed], 
            components: [ticketRow] 
        });

        await interaction.editReply({ 
            embeds: [EmbedManager.createSuccessEmbed('Ticket Created', 
                `Your ticket has been created: ${ticketChannel}`)] 
        });

        // Log ticket creation
        if (settings.log_channel_id) {
            const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
            if (logChannel) {
                const logEmbed = EmbedManager.createEmbed('🎫 Ticket Created', 
                    `**User:** ${interaction.user}\n**Channel:** ${ticketChannel}\n**Method:** Ticket Panel`)
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
        }
    } catch (error) {
        client.logger.error('Error creating ticket from button:', error);
        await interaction.editReply({ 
            embeds: [EmbedManager.createErrorEmbed('Error', 'Failed to create ticket channel.')] 
        });
    }
}

/**
 * Handle close ticket button
 */
async function handleCloseTicketButton(interaction, client) {
    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Not a Ticket', 'This button can only be used in ticket channels.')], 
            ephemeral: true 
        });
    }

    const settings = client.db.getTicketSettings(interaction.guild.id);
    
    // Check if user is staff (helper permissions or has any of the staff roles)
    let isStaff = PermissionManager.isHelper(interaction.member);
    if (!isStaff && settings?.staff_role_ids) {
        try {
            let staffRoleIds = JSON.parse(settings.staff_role_ids);
            if (!Array.isArray(staffRoleIds)) {
                staffRoleIds = [settings.staff_role_ids];
            }
            isStaff = staffRoleIds.some(roleId => interaction.member.roles.cache.has(roleId));
        } catch {
            isStaff = interaction.member.roles.cache.has(settings.staff_role_ids);
        }
    }
    
    const isTicketOwner = ticket.user_id === interaction.user.id;

    if (!isStaff && !isTicketOwner) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'Only staff members or the ticket owner can close tickets.')], 
            ephemeral: true 
        });
    }

    await interaction.deferReply();

    try {
        // Close ticket in database
        client.db.closeTicket(ticket.id, interaction.user.id);

        // Send closure notification
        const closeEmbed = EmbedManager.createEmbed('🔒 Ticket Closed', 
            `This ticket has been closed by ${interaction.user}.\nChannel will be deleted in 10 seconds.`)
            .setTimestamp();

        await interaction.editReply({ embeds: [closeEmbed] });

        // Log ticket closure
        if (settings?.log_channel_id) {
            const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
            if (logChannel) {
                const user = await client.users.fetch(ticket.user_id);
                const logEmbed = EmbedManager.createEmbed('🔒 Ticket Closed', 
                    `**Ticket #${ticket.ticket_number}**\n**User:** ${user}\n**Closed by:** ${interaction.user}\n**Reason:** ${ticket.reason}`)
                    .addFields([
                        { name: 'Duration', value: `${Math.round((Date.now() - new Date(ticket.created_at)) / (1000 * 60))} minutes`, inline: true },
                        { name: 'Claimed by', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'No one', inline: true }
                    ])
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
        }

        // Delete channel after delay
        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (error) {
                client.logger.error('Error deleting ticket channel:', error);
            }
        }, 10000);
    } catch (error) {
        client.logger.error('Error closing ticket from button:', error);
        await interaction.editReply({ 
            embeds: [EmbedManager.createErrorEmbed('Error', 'Failed to close ticket.')] 
        });
    }
}

/**
 * Handle claim ticket button
 */
async function handleClaimTicketButton(interaction, client) {
    const ticket = client.db.getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Not a Ticket', 'This button can only be used in ticket channels.')], 
            ephemeral: true 
        });
    }

    if (!PermissionManager.isHelper(interaction.member)) {
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'Only staff members can claim tickets.')], 
            ephemeral: true 
        });
    }

    if (ticket.claimed_by) {
        const claimedUser = await client.users.fetch(ticket.claimed_by).catch(() => null);
        return interaction.reply({ 
            embeds: [EmbedManager.createErrorEmbed('Already Claimed', 
                `This ticket is already claimed by ${claimedUser ? claimedUser.tag : 'Unknown'}`)], 
            ephemeral: true 
        });
    }

    client.db.claimTicket(ticket.id, interaction.user.id);

    const embed = EmbedManager.createSuccessEmbed('Ticket Claimed', 
        `${interaction.user} has claimed this ticket and will assist you.`);

    await interaction.reply({ embeds: [embed] });
}

/**
 * Check permissions for interactions
 */
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
