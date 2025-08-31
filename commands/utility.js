const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const TimeParser = require('../utils/timeParser.js');
const config = require('../config.json');

const commands = [
    {
        name: 'ping',
        description: 'Check bot latency',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency'),
        async execute(interaction, client) {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
            const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;
            
            const embed = EmbedManager.createEmbed('🏓 Pong!', 
                `**Bot Latency:** ${timeDiff}ms\n**API Latency:** ${Math.round(client.ws.ping)}ms`);
            
            await interaction.editReply({ content: null, embeds: [embed] });
        }
    },

    {
        name: 'uptime',
        description: 'Check bot uptime',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('uptime')
            .setDescription('Check bot uptime'),
        async execute(interaction, client) {
            const uptime = Date.now() - client.startTime;
            const uptimeString = TimeParser.formatTime(uptime);
            
            const embed = EmbedManager.createEmbed('⏰ Bot Uptime', 
                `The bot has been running for **${uptimeString}**`);
            
            await interaction.reply({ embeds: [embed] });
        }
    },

    {
        name: 'avatar',
        description: 'Get a user\'s avatar',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Get a user\'s avatar')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to get avatar from')
                    .setRequired(false)),
        async execute(interaction, client) {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild?.members.cache.get(user.id);
            
            const embed = EmbedManager.createEmbed(`Avatar - ${user.tag}`, null);
            
            // Global avatar
            const globalAvatar = user.displayAvatarURL({ dynamic: true, size: 1024 });
            embed.setImage(globalAvatar);
            embed.addFields([{ name: 'Global Avatar', value: `[Download](${globalAvatar})`, inline: true }]);
            
            // Server avatar if different
            if (member && member.avatar) {
                const serverAvatar = member.displayAvatarURL({ dynamic: true, size: 1024 });
                embed.addFields([{ name: 'Server Avatar', value: `[Download](${serverAvatar})`, inline: true }]);
            }
            
            await interaction.reply({ embeds: [embed] });
        }
    },

    {
        name: 'send-message',
        description: 'Send a custom message',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('send-message')
            .setDescription('Send a custom message')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel to send message to')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('content')
                    .setDescription('Message content')
                    .setMaxLength(2000)
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('embed_title')
                    .setDescription('Embed title')
                    .setMaxLength(256)
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('embed_description')
                    .setDescription('Embed description')
                    .setMaxLength(4096)
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('embed_color')
                    .setDescription('Embed color (hex code)')
                    .setRequired(false))
            .addAttachmentOption(option =>
                option.setName('attachment')
                    .setDescription('File to attach')
                    .setRequired(false)),
        async execute(interaction, client) {
            const channel = interaction.options.getChannel('channel');
            const content = interaction.options.getString('content');
            const embedTitle = interaction.options.getString('embed_title');
            const embedDescription = interaction.options.getString('embed_description');
            const embedColor = interaction.options.getString('embed_color');
            const attachment = interaction.options.getAttachment('attachment');

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            // Check if we have permission to send messages in the target channel
            if (!PermissionManager.botHasPermissions(channel, ['SendMessages'])) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Missing Permissions', `I don't have permission to send messages in ${channel}.`)], 
                    ephemeral: true 
                });
            }

            if (!content && !embedTitle && !embedDescription && !attachment) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Invalid Input', 'You must provide at least some content, embed information, or an attachment.')], 
                    ephemeral: true 
                });
            }

            try {
                const messageOptions = {};

                // Add content if provided
                if (content) {
                    messageOptions.content = content;
                }

                // Create embed if title or description provided
                if (embedTitle || embedDescription) {
                    const color = embedColor && /^#[0-9A-F]{6}$/i.test(embedColor) ? embedColor : config.embedColor;
                    const embed = EmbedManager.createEmbed(embedTitle || 'Message', embedDescription || '', color);
                    messageOptions.embeds = [embed];
                }

                // Add attachment if provided
                if (attachment) {
                    messageOptions.files = [attachment];
                }

                await channel.send(messageOptions);

                const embed = EmbedManager.createSuccessEmbed('Message Sent', 
                    `Successfully sent message to ${channel}.`);
                
                await interaction.reply({ embeds: [embed], ephemeral: true });

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Custom Message', 'N/A', interaction.user.id, 
                    `Sent message to ${channel.name}`);

            } catch (error) {
                client.logger.error('Error in send-message command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while sending the message.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'member-count',
        description: 'Get server member count',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('member-count')
            .setDescription('Get server member count'),
        async execute(interaction, client) {
            const guild = interaction.guild;
            
            // Fetch all members to get accurate counts
            await guild.members.fetch();
            
            const totalMembers = guild.memberCount;
            const humans = guild.members.cache.filter(member => !member.user.bot).size;
            const bots = guild.members.cache.filter(member => member.user.bot).size;
            const online = guild.members.cache.filter(member => 
                member.presence?.status === 'online' || 
                member.presence?.status === 'idle' || 
                member.presence?.status === 'dnd'
            ).size;

            const embed = EmbedManager.createEmbed(`📊 ${guild.name} Member Statistics`, null)
                .addFields([
                    { name: 'Total Members', value: totalMembers.toString(), inline: true },
                    { name: 'Humans', value: humans.toString(), inline: true },
                    { name: 'Bots', value: bots.toString(), inline: true },
                    { name: 'Online', value: online.toString(), inline: true },
                    { name: 'Offline', value: (totalMembers - online).toString(), inline: true },
                    { name: 'Server Created', value: TimeParser.getDiscordTimestamp(guild.createdAt), inline: true }
                ]);

            await interaction.reply({ embeds: [embed] });
        }
    },

    {
        name: 'channel-info',
        description: 'Get information about a channel',
        permissions: ['helper'],
        data: new SlashCommandBuilder()
            .setName('channel-info')
            .setDescription('Get information about a channel')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel to get information about')
                    .setRequired(false)),
        async execute(interaction, client) {
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            if (!PermissionManager.isHelper(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need helper permissions or higher to use this command.')], 
                    ephemeral: true 
                });
            }

            const embed = EmbedManager.createEmbed(`Channel Information - #${channel.name}`, null)
                .addFields([
                    { name: 'Channel ID', value: channel.id, inline: true },
                    { name: 'Type', value: channel.type.toString(), inline: true },
                    { name: 'Created', value: TimeParser.getDiscordTimestamp(channel.createdAt), inline: true }
                ]);

            if (channel.topic) {
                embed.addFields([{ name: 'Topic', value: channel.topic, inline: false }]);
            }

            if (channel.parent) {
                embed.addFields([{ name: 'Category', value: channel.parent.name, inline: true }]);
            }

            if (channel.rateLimitPerUser) {
                embed.addFields([{ name: 'Slowmode', value: `${channel.rateLimitPerUser} seconds`, inline: true }]);
            }

            if (channel.nsfw !== undefined) {
                embed.addFields([{ name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true }]);
            }

            await interaction.reply({ embeds: [embed] });
        }
    },

    {
        name: 'invite-tracker',
        description: 'Track server invites',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('invite-tracker')
            .setDescription('Track server invites')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all server invites'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('create')
                    .setDescription('Create a new invite')
                    .addChannelOption(option =>
                        option.setName('channel')
                            .setDescription('Channel to create invite for')
                            .setRequired(false))
                    .addIntegerOption(option =>
                        option.setName('max_uses')
                            .setDescription('Maximum number of uses (0 = unlimited)')
                            .setMinValue(0)
                            .setMaxValue(100)
                            .setRequired(false))
                    .addStringOption(option =>
                        option.setName('expires')
                            .setDescription('Expiration time (e.g., 1d, 1h)')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('delete')
                    .setDescription('Delete an invite')
                    .addStringOption(option =>
                        option.setName('code')
                            .setDescription('Invite code to delete')
                            .setRequired(true))),
        async execute(interaction, client) {
            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const subcommand = interaction.options.getSubcommand();

            try {
                if (subcommand === 'list') {
                    if (!PermissionManager.botHasPermissions(interaction.guild, ['ManageGuild'])) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Missing Permissions', 'I need the "Manage Server" permission to view invites.')], 
                            ephemeral: true 
                        });
                    }

                    const invites = await interaction.guild.invites.fetch();
                    
                    if (invites.size === 0) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createEmbed('No Invites', 'This server has no active invites.')], 
                            ephemeral: true 
                        });
                    }

                    const embed = EmbedManager.createEmbed('📋 Server Invites', `Found ${invites.size} active invite(s)`);
                    
                    invites.forEach(invite => {
                        const createdBy = invite.inviter ? invite.inviter.tag : 'Unknown';
                        const uses = invite.uses || 0;
                        const maxUses = invite.maxUses || 'Unlimited';
                        const expires = invite.expiresAt ? TimeParser.getDiscordTimestamp(invite.expiresAt) : 'Never';
                        
                        embed.addFields([{
                            name: `Invite: ${invite.code}`,
                            value: `**Channel:** ${invite.channel.name}\n**Uses:** ${uses}/${maxUses}\n**Created by:** ${createdBy}\n**Expires:** ${expires}`,
                            inline: true
                        }]);
                    });

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (subcommand === 'create') {
                    const channel = interaction.options.getChannel('channel') || interaction.channel;
                    const maxUses = interaction.options.getInteger('max_uses') || 0;
                    const expiresString = interaction.options.getString('expires');

                    if (!PermissionManager.botHasPermissions(channel, ['CreateInstantInvite'])) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Missing Permissions', `I don't have permission to create invites in ${channel}.`)], 
                            ephemeral: true 
                        });
                    }

                    let maxAge = 0; // 0 = never expires
                    if (expiresString) {
                        const expiresMs = TimeParser.parseTime(expiresString);
                        if (expiresMs) {
                            maxAge = Math.floor(expiresMs / 1000); // Convert to seconds
                        }
                    }

                    const invite = await channel.createInvite({
                        maxAge: maxAge,
                        maxUses: maxUses,
                        unique: true,
                        reason: `Created by ${interaction.user.tag}`
                    });

                    const embed = EmbedManager.createSuccessEmbed('Invite Created', 
                        `**Invite URL:** ${invite.url}\n**Code:** ${invite.code}\n**Channel:** ${channel.name}\n**Max Uses:** ${maxUses || 'Unlimited'}\n**Expires:** ${invite.expiresAt ? TimeParser.getDiscordTimestamp(invite.expiresAt) : 'Never'}`);

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (subcommand === 'delete') {
                    const code = interaction.options.getString('code');

                    if (!PermissionManager.botHasPermissions(interaction.guild, ['ManageGuild'])) {
                        return interaction.reply({ 
                            embeds: [EmbedManager.createErrorEmbed('Missing Permissions', 'I need the "Manage Server" permission to delete invites.')], 
                            ephemeral: true 
                        });
                    }

                    try {
                        const invite = await client.fetchInvite(code);
                        
                        if (invite.guild.id !== interaction.guild.id) {
                            return interaction.reply({ 
                                embeds: [EmbedManager.createErrorEmbed('Invalid Invite', 'That invite is not for this server.')], 
                                ephemeral: true 
                            });
                        }

                        await invite.delete(`Deleted by ${interaction.user.tag}`);

                        const embed = EmbedManager.createSuccessEmbed('Invite Deleted', 
                            `Successfully deleted invite: ${code}`);

                        await interaction.reply({ embeds: [embed], ephemeral: true });

                    } catch (error) {
                        if (error.code === 10006) {
                            return interaction.reply({ 
                                embeds: [EmbedManager.createErrorEmbed('Invite Not Found', 'No invite found with that code.')], 
                                ephemeral: true 
                            });
                        }
                        throw error;
                    }
                }

            } catch (error) {
                client.logger.error('Error in invite-tracker command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing invites.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'help',
        description: 'Get help with bot commands',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Get help with bot commands')
            .addStringOption(option =>
                option.setName('command')
                    .setDescription('Specific command to get help for')
                    .setRequired(false)),
        async execute(interaction, client) {
            const commandName = interaction.options.getString('command');

            if (commandName) {
                // Get help for specific command
                const command = client.commands.get(commandName);
                
                if (!command) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Command Not Found', `No command found with the name "${commandName}".`)], 
                        ephemeral: true 
                    });
                }

                const embed = EmbedManager.createEmbed(`Help - ${command.name}`, command.description || 'No description available')
                    .addFields([
                        { name: 'Usage', value: `${config.prefix}${command.name}`, inline: true },
                        { name: 'Permissions', value: command.permissions ? command.permissions.join(', ') : 'None', inline: true }
                    ]);

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else {
                // Get general help
                const userLevel = PermissionManager.getPermissionLevel(interaction.member);
                const availableCommands = Array.from(client.commands.values()).filter(cmd => {
                    if (!cmd.permissions || cmd.permissions.includes('user')) return true;
                    if (cmd.permissions.includes('helper') && ['helper', 'moderator', 'admin'].includes(userLevel)) return true;
                    if (cmd.permissions.includes('moderator') && ['moderator', 'admin'].includes(userLevel)) return true;
                    if (cmd.permissions.includes('admin') && userLevel === 'admin') return true;
                    return false;
                });

                const categories = {
                    'Moderation': availableCommands.filter(cmd => ['warn', 'warnings', 'clear-warnings', 'mute', 'unmute', 'kick', 'ban', 'purge'].includes(cmd.name)),
                    'Giveaways': availableCommands.filter(cmd => ['giveaway', 'giveaway-end', 'giveaway-reroll'].includes(cmd.name)),
                    'Roles': availableCommands.filter(cmd => ['assign-role', 'remove-role', 'auto-role', 'self-roles', 'role'].includes(cmd.name)),
                    'Information': availableCommands.filter(cmd => ['userinfo', 'serverinfo', 'channel-info', 'member-count'].includes(cmd.name)),
                    'Utility': availableCommands.filter(cmd => ['ping', 'uptime', 'avatar', 'send-message', 'invite-tracker', 'help'].includes(cmd.name)),
                    'Administration': availableCommands.filter(cmd => ['settings', 'backup', 'logs'].includes(cmd.name))
                };

                const embed = EmbedManager.createEmbed('🤖 Bot Commands', 
                    `Here are the commands you can use. Use \`/help <command>\` for detailed information about a specific command.\n\n**Prefix:** \`${config.prefix}\``);

                Object.entries(categories).forEach(([category, commands]) => {
                    if (commands.length > 0) {
                        const commandList = commands.map(cmd => `\`${cmd.name}\``).join(', ');
                        embed.addFields([{ name: category, value: commandList, inline: false }]);
                    }
                });

                embed.addFields([
                    { name: 'Support', value: 'Need help? Contact a server administrator.', inline: false },
                    { name: 'Permission Levels', value: `**Your Level:** ${userLevel}\n**Available:** user < helper < moderator < admin`, inline: false }
                ]);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
];

module.exports = { commands };
