require('dotenv').config();

require('./keep_alive.js');

const { Client, GatewayIntentBits, Collection, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const Database = require('./database/database.js');
const Logger = require('./utils/logger.js');
const cron = require('node-cron');

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

// Initialize temporary storage for ticket panel data
client.tempPanelData = new Map();

// Load command files dynamically
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const commandModule = require(`./commands/${file}`);
    if (commandModule.commands) {
        for (const cmd of commandModule.commands) {
            client.commands.set(cmd.name, cmd);
        }
    }
}

// Store leaderboard pagination states: messageId => { pages, pageIndex, userId, title }
client.leaderboardPages = new Map();

// SINGLE interactionCreate handler - handles all interactions
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.execute) {
                await command.execute(interaction, client);
            } else {
                await interaction.reply({ content: 'Unknown command', ephemeral: true });
            }
        } else if (interaction.isStringSelectMenu()) {
            // Handle staff role selection for ticket panel
            if (interaction.customId === 'ticket_staff_roles') {
                try {
                    const selectedRoles = interaction.values;
                    const storageKey = `${interaction.user.id}_${interaction.guild.id}`;
                    const panelData = client.tempPanelData?.get(storageKey);

                    if (!panelData) {
                        return await interaction.reply({
                            content: '❌ Session expired. Please run the command again.',
                            ephemeral: true
                        });
                    }

                    // Verify that the guild matches
                    if (panelData.guildId !== interaction.guild.id || panelData.userId !== interaction.user.id) {
                        return await interaction.reply({
                            content: '❌ Invalid session. Please run the command again.',
                            ephemeral: true
                        });
                    }

                    // Update ticket settings with selected roles
                    const guildId = interaction.guild.id;
                    const settings = client.db.getTicketSettings(guildId);

                    if (settings) {
                        client.db.setTicketSettings(guildId, {
                            categoryId: settings.category_id,
                            logChannelId: settings.log_channel_id,
                            staffRoleIds: selectedRoles,
                            nextTicketNumber: settings.next_ticket_number || 1
                        });
                    }

                    // Create the ticket panel
                    const panelEmbed = new EmbedBuilder()
                        .setTitle(panelData.title)
                        .setDescription(panelData.description)
                        .setColor('#0099FF')
                        .setTimestamp();

                    const createButton = new ButtonBuilder()
                        .setCustomId('create_ticket_button')
                        .setLabel(panelData.buttonText)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫');

                    const row = new ActionRowBuilder().addComponents(createButton);

                    // Update the original message to remove the select menu
                    await interaction.update({
                        content: '✅ **Ticket panel created successfully!**',
                        components: []
                    });

                    // Send the panel as a new message
                    await interaction.followUp({
                        embeds: [panelEmbed],
                        components: [row]
                    });

                    // Clean up temp data
                    client.tempPanelData.delete(storageKey);

                    // Send confirmation message
                    const roleList = selectedRoles.map(roleId => `<@&${roleId}>`).join(', ');
                    await interaction.followUp({
                        content: `**Staff Roles Selected:** ${roleList}`,
                        ephemeral: true
                    });

                } catch (error) {
                    console.error('Error handling role selection:', error);
                    client.logger.error('Error handling role selection:', error);

                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Failed to create ticket panel. Please try again.',
                            ephemeral: true
                        });
                    }
                }
            }
        } else if (interaction.isButton()) {
            // Handle ticket creation button
            if (interaction.customId === 'create_ticket_button') {
                try {
                    const guildId = interaction.guild.id;
                    const userId = interaction.user.id;

                    // Check if user already has an open ticket
                    const existingTicket = client.db.getUserTicket(guildId, userId);
                    if (existingTicket) {
                        return await interaction.reply({
                            content: `❌ You already have an open ticket: <#${existingTicket.channel_id}>`,
                            ephemeral: true
                        });
                    }

                    const settings = client.db.getTicketSettings(guildId);
                    if (!settings || !settings.category_id) {
                        return await interaction.reply({
                            content: '❌ Ticket system is not configured. Please contact an administrator.',
                            ephemeral: true
                        });
                    }

                    const category = interaction.guild.channels.cache.get(settings.category_id);
                    if (!category) {
                        return await interaction.reply({
                            content: '❌ Ticket category not found. Please contact an administrator.',
                            ephemeral: true
                        });
                    }

                    // Get next ticket number
                    const ticketNumber = client.db.getNextTicketNumber(guildId);
                    const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}`;

                    // Parse staff role IDs safely
                    let staffRoleIds = [];
                    try {
                        if (settings.staff_role_ids) {
                            if (typeof settings.staff_role_ids === 'string') {
                                staffRoleIds = JSON.parse(settings.staff_role_ids);
                            } else if (Array.isArray(settings.staff_role_ids)) {
                                staffRoleIds = settings.staff_role_ids;
                            }
                        }
                    } catch (error) {
                        console.error('Error parsing staff role IDs:', error);
                        staffRoleIds = [];
                    }

                    // Create permission overwrites
                    const permissionOverwrites = [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: userId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        }
                    ];

                    // Add staff roles to permissions
                    for (const roleId of staffRoleIds) {
                        if (roleId && interaction.guild.roles.cache.has(roleId)) {
                            permissionOverwrites.push({
                                id: roleId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.AttachFiles,
                                    PermissionFlagsBits.ManageMessages
                                ]
                            });
                        }
                    }

                    // Create ticket channel
                    const ticketChannel = await interaction.guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        parent: category.id,
                        permissionOverwrites: permissionOverwrites
                    });

                    // Create ticket in database with CORRECT parameter order
                    const ticketId = client.db.createTicket(guildId, userId, ticketChannel.id, 'Created via panel', ticketNumber);

                    // Create ticket embed and buttons
                    const ticketEmbed = new EmbedBuilder()
                        .setTitle(`🎫 Support Ticket #${ticketNumber}`)
                        .setDescription(`Hello ${interaction.user}! Thank you for creating a support ticket.\n\nOur staff team has been notified and will assist you shortly.\n\n**Please describe your issue in detail.**`)
                        .addFields(
                            { name: '📝 Ticket Info', value: `**ID:** ${ticketNumber}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                            { name: '👤 Created By', value: `${interaction.user}`, inline: true }
                        )
                        .setColor('#00FF00')
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

                    // Add staff role pings if they exist
                    if (staffRoleIds.length > 0) {
                        const validRolePings = staffRoleIds
                            .filter(roleId => interaction.guild.roles.cache.has(roleId))
                            .map(roleId => `<@&${roleId}>`)
                            .join(' ');

                        if (validRolePings) {
                            pingMessage += ` ${validRolePings}`;
                        }
                    }

                    await ticketChannel.send({
                        content: pingMessage,
                        embeds: [ticketEmbed],
                        components: [row]
                    });

                    // Log ticket creation
                    if (settings.log_channel_id) {
                        const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('🎫 New Ticket Created')
                                .addFields(
                                    { name: 'Ticket Number', value: `#${ticketNumber}`, inline: true },
                                    { name: 'Created by', value: `${interaction.user}`, inline: true },
                                    { name: 'Channel', value: `${ticketChannel}`, inline: true }
                                )
                                .setColor('#00FF00')
                                .setTimestamp();

                            await logChannel.send({ embeds: [logEmbed] });
                        }
                    }

                    await interaction.reply({
                        content: `✅ **Ticket created successfully!** Please check ${ticketChannel}`,
                        ephemeral: true
                    });

                } catch (error) {
                    console.error('Error creating ticket:', error);
                    client.logger.error('Error creating ticket:', error);

                    if (!interaction.replied) {
                        await interaction.reply({
                            content: '❌ Failed to create ticket. Please try again or contact an administrator.',
                            ephemeral: true
                        });
                    }
                }
            }

            // Handle ticket claim button
            if (interaction.customId === 'claim_ticket_button') {
                try {
                    const channelId = interaction.channel.id;

                    // IMPROVED: Try multiple methods to find ticket
                    let ticket = null;

                    // Method 1: Direct lookup
                    ticket = client.db.getTicketByChannel(channelId);

                    // Method 2: Search all open tickets if direct lookup fails
                    if (!ticket) {
                        const allTickets = client.db.getOpenTickets(interaction.guild.id);
                        ticket = allTickets.find(t => t.channel_id === channelId);
                    }

                    // Method 3: Search by any status if still not found
                    if (!ticket) {
                        const stmt = client.db.db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
                        ticket = stmt.get(channelId);
                    }

                    if (!ticket) {
                        return await interaction.reply({
                            content: '❌ This is not a valid ticket channel.',
                            ephemeral: true
                        });
                    }

                    if (ticket.claimed_by) {
                        return await interaction.reply({
                            content: `❌ This ticket is already claimed by <@${ticket.claimed_by}>`,
                            ephemeral: true
                        });
                    }

                    // Claim the ticket
                    client.db.claimTicket(ticket.id, interaction.user.id);

                    const embed = new EmbedBuilder()
                        .setTitle('✋ Ticket Claimed')
                        .setDescription(`This ticket has been claimed by ${interaction.user}`)
                        .setColor('#FFA500')
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed] });

                    // Update channel name to show it's claimed
                    try {
                        const currentName = interaction.channel.name;
                        if (!currentName.includes('-claimed')) {
                            await interaction.channel.setName(`${currentName}-claimed`);
                        }
                    } catch (error) {
                        client.logger.error('Error updating channel name:', error);
                    }

                } catch (error) {
                    console.error('Error claiming ticket:', error);
                    client.logger.error('Error claiming ticket:', error);

                    if (!interaction.replied) {
                        await interaction.reply({
                            content: '❌ Failed to claim ticket. Please try again.',
                            ephemeral: true
                        });
                    }
                }
            }

            // FIXED: Handle ticket close button - COMPLETE SOLUTION
            if (interaction.customId === 'close_ticket_button') {
                try {
                    const channelId = interaction.channel.id;

                    // IMPROVED: Try multiple methods to find ticket
                    let ticket = null;

                    // Method 1: Direct lookup by channel and status
                    ticket = client.db.getTicketByChannel(channelId);

                    // Method 2: Search all open tickets if direct lookup fails
                    if (!ticket) {
                        const allTickets = client.db.getOpenTickets(interaction.guild.id);
                        ticket = allTickets.find(t => t.channel_id === channelId);
                    }

                    // Method 3: Search by any status if still not found
                    if (!ticket) {
                        const stmt = client.db.db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
                        ticket = stmt.get(channelId);
                    }

                    if (!ticket) {
                        return await interaction.reply({
                            content: '❌ This command can only be used in ticket channels.',
                            ephemeral: true
                        });
                    }

                    // Create closing confirmation embed
                    const embed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Closing')
                        .setDescription(`**Ticket:** #${ticket.ticket_number}\n**Closed by:** ${interaction.user}\n**Reason:** Closed via button\n\n⏰ This channel will be deleted in 10 seconds...`)
                        .setColor('#FF0000')
                        .setTimestamp();

                    // Reply to the interaction first
                    await interaction.reply({ embeds: [embed] });

                    // Close ticket in database
                    client.db.closeTicket(ticket.id, interaction.user.id);

                    // Log to log channel
                    const settings = client.db.getTicketSettings(interaction.guild.id);
                    if (settings && settings.log_channel_id) {
                        const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('🔒 Ticket Closed')
                                .addFields(
                                    { name: 'Ticket Number', value: `#${ticket.ticket_number}`, inline: true },
                                    { name: 'Created by', value: `<@${ticket.user_id}>`, inline: true },
                                    { name: 'Closed by', value: `${interaction.user}`, inline: true },
                                    { name: 'Reason', value: 'Closed via button', inline: false },
                                    { name: 'Channel', value: `#${interaction.channel.name}`, inline: true }
                                )
                                .setColor('#FF0000')
                                .setTimestamp();

                            await logChannel.send({ embeds: [logEmbed] }).catch(console.error);
                        }
                    }

                    // Delete channel after 10 seconds
                    setTimeout(async () => {
                        try {
                            if (interaction.channel && !interaction.channel.deleted) {
                                await interaction.channel.delete('Ticket closed');
                            }
                        } catch (error) {
                            console.error('Error deleting channel:', error);
                            client.logger.error('Error deleting ticket channel:', error);
                        }
                    }, 10000);

                } catch (error) {
                    console.error('Error in close ticket handler:', error);
                    client.logger.error('Error closing ticket:', error);

                    try {
                        if (!interaction.replied) {
                            await interaction.reply({
                                content: '❌ Failed to close ticket. Please try again.',
                                ephemeral: true
                            });
                        }
                    } catch (replyError) {
                        console.error('Failed to send error response:', replyError);
                    }
                }
            }

            // Handle user profile pagination buttons
            if (interaction.customId.startsWith('user-profile-')) {
                try {
                    if (!client.userProfiles) client.userProfiles = new Map();
                    const profileState = client.userProfiles.get(interaction.message.id);

                    if (!profileState) {
                        return await interaction.reply({ content: 'Profile session expired.', ephemeral: true });
                    }

                    if (interaction.user.id !== profileState.userId) {
                        return await interaction.reply({ content: 'Only the command user can navigate this profile.', ephemeral: true });
                    }

                    let newPage = profileState.currentPage;

                    if (interaction.customId.includes('right')) {
                        newPage = 1;
                    } else if (interaction.customId.includes('left')) {
                        newPage = 0;
                    }

                    const leftBtn = new ButtonBuilder()
                        .setCustomId(`user-profile-left-${profileState.targetUser.id}`)
                        .setLabel('⬅️ Level Info')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(newPage === 0);

                    const rightBtn = new ButtonBuilder()
                        .setCustomId(`user-profile-right-${profileState.targetUser.id}`)
                        .setLabel('Message Stats ➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(newPage === 1);

                    const row = new ActionRowBuilder().addComponents(leftBtn, rightBtn);

                    profileState.currentPage = newPage;
                    client.userProfiles.set(interaction.message.id, profileState);

                    await interaction.update({
                        embeds: [profileState.embeds[newPage]],
                        components: [row]
                    });
                } catch (error) {
                    console.error('Error handling profile pagination:', error);
                    client.logger.error('Error handling profile pagination:', error);

                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Failed to navigate profile. Please try again.',
                            ephemeral: true
                        });
                    }
                }
            }

            // Handle leaderboard pagination buttons
            if (interaction.customId.startsWith('leaderboard-')) {
                try {
                    const state = client.leaderboardPages.get(interaction.message.id);
                    if (!state) {
                        return await interaction.reply({ content: 'Leaderboard session expired.', ephemeral: true });
                    }
                    if (interaction.user.id !== state.userId) {
                        return await interaction.reply({ content: 'Only the leaderboard creator can navigate this.', ephemeral: true });
                    }

                    if (interaction.customId === 'leaderboard-next') {
                        if (state.pageIndex < state.pages.length - 1) state.pageIndex++;
                    } else if (interaction.customId === 'leaderboard-back') {
                        if (state.pageIndex > 0) state.pageIndex--;
                    } else {
                        return await interaction.reply({ content: 'Unknown leaderboard button.', ephemeral: true });
                    }

                    // Update embed and buttons according to page
                    const embed = new EmbedBuilder()
                        .setTitle(state.title)
                        .setDescription(state.pages[state.pageIndex])
                        .setColor('#00FF00')
                        .setFooter({ text: `Page ${state.pageIndex + 1} of ${state.pages.length}` });

                    const backBtn = new ButtonBuilder()
                        .setCustomId('leaderboard-back')
                        .setLabel('⬅️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(state.pageIndex === 0);

                    const nextBtn = new ButtonBuilder()
                        .setCustomId('leaderboard-next')
                        .setLabel('➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(state.pageIndex === state.pages.length - 1);

                    const row = new ActionRowBuilder().addComponents(backBtn, nextBtn);
                    await interaction.update({ embeds: [embed], components: [row] });
                } catch (error) {
                    console.error('Error handling leaderboard pagination:', error);
                    client.logger.error('Error handling leaderboard pagination:', error);

                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Failed to navigate leaderboard. Please try again.',
                            ephemeral: true
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in interactionCreate:', error);
        client.logger.error('Error handling interaction:', error);

        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }
});

// Load event files
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

// Global error handlers
client.on('error', error => {
    Logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    process.exit(1);
});

const token = process.env.DISCORD_TOKEN || config.token;
if (!token) {
    Logger.error('No Discord token provided! Please set DISCORD_TOKEN environment variable or add it to config.json');
    process.exit(1);
}

client.login(token).catch(error => {
    Logger.error('Failed to login:', error);
    process.exit(1);
});

// Leveling message handler
const { handleMessageForXp } = require('./commands/level.js');
client.on('messageCreate', async message => {
    await handleMessageForXp(message, client);
});

module.exports = client;

// Debug logging
console.log('Loaded commands:', Array.from(client.commands.keys()));
