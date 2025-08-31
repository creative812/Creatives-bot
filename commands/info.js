const { SlashCommandBuilder } = require('discord.js');
const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const TimeParser = require('../utils/timeParser.js');

const commands = [
    {
        name: 'userinfo',
        description: 'Get detailed information about a user',
        permissions: ['helper'],
        data: new SlashCommandBuilder()
            .setName('userinfo')
            .setDescription('Get detailed information about a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to get information about')
                    .setRequired(false)),
        async execute(interaction, client) {
            const target = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild.members.cache.get(target.id);

            if (!PermissionManager.isHelper(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need helper permissions or higher to use this command.')], 
                    ephemeral: true 
                });
            }

            try {
                // Get warnings if user is in guild
                let warnings = [];
                if (member) {
                    warnings = client.db.getWarnings(interaction.guild.id, target.id);
                }

                const embed = EmbedManager.createUserInfoEmbed(member || { user: target, joinedTimestamp: null, roles: { cache: new Map() }, presence: null, premiumSince: null }, warnings);

                // Add additional fields for non-members
                if (!member) {
                    embed.addFields([
                        { name: 'Status', value: 'Not in server', inline: true },
                        { name: 'Note', value: 'This user is not a member of this server', inline: false }
                    ]);
                }

                // Add moderation history if user has helper+ permissions
                if (PermissionManager.isHelper(interaction.member) && member) {
                    const modLogs = client.db.getModLogs(interaction.guild.id, 10)
                        .filter(log => log.target_user_id === target.id);
                    
                    if (modLogs.length > 0) {
                        const recentActions = modLogs.slice(0, 5).map(log => {
                            const date = TimeParser.getDiscordTimestamp(log.created_at, 'R');
                            return `${log.action_type} ${date}`;
                        }).join('\n');
                        
                        embed.addFields([{ 
                            name: 'Recent Moderation Actions', 
                            value: recentActions || 'None', 
                            inline: false 
                        }]);
                    }
                }

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                client.logger.error('Error in userinfo command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching user information.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'serverinfo',
        description: 'Get detailed information about the server',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('serverinfo')
            .setDescription('Get detailed information about the server'),
        async execute(interaction, client) {
            try {
                const guild = interaction.guild;
                
                // Fetch additional guild data
                await guild.members.fetch();
                
                const embed = EmbedManager.createServerInfoEmbed(guild);

                // Add additional statistics
                const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
                const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
                const categories = guild.channels.cache.filter(c => c.type === 4).size;
                const emojis = guild.emojis.cache.size;
                const humans = guild.members.cache.filter(m => !m.user.bot).size;
                const bots = guild.members.cache.filter(m => m.user.bot).size;

                embed.addFields([
                    { name: 'Text Channels', value: textChannels.toString(), inline: true },
                    { name: 'Voice Channels', value: voiceChannels.toString(), inline: true },
                    { name: 'Categories', value: categories.toString(), inline: true },
                    { name: 'Humans', value: humans.toString(), inline: true },
                    { name: 'Bots', value: bots.toString(), inline: true },
                    { name: 'Emojis', value: emojis.toString(), inline: true }
                ]);

                // Add features if any
                if (guild.features.length > 0) {
                    const features = guild.features.map(feature => 
                        feature.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                    ).join(', ');
                    embed.addFields([{ name: 'Features', value: features, inline: false }]);
                }

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                client.logger.error('Error in serverinfo command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching server information.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'roleinfo',
        description: 'Get detailed information about a role',
        permissions: ['helper'],
        data: new SlashCommandBuilder()
            .setName('roleinfo')
            .setDescription('Get detailed information about a role')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('Role to get information about')
                    .setRequired(true)),
        async execute(interaction, client) {
            const role = interaction.options.getRole('role');

            if (!PermissionManager.isHelper(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need helper permissions or higher to use this command.')], 
                    ephemeral: true 
                });
            }

            try {
                const embed = EmbedManager.createEmbed(`Role Information - ${role.name}`, null, role.hexColor)
                    .addFields([
                        { name: 'Role ID', value: role.id, inline: true },
                        { name: 'Color', value: role.hexColor, inline: true },
                        { name: 'Position', value: role.position.toString(), inline: true },
                        { name: 'Members', value: role.members.size.toString(), inline: true },
                        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                        { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                        { name: 'Managed', value: role.managed ? 'Yes' : 'No', inline: true },
                        { name: 'Created', value: TimeParser.getDiscordTimestamp(role.createdAt), inline: true }
                    ]);

                // Add permissions if role has any
                if (role.permissions.toArray().length > 0) {
                    const permissions = role.permissions.toArray()
                        .map(perm => perm.replace(/([A-Z])/g, ' $1').trim())
                        .join(', ');
                    embed.addFields([{ 
                        name: 'Permissions', 
                        value: permissions.length > 1024 ? permissions.substring(0, 1021) + '...' : permissions, 
                        inline: false 
                    }]);
                }

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                client.logger.error('Error in roleinfo command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching role information.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'channelinfo',
        description: 'Get detailed information about a channel',
        permissions: ['helper'],
        data: new SlashCommandBuilder()
            .setName('channelinfo')
            .setDescription('Get detailed information about a channel')
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

            try {
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

                if (channel.bitrate) {
                    embed.addFields([{ name: 'Bitrate', value: `${channel.bitrate} kbps`, inline: true }]);
                }

                if (channel.userLimit) {
                    embed.addFields([{ name: 'User Limit', value: channel.userLimit.toString(), inline: true }]);
                }

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                client.logger.error('Error in channelinfo command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching channel information.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'botinfo',
        description: 'Get information about the bot',
        permissions: ['user'],
        data: new SlashCommandBuilder()
            .setName('botinfo')
            .setDescription('Get information about the bot'),
        async execute(interaction, client) {
            try {
                const uptime = Date.now() - client.startTime;
                const uptimeString = TimeParser.formatTime(uptime);
                
                const embed = EmbedManager.createEmbed('🤖 Bot Information', 
                    'Discord Moderation and Utility Bot')
                    .addFields([
                        { name: 'Bot Version', value: '1.0.0', inline: true },
                        { name: 'Discord.js Version', value: require('discord.js').version, inline: true },
                        { name: 'Node.js Version', value: process.version, inline: true },
                        { name: 'Uptime', value: uptimeString, inline: true },
                        { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
                        { name: 'Users', value: client.users.cache.size.toString(), inline: true },
                        { name: 'Commands', value: client.commands.size.toString(), inline: true },
                        { name: 'Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
                        { name: 'Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true }
                    ])
                    .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
                    .addFields([
                        { name: 'Features', value: '• Moderation Commands\n• Giveaway System\n• Role Management\n• Logging System\n• Welcome/Leave Messages\n• Auto-moderation\n• And much more!', inline: false }
                    ]);

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                client.logger.error('Error in botinfo command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while fetching bot information.')], 
                    ephemeral: true 
                });
            }
        }
    }
];

module.exports = { commands };
