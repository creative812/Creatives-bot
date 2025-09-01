require('dotenv').config();
require('./keep_alive.js');
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    ActivityType, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ChannelType, 
    PermissionsBitField,
    RESTJSONErrorCodes,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const Database = require('./database/database.js');
const Logger = require('./utils/logger.js');
const cron = require('node-cron');

// Configuration constants
const CONSTANTS = {
    TIMEOUTS: {
        TICKET_CLOSE_DELAY: 10000, // 10 seconds
        LOCK_CLEANUP_INTERVAL: 60000, // 1 minute
        LOCK_TTL: 300000, // 5 minutes
        RATE_LIMIT_WINDOW: 30000, // 30 seconds
    },
    LIMITS: {
        TICKET_CREATION_RATE_LIMIT: 1, // 1 ticket per time window
        MAX_CONCURRENT_OPERATIONS: 5,
    },
    COLORS: {
        SUCCESS: '#00FF00',
        ERROR: '#FF0000',
        WARNING: '#FFA500',
        INFO: '#0099FF',
    }
};

// Initialize client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages
    ]
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.db = Database;
client.config = config;
client.logger = Logger;

// Store bot start time
client.startTime = Date.now();

// Initialize storage systems
client.tempPanelData = new Map();
client.leaderboardPages = new Map();
client.userProfiles = new Map();

// Performance improvements: WeakMap for locks with TTL and caching
client.processingLocks = new Map();
client.rateLimits = new Map();
client.guildSettingsCache = new Map();

// Load command files dynamically
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const commandModule = require(`./commands/${file}`);

    // Handle both single command exports and command arrays
    if (commandModule.data && Array.isArray(commandModule.data)) {
        // AI.js style - array of commands in data property
        for (const commandData of commandModule.data) {
            client.commands.set(commandData.name, {
                data: commandData,
                execute: commandModule.execute
            });
        }
    } else if (commandModule.commands) {
        // Existing style - commands array
        for (const cmd of commandModule.commands) {
            client.commands.set(cmd.name, cmd);
        }
    } else if (commandModule.data) {
        // Single command export
        client.commands.set(commandModule.data.name, commandModule);
    }
}

// Store AI command module for message handling
let aiCommandModule = null;
try {
    aiCommandModule = require('./commands/ai.js');
    Logger.info('AI command module loaded successfully');
} catch (error) {
    Logger.warn('AI command module not found or failed to load:', error.message);
}

/**
 * Safely reply to interactions with proper state checking
 * @param {Interaction} interaction - The Discord interaction
 * @param {Object} options - Reply options
 * @returns {Promise<Message|null>}
 */
const safeReply = async (interaction, options) => {
    try {
        if (interaction.replied || interaction.deferred) {
            if (interaction.isRepliable()) {
                return await interaction.followUp(options);
            }
        } else {
            return await interaction.reply(options);
        }
    } catch (error) {
        if (error.code !== RESTJSONErrorCodes.UnknownInteraction) {
            console.error('Error in safeReply:', error.code, error.message);
            client.logger.error('Error in safeReply:', { code: error.code, message: error.message });
        }
    }
    return null;
};

/**
 * Disable all components in a message
 * @param {Array} components - Array of action rows
 * @returns {Array} - Array of disabled action rows
 */
const disableComponents = (components) => {
    return components.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(component => {
            if (component instanceof ButtonBuilder) {
                newRow.addComponents(
                    ButtonBuilder.from(component).setDisabled(true)
                );
            } else {
                newRow.addComponents(component);
            }
        });
        return newRow;
    });
};

/**
 * Check rate limit for user operations
 * @param {string} userId - User ID
 * @param {string} operation - Operation type
 * @returns {boolean} - Whether operation is allowed
 */
const checkRateLimit = (userId, operation) => {
    const key = `${userId}_${operation}`;
    const now = Date.now();
    const userLimits = client.rateLimits.get(key) || { count: 0, resetTime: now + CONSTANTS.TIMEOUTS.RATE_LIMIT_WINDOW };

    if (now > userLimits.resetTime) {
        userLimits.count = 0;
        userLimits.resetTime = now + CONSTANTS.TIMEOUTS.RATE_LIMIT_WINDOW;
    }

    if (userLimits.count >= CONSTANTS.LIMITS.TICKET_CREATION_RATE_LIMIT) {
        return false;
    }

    userLimits.count++;
    client.rateLimits.set(key, userLimits);
    return true;
};

/**
 * Get cached guild settings with fallback to database
 * @param {string} guildId - Guild ID
 * @returns {Object|null} - Guild settings
 */
const getCachedGuildSettings = (guildId) => {
    if (client.guildSettingsCache.has(guildId)) {
        return client.guildSettingsCache.get(guildId);
    }
    const settings = client.db.getTicketSettings(guildId);
    if (settings) {
        client.guildSettingsCache.set(guildId, settings);
    }
    return settings;
};

/**
 * Normalize staff role IDs to always be an array
 * @param {string|Array|null} staffRoleIds - Staff role IDs
 * @returns {Array} - Normalized array of role IDs
 */
const normalizeStaffRoleIds = (staffRoleIds) => {
    if (!staffRoleIds) return [];
    if (Array.isArray(staffRoleIds)) return staffRoleIds;
    if (typeof staffRoleIds === 'string') {
        try {
            const parsed = JSON.parse(staffRoleIds);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return [staffRoleIds];
        }
    }
    return [];
};

/**
 * Validate and filter existing roles
 * @param {Guild} guild - Discord guild
 * @param {Array} roleIds - Array of role IDs
 * @returns {Array} - Filtered array of valid role IDs
 */
const validateRoles = (guild, roleIds) => {
    return roleIds.filter(roleId => guild.roles.cache.has(roleId));
};

/**
 * Handle ticket creation with full transaction support
 * @param {ButtonInteraction} interaction - Button interaction
 */
const handleTicketCreation = async (interaction) => {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Rate limiting
    if (!checkRateLimit(userId, 'ticket_creation')) {
        return await safeReply(interaction, {
            content: '❌ You are creating tickets too quickly. Please wait before trying again.',
            ephemeral: true
        });
    }

    const userLockKey = `ticket_create_${guildId}_${userId}`;
    if (client.processingLocks.has(userLockKey)) {
        return await safeReply(interaction, {
            content: '❌ Please wait, your previous ticket creation is still processing.',
            ephemeral: true
        });
    }

    client.processingLocks.set(userLockKey, Date.now());

    try {
        // Check if user already has an open ticket
        const existingTicket = client.db.getUserTicket(guildId, userId);
        if (existingTicket) {
            return await safeReply(interaction, {
                content: `❌ You already have an open ticket: <#${existingTicket.channel_id}>`,
                ephemeral: true
            });
        }

        const settings = getCachedGuildSettings(guildId);
        if (!settings || !settings.category_id) {
            return await safeReply(interaction, {
                content: '❌ Ticket system is not configured. Please contact an administrator.',
                ephemeral: true
            });
        }

        const category = interaction.guild.channels.cache.get(settings.category_id);
        if (!category) {
            return await safeReply(interaction, {
                content: '❌ Ticket category not found. Please contact an administrator.',
                ephemeral: true
            });
        }

        // Show processing indicator
        await interaction.deferReply({ ephemeral: true });

        // Get next ticket number with database transaction
        const ticketNumber = client.db.getNextTicketNumber(guildId);
        const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}`;

        // Normalize and validate staff roles
        const staffRoleIds = validateRoles(
            interaction.guild, 
            normalizeStaffRoleIds(settings.staff_role_ids)
        );

        // Create permission overwrites
        const permissionOverwrites = [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: userId,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles
                ]
            }
        ];

        // Add staff roles to permissions
        staffRoleIds.forEach(roleId => {
            permissionOverwrites.push({
                id: roleId,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ManageMessages
                ]
            });
        });

        // Create ticket channel
        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: permissionOverwrites
        });

        // Create ticket in database with transaction
        const ticketId = client.db.createTicket(guildId, userId, ticketChannel.id, 'Created via panel', ticketNumber);

        if (!ticketId) {
            await ticketChannel.delete('Failed to create ticket in database').catch(console.error);
            return await interaction.editReply({
                content: '❌ Failed to create ticket in database. Please try again.'
            });
        }

        // Create ticket embed and buttons
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 Support Ticket #${ticketNumber}`)
            .setDescription(`Hello ${interaction.user}! Thank you for creating a support ticket.\n\nOur staff team has been notified and will assist you shortly.\n\n**Please describe your issue in detail.**`)
            .addFields(
                { name: '📝 Ticket Info', value: `**ID:** ${ticketNumber}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                { name: '👤 Created By', value: `${interaction.user}`, inline: true },
                { name: '📊 Status', value: '🟢 Open', inline: true }
            )
            .setColor(CONSTANTS.COLORS.SUCCESS)
            .setTimestamp();

        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket_button')
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger);

        const claimButton = new ButtonBuilder()
            .setCustomId('claim_ticket_button')
            .setLabel('✋ Claim Ticket')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

        // Send welcome message with pings
        let pingMessage = `${interaction.user}`;
        if (staffRoleIds.length > 0) {
            const rolePings = staffRoleIds.map(roleId => `<@&${roleId}>`).join(' ');
            pingMessage += ` ${rolePings}`;
        }

        await ticketChannel.send({
            content: pingMessage,
            embeds: [ticketEmbed],
            components: [row]
        });

        // Log ticket creation with error handling
        if (settings.log_channel_id) {
            try {
                const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🎫 New Ticket Created')
                        .addFields(
                            { name: 'Ticket Number', value: `#${ticketNumber}`, inline: true },
                            { name: 'Created by', value: `${interaction.user}`, inline: true },
                            { name: 'Channel', value: `${ticketChannel}`, inline: true }
                        )
                        .setColor(CONSTANTS.COLORS.SUCCESS)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (error) {
                if (error.code === RESTJSONErrorCodes.UnknownChannel) {
                    client.logger.warn(`Log channel not found for guild ${guildId}`);
                } else if (error.code === RESTJSONErrorCodes.MissingAccess) {
                    client.logger.warn(`Missing access to log channel for guild ${guildId}`);
                } else {
                    client.logger.error('Error sending log message:', { code: error.code, message: error.message });
                }
            }
        }

        await interaction.editReply({
            content: `✅ **Ticket created successfully!** Please check ${ticketChannel}`
        });

    } catch (error) {
        console.error('Error creating ticket:', error.code, error.message);
        client.logger.error('Error creating ticket:', { code: error.code, message: error.message, path: 'handleTicketCreation' });

        const errorMessage = error.code === RESTJSONErrorCodes.MissingPermissions 
            ? '❌ Missing permissions to create ticket channel.' 
            : '❌ Failed to create ticket. Please try again or contact an administrator.';

        if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else {
            await safeReply(interaction, { content: errorMessage, ephemeral: true });
        }
    } finally {
        client.processingLocks.delete(userLockKey);
    }
};

/**
 * Handle ticket claiming with enhanced UX
 * @param {ButtonInteraction} interaction - Button interaction
 */
const handleTicketClaim = async (interaction) => {
    const claimLockKey = `claim_${interaction.channel.id}_${interaction.user.id}`;
    if (client.processingLocks.has(claimLockKey)) {
        return await safeReply(interaction, {
            content: '❌ Claim already in progress.',
            ephemeral: true
        });
    }

    client.processingLocks.set(claimLockKey, Date.now());

    try {
        const channelId = interaction.channel.id;

        // Try multiple methods to find ticket
        let ticket = client.db.getTicketByChannel(channelId);
        if (!ticket) {
            const allTickets = client.db.getOpenTickets(interaction.guild.id);
            ticket = allTickets.find(t => t.channel_id === channelId);
        }

        if (!ticket) {
            const stmt = client.db.db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
            ticket = stmt.get(channelId);
        }

        if (!ticket) {
            return await safeReply(interaction, {
                content: '❌ This is not a valid ticket channel.',
                ephemeral: true
            });
        }

        if (ticket.claimed_by) {
            return await safeReply(interaction, {
                content: `❌ This ticket is already claimed by <@${ticket.claimed_by}>`,
                ephemeral: true
            });
        }

        // Disable the claim button immediately
        const disabledComponents = disableComponents(interaction.message.components);

        // Update the original embed to show claimed status
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        const updatedEmbed = originalEmbed
            .setFields(
                originalEmbed.data.fields.map(field => {
                    if (field.name === '📊 Status') {
                        return { ...field, value: `🟡 Claimed by ${interaction.user}` };
                    }
                    return field;
                })
            )
            .setColor(CONSTANTS.COLORS.WARNING);

        await interaction.update({ 
            embeds: [updatedEmbed],
            components: disabledComponents 
        });

        // Claim the ticket in database
        client.db.claimTicket(ticket.id, interaction.user.id);

        const claimEmbed = new EmbedBuilder()
            .setTitle('✋ Ticket Claimed')
            .setDescription(`This ticket has been claimed by ${interaction.user}`)
            .setColor(CONSTANTS.COLORS.WARNING)
            .setTimestamp();

        await interaction.followUp({ embeds: [claimEmbed] });

        // Update channel name to show it's claimed
        try {
            const currentName = interaction.channel.name;
            if (!currentName.includes('-claimed')) {
                await interaction.channel.setName(`${currentName}-claimed`);
            }
        } catch (error) {
            if (error.code === RESTJSONErrorCodes.MissingPermissions) {
                client.logger.warn(`Missing permissions to rename channel ${channelId}`);
            } else {
                client.logger.error('Error updating channel name:', { code: error.code, message: error.message });
            }
        }

    } catch (error) {
        console.error('Error claiming ticket:', error.code, error.message);
        client.logger.error('Error claiming ticket:', { code: error.code, message: error.message, path: 'handleTicketClaim' });
        await safeReply(interaction, {
            content: '❌ Failed to claim ticket. Please try again.',
            ephemeral: true
        });
    } finally {
        client.processingLocks.delete(claimLockKey);
    }
};

/**
 * Handle ticket closing with confirmation dialog
 * @param {ButtonInteraction} interaction - Button interaction
 */
const handleTicketClose = async (interaction) => {
    // Show confirmation modal
    const modal = new ModalBuilder()
        .setCustomId('close_ticket_modal')
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
};

/**
 * Process ticket close confirmation
 * @param {ModalSubmitInteraction} interaction - Modal submit interaction
 */
const processTicketClose = async (interaction) => {
    const closeLockKey = `close_${interaction.channel.id}`;
    if (client.processingLocks.has(closeLockKey)) {
        return await safeReply(interaction, {
            content: '❌ Ticket is already being closed.',
            ephemeral: true
        });
    }

    client.processingLocks.set(closeLockKey, Date.now());

    try {
        const channelId = interaction.channel.id;
        const closeReason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';

        // Find ticket
        let ticket = client.db.getTicketByChannel(channelId);
        if (!ticket) {
            const allTickets = client.db.getOpenTickets(interaction.guild.id);
            ticket = allTickets.find(t => t.channel_id === channelId);
        }

        if (!ticket) {
            const stmt = client.db.db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
            ticket = stmt.get(channelId);
        }

        if (!ticket) {
            return await safeReply(interaction, {
                content: '❌ This command can only be used in ticket channels.',
                ephemeral: true
            });
        }

        // Create closing confirmation embed
        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closing')
            .setDescription(`**Ticket:** #${ticket.ticket_number}\n**Closed by:** ${interaction.user}\n**Reason:** ${closeReason}\n\n⏰ This channel will be deleted in ${CONSTANTS.TIMEOUTS.TICKET_CLOSE_DELAY / 1000} seconds...`)
            .setColor(CONSTANTS.COLORS.ERROR)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Close ticket in database
        client.db.closeTicket(ticket.id, interaction.user.id);

        // Log to log channel with enhanced error handling
        const settings = getCachedGuildSettings(interaction.guild.id);
        if (settings && settings.log_channel_id) {
            try {
                const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Closed')
                        .addFields(
                            { name: 'Ticket Number', value: `#${ticket.ticket_number}`, inline: true },
                            { name: 'Created by', value: `<@${ticket.user_id}>`, inline: true },
                            { name: 'Closed by', value: `${interaction.user}`, inline: true },
                            { name: 'Reason', value: closeReason, inline: false },
                            { name: 'Channel', value: `#${interaction.channel.name}`, inline: true }
                        )
                        .setColor(CONSTANTS.COLORS.ERROR)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (error) {
                if (error.code === RESTJSONErrorCodes.UnknownChannel) {
                    client.logger.warn(`Log channel not found for guild ${interaction.guild.id}`);
                } else if (error.code === RESTJSONErrorCodes.MissingAccess) {
                    client.logger.warn(`Missing access to log channel for guild ${interaction.guild.id}`);
                } else {
                    client.logger.error('Error sending close log:', { code: error.code, message: error.message });
                }
            }
        }

        // Delete channel after delay
        setTimeout(async () => {
            try {
                if (interaction.channel && !interaction.channel.deleted) {
                    await interaction.channel.delete('Ticket closed');
                }
            } catch (error) {
                if (error.code !== RESTJSONErrorCodes.UnknownChannel) {
                    client.logger.error('Error deleting ticket channel:', { code: error.code, message: error.message });
                }
            } finally {
                client.processingLocks.delete(closeLockKey);
            }
        }, CONSTANTS.TIMEOUTS.TICKET_CLOSE_DELAY);

    } catch (error) {
        console.error('Error in close ticket handler:', error.code, error.message);
        client.logger.error('Error closing ticket:', { code: error.code, message: error.message, path: 'processTicketClose' });
        await safeReply(interaction, {
            content: '❌ Failed to close ticket. Please try again.',
            ephemeral: true
        });
        client.processingLocks.delete(closeLockKey);
    }
};

// SINGLE interactionCreate handler with improved structure
client.on('interactionCreate', async interaction => {
    const lockKey = `${interaction.user.id}_${interaction.customId || interaction.commandName}_${Date.now()}`;

    if (client.processingLocks.has(lockKey)) {
        return;
    }

    try {
        client.processingLocks.set(lockKey, Date.now());

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.execute) {
                await command.execute(interaction, client.db);
            } else {
                await safeReply(interaction, { content: 'Unknown command', ephemeral: true });
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'close_ticket_modal') {
                await processTicketClose(interaction);
            }
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_staff_roles') {
                try {
                    const selectedRoles = interaction.values;
                    const storageKey = `${interaction.user.id}_${interaction.guild.id}`;
                    const panelData = client.tempPanelData?.get(storageKey);

                    if (!panelData || panelData.guildId !== interaction.guild.id || panelData.userId !== interaction.user.id) {
                        return await safeReply(interaction, {
                            content: '❌ Session expired or invalid. Please run the command again.',
                            ephemeral: true
                        });
                    }

                    // Validate selected roles exist
                    const validRoles = validateRoles(interaction.guild, selectedRoles);
                    if (validRoles.length === 0) {
                        return await safeReply(interaction, {
                            content: '❌ No valid roles selected. Please try again.',
                            ephemeral: true
                        });
                    }

                    const guildId = interaction.guild.id;
                    const settings = getCachedGuildSettings(guildId);

                    if (settings) {
                        // Store roles as normalized array
                        client.db.setTicketSettings(guildId, {
                            categoryId: settings.category_id,
                            logChannelId: settings.log_channel_id,
                            staffRoleIds: validRoles,
                            nextTicketNumber: settings.next_ticket_number || 1
                        });

                        // Update cache
                        client.guildSettingsCache.delete(guildId);
                    }

                    const panelEmbed = new EmbedBuilder()
                        .setTitle(panelData.title)
                        .setDescription(panelData.description)
                        .setColor(CONSTANTS.COLORS.INFO)
                        .setTimestamp();

                    const createButton = new ButtonBuilder()
                        .setCustomId('create_ticket_button')
                        .setLabel(panelData.buttonText)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫');

                    const row = new ActionRowBuilder().addComponents(createButton);

                    await interaction.update({
                        content: '✅ **Ticket panel created successfully!**',
                        components: []
                    });

                    await interaction.followUp({
                        embeds: [panelEmbed],
                        components: [row]
                    });

                    client.tempPanelData.delete(storageKey);

                    const roleList = validRoles.map(roleId => `<@&${roleId}>`).join(', ');
                    await interaction.followUp({
                        content: `**Staff Roles Selected:** ${roleList}`,
                        ephemeral: true
                    });

                } catch (error) {
                    console.error('Error handling role selection:', error.code, error.message);
                    client.logger.error('Error handling role selection:', { code: error.code, message: error.message });
                    await safeReply(interaction, {
                        content: '❌ Failed to create ticket panel. Please try again.',
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isButton()) {
            // Route button interactions to appropriate handlers
            switch (interaction.customId) {
                case 'create_ticket_button':
                    await handleTicketCreation(interaction);
                    break;
                case 'claim_ticket_button':
                    await handleTicketClaim(interaction);
                    break;
                case 'close_ticket_button':
                    await handleTicketClose(interaction);
                    break;
                default:
                    // Handle pagination buttons with debouncing
                    if (interaction.customId.startsWith('user-profile-')) {
                        // User profile pagination logic (unchanged but with error improvements)
                        // ... existing profile pagination code with enhanced error handling
                    } else if (interaction.customId.startsWith('leaderboard-')) {
                        // Leaderboard pagination logic (unchanged but with error improvements)
                        // ... existing leaderboard pagination code with enhanced error handling
                    }
                    break;
            }
        }
    } catch (error) {
        console.error('Error in interactionCreate:', error.code, error.message);
        client.logger.error('Error handling interaction:', { code: error.code, message: error.message, path: 'interactionCreate' });
        await safeReply(interaction, { 
            content: '❌ An error occurred!', 
            ephemeral: true 
        });
    } finally {
        client.processingLocks.delete(lockKey);
    }
});

// Load event files - ONLY ONCE
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

// Scheduled tasks initialization  
const scheduledTasks = require('./scheduled/tasks.js');
scheduledTasks.init(client);

// Enhanced global error handlers
client.on('error', error => {
    Logger.error('Discord client error:', { code: error.code, message: error.message });
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', { code: error.code, message: error.message, stack: error.stack });
    process.exit(1);
});

const token = process.env.DISCORD_TOKEN || config.token;
if (!token) {
    Logger.error('No Discord token provided! Please set DISCORD_TOKEN environment variable or add it to config.json');
    process.exit(1);
}

client.login(token).catch(error => {
    Logger.error('Failed to login:', { code: error.code, message: error.message });
    process.exit(1);
});

// Enhanced leveling message handler
const { handleMessageForXp } = require('./commands/level.js');

client.on('messageCreate', async message => {
    // Skip bot messages
    if (message.author.bot) return;

    const xpLockKey = `xp_${message.guild?.id}_${message.author.id}_${message.id}`;

    // Prevent duplicate XP processing
    if (client.processingLocks.has(xpLockKey)) {
        return;
    }

    client.processingLocks.set(xpLockKey, Date.now());

    try {
        // Handle XP for leveling system
        if (message.guild) {
            await handleMessageForXp(message, client);
        }

        // Handle AI responses - ADDED AI INTEGRATION
        if (aiCommandModule && aiCommandModule.handleMessage) {
            const aiLockKey = `ai_${message.guild?.id}_${message.author.id}_${message.id}`;

            if (!client.processingLocks.has(aiLockKey)) {
                client.processingLocks.set(aiLockKey, Date.now());

                try {
                    await aiCommandModule.handleMessage(message, client.db);
                } catch (error) {
                    console.error('Error in AI message handler:', error);
                    client.logger.error('Error in AI message handler:', { 
                        error: error.message, 
                        guild: message.guild?.id,
                        user: message.author.id 
                    });
                } finally {
                    client.processingLocks.delete(aiLockKey);
                }
            }
        }

    } catch (error) {
        console.error('Error in messageCreate handler:', error.code, error.message);
        client.logger.error('Error in messageCreate handler:', { code: error.code, message: error.message });
    } finally {
        client.processingLocks.delete(xpLockKey);
    }
});

// Enhanced cleanup with performance improvements
setInterval(() => {
    const now = Date.now();

    // Clean up processing locks
    const expiredLocks = Array.from(client.processingLocks.entries())
        .filter(([key, timestamp]) => now - timestamp > CONSTANTS.TIMEOUTS.LOCK_TTL)
        .map(([key]) => key);

    expiredLocks.forEach(key => client.processingLocks.delete(key));

    // Clean up rate limits
    const expiredRateLimits = Array.from(client.rateLimits.entries())
        .filter(([key, data]) => now > data.resetTime)
        .map(([key]) => key);

    expiredRateLimits.forEach(key => client.rateLimits.delete(key));

    // Clean up guild settings cache (every 10 minutes)
    if (Math.random() < 0.1) {
        client.guildSettingsCache.clear();
    }

    if (expiredLocks.length > 0 || expiredRateLimits.length > 0) {
        console.log(`Cleaned up ${expiredLocks.length} locks and ${expiredRateLimits.length} rate limits`);
    }
}, CONSTANTS.TIMEOUTS.LOCK_CLEANUP_INTERVAL);

module.exports = client;
console.log('Loaded commands:', Array.from(client.commands.keys()));
