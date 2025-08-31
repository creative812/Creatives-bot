const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const config = require('../config.json');

// Rate limiting
const cooldowns = new Map();

module.exports = {
    name: 'messageCreate',
    execute(message, client) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        // Get guild settings
        const guildSettings = client.db.getGuildSettings(message.guild.id);
        const prefix = guildSettings?.prefix || config.prefix;

        // Auto-moderation
        if (guildSettings?.automod_enabled && config.automod.enabled) {
            handleAutoModeration(message, client, guildSettings);
        }

        // Check if message starts with prefix
        if (!message.content.startsWith(prefix)) return;

        // Parse command and arguments
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        if (!commandName) return;

        // Find command
        const command = client.commands.get(commandName) || 
                       client.commands.find(cmd => cmd.aliases?.includes(commandName));

        if (!command) return;

        // Check permissions
        if (command.permissions && !checkPermissions(message.member, command.permissions)) {
            return message.reply({ 
                embeds: [EmbedManager.createErrorEmbed('Permission Denied', 
                    `You need ${command.permissions.join(' or ')} permissions to use this command.`)],
                allowedMentions: { repliedUser: false }
            });
        }

        // Rate limiting
        if (isRateLimited(message.author.id, commandName)) {
            return message.reply({ 
                embeds: [EmbedManager.createWarningEmbed('Rate Limited', 
                    'You are using commands too quickly. Please wait a moment.')],
                allowedMentions: { repliedUser: false }
            });
        }

        try {
            // Create interaction-like object for compatibility
            const fakeInteraction = {
                user: message.author,
                member: message.member,
                guild: message.guild,
                channel: message.channel,
                reply: async (options) => {
                    if (typeof options === 'string') {
                        return message.reply({ content: options, allowedMentions: { repliedUser: false } });
                    }
                    return message.reply({ ...options, allowedMentions: { repliedUser: false } });
                },
                editReply: async (options) => {
                    // For prefix commands, we can't edit replies the same way
                    return message.channel.send(options);
                },
                deferReply: async () => {
                    // For prefix commands, we can send a "thinking" message
                    return message.channel.sendTyping();
                },
                options: {
                    getString: (name) => args[getArgIndex(command, name)],
                    getUser: (name) => {
                        const argIndex = getArgIndex(command, name);
                        const mention = args[argIndex];
                        if (!mention) return null;
                        const userId = mention.replace(/[<@!>]/g, '');
                        return client.users.cache.get(userId);
                    },
                    getChannel: (name) => {
                        const argIndex = getArgIndex(command, name);
                        const mention = args[argIndex];
                        if (!mention) return null;
                        const channelId = mention.replace(/[<#>]/g, '');
                        return message.guild.channels.cache.get(channelId);
                    },
                    getRole: (name) => {
                        const argIndex = getArgIndex(command, name);
                        const mention = args[argIndex];
                        if (!mention) return null;
                        const roleId = mention.replace(/[<@&>]/g, '');
                        return message.guild.roles.cache.get(roleId);
                    },
                    getInteger: (name) => {
                        const argIndex = getArgIndex(command, name);
                        const value = args[argIndex];
                        return value ? parseInt(value, 10) : null;
                    },
                    getBoolean: (name) => {
                        const argIndex = getArgIndex(command, name);
                        const value = args[argIndex]?.toLowerCase();
                        return value === 'true' || value === 'yes' || value === '1';
                    },
                    getSubcommand: () => args[0]
                }
            };

            // Execute command
            command.execute(fakeInteraction, client);

            // Log command usage
            client.logger.logCommand(commandName, message.author, message.guild);

        } catch (error) {
            client.logger.error(`Error executing prefix command ${commandName}:`, error);
            message.reply({ 
                embeds: [EmbedManager.createErrorEmbed('Command Error', 'An error occurred while executing this command.')],
                allowedMentions: { repliedUser: false }
            });
        }
    }
};

/**
 * Handle auto-moderation
 * @param {Message} message - Discord message
 * @param {Client} client - Discord client
 * @param {Object} settings - Guild settings
 */
function handleAutoModeration(message, client, settings) {
    const content = message.content.toLowerCase();
    const violations = [];

    // Skip if user has moderator permissions
    if (PermissionManager.isModerator(message.member)) return;

    // Spam detection (repeated characters)
    if (config.automod.spamThreshold && hasSpam(content, config.automod.spamThreshold)) {
        violations.push('spam');
    }

    // Excessive mentions
    if (config.automod.mentionThreshold && message.mentions.users.size > config.automod.mentionThreshold) {
        violations.push('mention spam');
    }

    // Excessive caps
    if (config.automod.capsThreshold && hasExcessiveCaps(content, config.automod.capsThreshold)) {
        violations.push('excessive caps');
    }

    // Suspicious links (not in whitelist)
    if (config.automod.linkWhitelist && hasSuspiciousLinks(content, config.automod.linkWhitelist)) {
        violations.push('suspicious links');
    }

    // Take action if violations found
    if (violations.length > 0) {
        // Delete message
        message.delete().catch(error => {
            client.logger.warn('Failed to delete message in auto-moderation:', error);
        });

        // Warn user
        const reason = `Auto-moderation: ${violations.join(', ')}`;
        try {
            client.db.addWarning(message.guild.id, message.author.id, client.user.id, reason);
            
            // Send warning message
            const embed = EmbedManager.createWarningEmbed('Auto-Moderation', 
                `${message.author}, your message was removed for: ${violations.join(', ')}`);
            
            message.channel.send({ embeds: [embed] }).then(msg => {
                // Delete warning message after 10 seconds
                setTimeout(() => msg.delete().catch(() => {}), 10000);
            });

            client.logger.logModeration('Auto-Moderation', message.author, client.user, message.guild, reason);

        } catch (error) {
            client.logger.error('Error in auto-moderation:', error);
        }
    }
}

/**
 * Check if content has spam (repeated characters)
 * @param {string} content - Message content
 * @param {number} threshold - Spam threshold
 * @returns {boolean}
 */
function hasSpam(content, threshold) {
    return /(.)\1{4,}/.test(content) || content.length > 500;
}

/**
 * Check if content has excessive caps
 * @param {string} content - Message content
 * @param {number} threshold - Caps percentage threshold
 * @returns {boolean}
 */
function hasExcessiveCaps(content, threshold) {
    if (content.length < 10) return false;
    
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[A-Za-z]/g) || []).length;
    
    return letterCount > 0 && (uppercaseCount / letterCount) * 100 > threshold;
}

/**
 * Check if content has suspicious links
 * @param {string} content - Message content
 * @param {Array} whitelist - Whitelisted domains
 * @returns {boolean}
 */
function hasSuspiciousLinks(content, whitelist) {
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const urls = content.match(urlRegex);
    
    if (!urls) return false;
    
    return urls.some(url => {
        try {
            const domain = new URL(url).hostname.toLowerCase();
            return !whitelist.some(allowed => domain.includes(allowed));
        } catch {
            return true; // Invalid URL is suspicious
        }
    });
}

/**
 * Check permissions for prefix commands
 * @param {GuildMember} member - Guild member
 * @param {Array} permissions - Required permissions
 * @returns {boolean}
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

/**
 * Check if user is rate limited
 * @param {string} userId - User ID
 * @param {string} commandName - Command name
 * @returns {boolean}
 */
function isRateLimited(userId, commandName) {
    const key = `${userId}-${commandName}`;
    const now = Date.now();
    
    if (!cooldowns.has(key)) {
        cooldowns.set(key, now);
        return false;
    }
    
    const lastUsed = cooldowns.get(key);
    if (now - lastUsed < config.rateLimitWindow) {
        return true;
    }
    
    cooldowns.set(key, now);
    return false;
}

/**
 * Get argument index for command option
 * @param {Object} command - Command object
 * @param {string} optionName - Option name
 * @returns {number}
 */
function getArgIndex(command, optionName) {
    // This is a simplified mapping for prefix commands
    // In a real implementation, you'd want a more sophisticated argument parser
    const argMappings = {
        user: 0,
        target: 0,
        member: 0,
        amount: 0,
        duration: 1,
        reason: 2,
        role: 0,
        channel: 0,
        message: 0,
        content: 0
    };
    
    return argMappings[optionName] || 0;
}
