const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const config = require('../config.json');

// Rate limiting
const cooldowns = new Map();

// ✅ REMOVED: AI module loading (no longer needed here)

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        // ✅ Handle XP for leveling system
        const xpLockKey = `xp_${message.guild?.id}_${message.author.id}_${message.id}`;
        if (!client.processingLocks.has(xpLockKey)) {
            client.processingLocks.set(xpLockKey, Date.now());
            try {
                const { handleMessageForXp } = require('../commands/level.js');
                await handleMessageForXp(message, client);
            } catch (error) {
                console.error('Error in XP handler:', error);
            } finally {
                client.processingLocks.delete(xpLockKey);
            }
        }

        // ✅ REMOVED: Entire AI message handling section to prevent duplicates

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
                    return message.channel.send(options);
                },
                deferReply: async () => {
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

// ✅ Keep all your existing helper functions exactly the same
function handleAutoModeration(message, client, settings) {
    const content = message.content.toLowerCase();
    const violations = [];

    if (PermissionManager.isModerator(message.member)) return;

    if (config.automod.spamThreshold && hasSpam(content, config.automod.spamThreshold)) {
        violations.push('spam');
    }

    if (config.automod.mentionThreshold && message.mentions.users.size > config.automod.mentionThreshold) {
        violations.push('mention spam');
    }

    if (config.automod.capsThreshold && hasExcessiveCaps(content, config.automod.capsThreshold)) {
        violations.push('excessive caps');
    }

    if (config.automod.linkWhitelist && hasSuspiciousLinks(content, config.automod.linkWhitelist)) {
        violations.push('suspicious links');
    }

    if (violations.length > 0) {
        message.delete().catch(error => {
            client.logger.warn('Failed to delete message in auto-moderation:', error);
        });

        const reason = `Auto-moderation: ${violations.join(', ')}`;
        try {
            client.db.addWarning(message.guild.id, message.author.id, client.user.id, reason);

            const embed = EmbedManager.createWarningEmbed('Auto-Moderation', 
                `${message.author}, your message was removed for: ${violations.join(', ')}`);
            message.channel.send({ embeds: [embed] }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 10000);
            });

            client.logger.logModeration('Auto-Moderation', message.author, client.user, message.guild, reason);
        } catch (error) {
            client.logger.error('Error in auto-moderation:', error);
        }
    }
}

function hasSpam(content, threshold) {
    return /(.)\1{4,}/.test(content) || content.length > 500;
}

function hasExcessiveCaps(content, threshold) {
    if (content.length < 10) return false;
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[A-Za-z]/g) || []).length;
    return letterCount > 0 && (uppercaseCount / letterCount) * 100 > threshold;
}

function hasSuspiciousLinks(content, whitelist) {
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const urls = content.match(urlRegex);
    if (!urls) return false;

    return urls.some(url => {
        try {
            const domain = new URL(url).hostname.toLowerCase();
            return !whitelist.some(allowed => domain.includes(allowed));
        } catch {
            return true;
        }
    });
}

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

function getArgIndex(command, optionName) {
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
