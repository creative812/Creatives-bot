const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const config = require('../config.json');

// Rate limiting
const cooldowns = new Map();

// ✅ Load AI module functions
let aiModule = null;
try {
    aiModule = require('../commands/ai.js');
    console.log('✅ AI module loaded in messageCreate.js');
} catch (error) {
    console.log('❌ AI module not found:', error.message);
}

// Global message processing tracker to prevent duplicates
const processedMessages = new Set();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        // DUPLICATE PREVENTION: Check if this exact message has already been processed
        const messageKey = `${message.id}_${message.guild.id}_${message.author.id}`;
        if (processedMessages.has(messageKey)) {
            console.log(`🚫 [messageCreate.js] DUPLICATE detected, skipping: "${message.content}" from ${message.author.username}`);
            return;
        }
        
        // Mark this message as being processed
        processedMessages.add(messageKey);
        
        // Clean up old processed messages (keep only last 1000)
        if (processedMessages.size > 1000) {
            const entries = Array.from(processedMessages);
            entries.slice(0, entries.length - 500).forEach(key => processedMessages.delete(key));
        }

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

        // ✅ Handle AI responses - Single unified system to prevent duplicates
        if (aiModule && (aiModule.getAISettings || aiModule.generateAIResponse)) {
            const aiLockKey = `ai_${message.guild?.id}_${message.author.id}_${message.id}`;
            if (!client.processingLocks.has(aiLockKey)) {
                client.processingLocks.set(aiLockKey, Date.now());
                try {
                    console.log(`📨 [messageCreate.js] Processing message: "${message.content}" from ${message.author.username}`);

                    let aiResponseSent = false; // Track if we've already sent a response

                    // ✅ NEW CHANNEL-BASED AI SYSTEM (Luna) - Check first
                    const aiChannels = client.db.getAIChannels ? client.db.getAIChannels(message.guild.id) : [];
                    console.log(`🔍 AI Channels for guild: ${aiChannels}, Current channel: ${message.channel.id}`);

                    if (aiChannels.includes(message.channel.id) && !aiResponseSent) {
                        console.log('📍 Using channel-based AI system (Luna)');
                        // Store user message in channel history
                        if (client.db.addChannelMessage) {
                            client.db.addChannelMessage(
                                message.channel.id,
                                message.author.id,
                                message.author.username,
                                message.content,
                                false // user message
                            );
                        }

                        // Check if AI should respond (30% chance or when mentioned)
                        const shouldRespond = Math.random() < 0.3 || 
                                           message.content.toLowerCase().includes('luna') ||
                                           message.content.toLowerCase().includes('ai') ||
                                           message.mentions.users.has(client.user.id);

                        if (shouldRespond) {
                            console.log(`🤖 Luna responding to: "${message.content}" from ${message.author.username}`);

                            await message.channel.sendTyping();

                            // Get channel conversation history
                            const channelHistory = client.db.getChannelHistory ? client.db.getChannelHistory(message.channel.id, 20) : [];
                            const settings = client.db.getAISetting ? client.db.getAISetting(message.guild.id) : {};
                            const personality = settings.ai_personality || 'cheerful';

                            // Generate AI response using the new channel-based system
                            const aiResponse = await aiModule.generateAIResponse(message, channelHistory, personality);

                            // Send response
                            const aiMessage = await message.channel.send(aiResponse);
                            aiResponseSent = true;

                            // Store AI response in channel history
                            if (client.db.addChannelMessage) {
                                client.db.addChannelMessage(
                                    message.channel.id,
                                    client.user.id,
                                    'Luna',
                                    aiResponse,
                                    true // AI response
                                );
                            }

                            console.log('✅ Luna responded successfully via channel system');
                        }
                    }

                    // ✅ LEGACY TRIGGER-BASED AI SYSTEM (for backward compatibility) - Only if no response sent
                    if (!aiResponseSent && aiModule.getAISettings && aiModule.getAIResponseWithAllFeatures) {
                        console.log('📍 Checking legacy trigger-based AI system');
                        // Get AI settings
                        const aiSettings = await aiModule.getAISettings(client, message.guild.id);
                        console.log('⚙️ Legacy AI Settings:', aiSettings);

                        // Check if AI should respond to this message
                        if (aiSettings.enabled && 
                            message.content.startsWith(aiSettings.triggerSymbol) &&
                            (!aiSettings.channelId || message.channel.id === aiSettings.channelId)) {

                            const userMessage = message.content.slice(aiSettings.triggerSymbol.length).trim();
                            if (userMessage) {
                                console.log(`🤖 AI processing message: "${userMessage}" from ${message.author.username}`);
                                await message.channel.sendTyping();

                                const isSpecialUser = message.author.id === '1165238276735639572';
                                const personality = aiSettings.personality || 'casual';

                                // ✅ CORRECT: Call the exported function directly
                                const aiResponse = await aiModule.getAIResponseWithAllFeatures(
                                    userMessage,
                                    isSpecialUser,
                                    personality,
                                    message.author.id,
                                    message.channel
                                );

                                console.log('✅ AI response generated, sending reply from legacy system');
                                await message.reply(aiResponse);
                                aiResponseSent = true;
                            }
                        } else {
                            console.log('❌ Legacy AI will not respond because:');
                            console.log('  - Enabled:', aiSettings.enabled);
                            console.log('  - Starts with trigger:', message.content.startsWith(aiSettings.triggerSymbol));
                            console.log('  - Channel match:', !aiSettings.channelId || message.channel.id === aiSettings.channelId);
                        }
                    }

                    if (!aiResponseSent) {
                        console.log('ℹ️ No AI response sent for this message');
                    }
                    
                    // ✅ CRITICAL FIX: Return early if AI handled the message to prevent command system from also processing it
                    if (aiResponseSent) {
                        console.log('🔒 AI handled message, skipping command processing');
                        return;
                    }
                } catch (error) {
                    console.error('Error in AI message handler:', error);
                    try {
                        await message.channel.send("Sorry sweetie, I'm having a little moment! 🙈💕");
                    } catch (replyError) {
                        console.error('Failed to send AI error message:', replyError);
                    }
                } finally {
                    client.processingLocks.delete(aiLockKey);
                }
            }
        }

        // Get guild settings
        const guildSettings = client.db.getGuildSettings(message.guild.id);
        const prefix = guildSettings?.prefix || config.prefix;

        // Auto-moderation - only check if enabled in guild settings
        if (guildSettings?.automod_enabled) {
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
    const originalContent = message.content; // Keep original for caps check
    const violations = [];

    if (PermissionManager.isModerator(message.member)) return;

    if (config.automod.spamThreshold && hasSpam(content, config.automod.spamThreshold)) {
        violations.push('spam');
    }

    if (config.automod.mentionThreshold && message.mentions.users.size > config.automod.mentionThreshold) {
        violations.push('mention spam');
    }

    if (config.automod.capsThreshold && hasExcessiveCaps(originalContent, config.automod.capsThreshold)) {
        violations.push('excessive caps');
    }

    if (config.automod.linkWhitelist && hasSuspiciousLinks(originalContent, config.automod.linkWhitelist)) {
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
    // Only check messages longer than 20 characters
    if (content.length < 20) return false;
    
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = {};
    for (const word of words) {
        // Only count words longer than 4 characters and filter common words
        if (word.length > 4 && !isCommonWord(word)) {
            wordCount[word] = (wordCount[word] || 0) + 1;
            if (wordCount[word] >= threshold) return true;
        }
    }
    return false;
}

// Common words that shouldn't trigger spam detection
function isCommonWord(word) {
    const commonWords = ['that', 'this', 'with', 'from', 'they', 'been', 'have', 'more', 'will', 'said', 'each', 'which', 'their', 'time', 'very', 'when', 'much', 'some', 'these', 'know', 'take', 'than', 'only', 'think', 'come', 'could', 'also', 'like', 'back', 'after', 'first', 'well', 'would', 'there', 'just', 'where', 'haha', 'yeah', 'okay', 'nice', 'good', 'great', 'lmao', 'lmfao'];
    return commonWords.includes(word);
}

function hasExcessiveCaps(content, threshold) {
    if (content.length < 15) return false;
    const capsCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[A-Za-z]/g) || []).length;
    
    // Only check ratio of caps to letters, not total characters
    if (letterCount < 10) return false;
    return (capsCount / letterCount) >= (threshold / 100);
}

function hasSuspiciousLinks(content, whitelist) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex);
    if (!urls) return false;

    for (const url of urls) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            
            // Check if hostname exactly matches or is a subdomain of whitelisted domain
            const isWhitelisted = whitelist.some(domain => {
                const lowerDomain = domain.toLowerCase();
                return hostname === lowerDomain || hostname.endsWith('.' + lowerDomain);
            });
            
            if (!isWhitelisted) return true;
        } catch (error) {
            // Invalid URL - treat as suspicious
            return true;
        }
    }
    return false;
}

function checkPermissions(member, permissions) {
    return permissions.some(permission => {
        if (permission === 'ADMINISTRATOR') return member.permissions.has('Administrator');
        if (permission === 'MANAGE_MESSAGES') return member.permissions.has('ManageMessages');
        if (permission === 'KICK_MEMBERS') return member.permissions.has('KickMembers');
        if (permission === 'BAN_MEMBERS') return member.permissions.has('BanMembers');
        if (permission === 'MANAGE_GUILD') return member.permissions.has('ManageGuild');
        return false;
    });
}

function isRateLimited(userId, commandName) {
    const key = `${userId}_${commandName}`;
    const now = Date.now();
    const cooldown = cooldowns.get(key);

    if (cooldown && (now - cooldown) < 3000) {
        return true;
    }

    cooldowns.set(key, now);
    return false;
}

function getArgIndex(command, optionName) {
    // Simple helper to map option names to argument indices
    // You may need to adjust this based on your command structure
    if (!command.data || !command.data.options) return 0;

    const option = command.data.options.find(opt => opt.name === optionName);
    return option ? command.data.options.indexOf(option) : 0;
}
