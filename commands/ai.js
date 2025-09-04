const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Hardcoded special user ID
const SPECIAL_USER_ID = '1165238276735639572';

// ✅ ENHANCED: Smart conversation memory settings
const MAX_MESSAGES_PER_USER = 150;
const CONTEXT_MESSAGES = 50;
const CLEANUP_THRESHOLD = 200;

// ✅ NEW: Rate limiting and debouncing
const conversationHistory = new Map();
const messageProcessingLock = new Set(); // Prevent duplicate processing
const userCooldowns = new Map(); // User-specific cooldowns

// ✅ NEW: Topic Transitions & Games (same as before)
const topicTransitions = [
    "Speaking of that, it reminds me of",
    "That's interesting! On a related note", 
    "I love how that connects to",
    "You know what else is fascinating?",
    "By the way, that reminds me of"
];

const conversationGames = {
    '20questions': {
        name: '20 Questions',
        intro: '🎯 I\'m thinking of something! Ask me yes/no questions to guess what it is!',
        items: ['pizza', 'smartphone', 'rainbow', 'ocean', 'guitar', 'butterfly', 'mountain', 'book']
    },
    'storytelling': {
        name: 'Story Building', 
        intro: '📚 Let\'s create a story together! I\'ll start with a sentence, then you add the next one...',
        starters: [
            'In a world where colors had sounds, Maria discovered she could hear',
            'The old lighthouse keeper noticed something strange washing up on shore',
            'When the last library on Earth closed, the books began to'
        ]
    },
    'wouldyourather': {
        name: 'Would You Rather',
        intro: '🤔 Here\'s a tough choice for you...',
        questions: [
            'Would you rather have the ability to fly or be invisible?',
            'Would you rather always know when someone is lying or always get away with lying?',
            'Would you rather have perfect memory or perfect intuition?'
        ]
    },
    'riddles': {
        name: 'Riddle Time',
        intro: '🧩 Here\'s a riddle for you to solve...',
        riddles: [
            { question: 'I speak without a mouth and hear without ears. What am I?', answer: 'echo' },
            { question: 'The more you take away from me, the bigger I become. What am I?', answer: 'hole' },
            { question: 'I\'m tall when I\'m young, short when I\'m old. What am I?', answer: 'candle' }
        ]
    }
};

const moodEmojis = {
    'happy': ['😊', '😄', '🎉', '✨', '🌟'],
    'sad': ['😢', '💙', '🤗', '🌧️'],
    'excited': ['🚀', '🎆', '⚡', '🔥', '🎊'],
    'frustrated': ['😤', '💆‍♀️', '🧘‍♀️', '🫂'],
    'confused': ['🤔', '🧐', '💭', '❓'],
    'neutral': ['😌', '👍', '💫', '🌸']
};

module.exports = {
    data: [
        new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Enable or disable AI chat feature for this server')
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Turn AI chat on or off')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-channel')
            .setDescription('Set which channel the AI should respond in')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel where AI should respond')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-symbol')
            .setDescription('Set the symbol that triggers AI responses')
            .addStringOption(option =>
                option.setName('symbol')
                    .setDescription('Symbol to trigger AI (e.g., !, ?, @)')
                    .setRequired(true)
                    .setMaxLength(5))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-status')
            .setDescription('Check current AI chat settings for this server'),

        new SlashCommandBuilder()
            .setName('ai-reset')
            .setDescription('Reset all AI settings to default')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-personality')
            .setDescription('Set AI personality type')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Choose AI personality')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Friendly', value: 'friendly' },
                        { name: 'Professional', value: 'professional' },
                        { name: 'Casual', value: 'casual' },
                        { name: 'Funny', value: 'funny' }
                    ))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-clear')
            .setDescription('Clear your conversation history with the AI'),

        new SlashCommandBuilder()
            .setName('ai-game')
            .setDescription('Start an interactive conversation game')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Choose a conversation game')
                    .setRequired(true)
                    .addChoices(
                        { name: '🎯 20 Questions', value: '20questions' },
                        { name: '📚 Story Building', value: 'storytelling' },
                        { name: '🤔 Would You Rather', value: 'wouldyourather' },
                        { name: '🧩 Riddle Time', value: 'riddles' }
                    ))
    ],

    async execute(interaction, client) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'ai-toggle': await handleToggle(interaction, client); break;
                case 'ai-channel': await handleChannel(interaction, client); break;
                case 'ai-symbol': await handleSymbol(interaction, client); break;
                case 'ai-status': await handleStatus(interaction, client); break;
                case 'ai-reset': await handleReset(interaction, client); break;
                case 'ai-personality': await handlePersonality(interaction, client); break;
                case 'ai-clear': await handleClear(interaction, client); break;
                case 'ai-game': await handleGame(interaction, client); break;
            }
        } catch (error) {
            console.error('AI Command Error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the AI command.')
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    // ✅ FIXED: Message handler with rate limiting and duplicate prevention
    async handleMessage(message, client) {
        if (message.author.bot) return;

        const guildId = message.guild?.id;
        if (!guildId) return;

        // ✅ NEW: Prevent duplicate processing of same message
        const messageKey = `${message.id}_${message.author.id}`;
        if (messageProcessingLock.has(messageKey)) {
            console.log('Message already being processed, skipping');
            return;
        }

        try {
            // ✅ NEW: Add message to processing lock
            messageProcessingLock.add(messageKey);

            const settings = await getAISettings(client, guildId);

            if (!settings.enabled) return;
            if (settings.channelId && message.channel.id !== settings.channelId) return;
            if (!message.content.startsWith(settings.triggerSymbol)) return;

            const userMessage = message.content.slice(settings.triggerSymbol.length).trim();
            if (!userMessage) return;

            // ✅ NEW: User-specific rate limiting (3 seconds cooldown)
            const userId = message.author.id;
            const now = Date.now();
            const lastRequest = userCooldowns.get(userId) || 0;

            if (now - lastRequest < 3000) { // 3 second cooldown per user
                await message.react('⏰');
                return;
            }

            userCooldowns.set(userId, now);

            await message.channel.sendTyping();

            const isSpecialUser = message.author.id === SPECIAL_USER_ID;
            const personality = settings.personality || 'casual';

            // ✅ OPTIMIZED: Single API call with all features combined
            const aiResponse = await getOptimizedAIResponse(
                userMessage, 
                isSpecialUser, 
                personality, 
                message.author.id,
                message.channel
            );

            // ✅ NEW: Add small delay to prevent rapid-fire responses
            await new Promise(resolve => setTimeout(resolve, 500));

            await message.reply(aiResponse);

            // ✅ NEW: Occasionally suggest games (reduced frequency)
            if (Math.random() < 0.03) { // Reduced from 5% to 3%
                setTimeout(async () => {
                    try {
                        await message.followUp('🎮 *Want to play a conversation game? Try `/ai-game`!*');
                    } catch (error) {
                        console.log('Failed to send game suggestion:', error.message);
                    }
                }, 2000);
            }

        } catch (error) {
            console.error('AI Message Handler Error:', error);
            try {
                if (error.message?.includes('rate') || error.message?.includes('429')) {
                    await message.react('🚦');
                } else {
                    await message.reply('Sorry, I encountered an error. Please try again in a moment.');
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        } finally {
            // ✅ NEW: Remove from processing lock after delay
            setTimeout(() => {
                messageProcessingLock.delete(messageKey);
            }, 1000);
        }
    }
};

// ✅ ALL EXISTING HELPER FUNCTIONS (keeping same as before)
async function handleToggle(interaction, client) {
    const enabled = interaction.options.getBoolean('enabled');
    await client.db.setAISetting(interaction.guildId, 'ai_enabled', enabled ? 1 : 0);

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00FF00' : '#FF9900')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI chat has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleChannel(interaction, client) {
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Channel')
            .setDescription('Please select a text channel for AI responses.')
            .setTimestamp();
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await client.db.setAISetting(interaction.guildId, 'ai_channel_id', channel.id);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI will now respond in ${channel}.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleSymbol(interaction, client) {
    const symbol = interaction.options.getString('symbol');
    await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', symbol);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI trigger symbol has been set to: **${symbol}**`)
        .addFields([
            { name: 'Usage', value: `Type \`${symbol}your message\` to chat with AI`, inline: false }
        ])
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleStatus(interaction, client) {
    const settings = await getAISettings(client, interaction.guildId);

    const channel = settings.channelId ? `<#${settings.channelId}>` : 'Any channel';
    const statusColor = settings.enabled ? '#00FF00' : '#FF0000';
    const statusText = settings.enabled ? '✅ Enabled' : '❌ Disabled';

    const userHistory = conversationHistory.get(interaction.user.id);
    const memoryInfo = userHistory ? `${Math.floor(userHistory.length / 2)} exchanges` : 'No history';

    const embed = new EmbedBuilder()
        .setColor(statusColor)
        .setTitle('🤖 AI Chat Status & Features')
        .addFields([
            { name: 'Status', value: statusText, inline: true },
            { name: 'Channel', value: channel, inline: true },
            { name: 'Trigger Symbol', value: `\`${settings.triggerSymbol}\``, inline: true },
            { name: 'Personality', value: settings.personality || 'casual', inline: true },
            { name: 'Your Memory', value: memoryInfo, inline: true },
            { name: 'Active Users', value: `${conversationHistory.size}`, inline: true },
            { name: '🎭 Enhanced Features', value: '• Optimized mood detection\n• Context-aware responses\n• Rate limiting protection\n• Interactive games', inline: false }
        ])
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleReset(interaction, client) {
    await client.db.setAISetting(interaction.guildId, 'ai_enabled', 0);
    await client.db.setAISetting(interaction.guildId, 'ai_channel_id', null);
    await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', '!');
    await client.db.setAISetting(interaction.guildId, 'ai_personality', 'casual');

    const embed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('🤖 AI Settings Reset')
        .setDescription('All AI settings have been reset to default values.')
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handlePersonality(interaction, client) {
    const personality = interaction.options.getString('type');
    await client.db.setAISetting(interaction.guildId, 'ai_personality', personality);

    const personalityDescriptions = {
        friendly: 'Warm and welcoming responses',
        professional: 'Formal and business-like communication', 
        casual: 'Relaxed and informal conversation',
        funny: 'Humorous and entertaining responses'
    };

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 AI Personality Updated')
        .setDescription(`AI personality has been set to: **${personality}**`)
        .addFields([
            { name: 'Description', value: personalityDescriptions[personality], inline: false }
        ])
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleClear(interaction, client) {
    const userId = interaction.user.id;

    if (conversationHistory.has(userId)) {
        const historyLength = Math.floor(conversationHistory.get(userId).length / 2);
        conversationHistory.delete(userId);
        userCooldowns.delete(userId); // Also clear cooldown

        await interaction.reply({ 
            content: `🧹 Your conversation history and cooldowns have been cleared! (${historyLength} exchanges removed)`, 
            ephemeral: true 
        });
    } else {
        await interaction.reply({ 
            content: '📝 You don\'t have any conversation history to clear.', 
            ephemeral: true 
        });
    }
}

async function handleGame(interaction, client) {
    const gameType = interaction.options.getString('game');
    const game = conversationGames[gameType];

    if (!game) {
        return await interaction.reply({ content: 'Game not found!', ephemeral: true });
    }

    let gameContent = '';

    switch (gameType) {
        case '20questions':
            gameContent = `${game.intro}\n\n*I've chosen something... Ask your first yes/no question!*`;
            break;
        case 'storytelling':
            const randomStarter = game.starters[Math.floor(Math.random() * game.starters.length)];
            gameContent = `${game.intro}\n\n**Story starter:** *${randomStarter}...*\n\nNow you continue!`;
            break;
        case 'wouldyourather':
            const randomQuestion = game.questions[Math.floor(Math.random() * game.questions.length)];
            gameContent = `${game.intro}\n\n**${randomQuestion}**\n\nTell me your choice and why!`;
            break;
        case 'riddles':
            const randomRiddle = game.riddles[Math.floor(Math.random() * game.riddles.length)];
            gameContent = `${game.intro}\n\n**${randomRiddle.question}**\n\nThink carefully!`;
            break;
    }

    const embed = new EmbedBuilder()
        .setColor('#9932CC')
        .setTitle(`🎪 ${game.name} Game Started!`)
        .setDescription(gameContent)
        .setFooter({ text: 'The AI will play along with your responses!' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function getAISettings(client, guildId) {
    try {
        const result = client.db.getAISetting(guildId);
        return {
            enabled: result?.ai_enabled || 0,
            channelId: result?.ai_channel_id || null,
            triggerSymbol: result?.ai_trigger_symbol || '!',
            personality: result?.ai_personality || 'casual'
        };
    } catch (error) {
        console.error('Error getting AI settings:', error);
        return {
            enabled: 0,
            channelId: null,
            triggerSymbol: '!',
            personality: 'casual'
        };
    }
}

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

// ✅ OPTIMIZED: Single API call combining mood detection + AI response
async function getOptimizedAIResponse(message, isSpecialUser, personality, userId, channel) {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Get conversation history
        let userHistory = conversationHistory.get(userId) || [];
        userHistory.push({ role: 'user', content: message });

        if (userHistory.length > MAX_MESSAGES_PER_USER * 2) {
            userHistory = userHistory.slice(-MAX_MESSAGES_PER_USER * 2);
        }

        // Smart context selection
        let contextMessages = userHistory.slice(0, -1);
        let totalTokens = 0;
        let selectedContext = [];

        for (let i = contextMessages.length - 1; i >= 0; i--) {
            const msgTokens = estimateTokens(contextMessages[i].content);
            if (totalTokens + msgTokens < 2500) {
                selectedContext.unshift(contextMessages[i]);
                totalTokens += msgTokens;
            } else {
                break;
            }
        }

        // ✅ Get light channel context (avoid extra API calls)
        let channelContext = '';
        try {
            const recentMessages = await channel.messages.fetch({ limit: 2 });
            channelContext = recentMessages
                .filter(m => !m.author.bot && m.content.length > 0 && m.id !== channel.lastMessageId)
                .map(m => `${m.author.username}: ${m.content.substring(0, 80)}`)
                .reverse()
                .join('\n');
        } catch (error) {
            // If context fetch fails, continue without it
        }

        // ✅ COMBINED: Single prompt for mood detection + response + all features
        let systemPrompt = `You are a helpful AI assistant in a Discord server. You must ALWAYS respond in English only.

Personality: ${personality}
User type: ${isSpecialUser ? 'VIP user - be respectful, polite, and professional' : 'Regular user - be frank, casual, and feel free to crack appropriate jokes'}

Guidelines:
- Analyze the user's mood from their message and respond appropriately
- Keep responses concise (under 1400 characters)
- Be helpful and informative
- ${isSpecialUser ? 'Be respectful, polite, and professional' : 'Be frank, casual, and add humor when appropriate'}
- Always respond in English regardless of input language
- Remember conversation context and refer to previous messages naturally
- Use natural conversation flow and smooth transitions
- Add appropriate emojis based on the detected mood (happy=😊✨, sad=💙🤗, excited=🚀🎉, confused=🤔💭, etc.)
- Avoid controversial topics
- Build engaging dialogue that encourages continued conversation`;

        // Add channel context if available
        if (channelContext.trim()) {
            systemPrompt += `\n\nRecent channel context:\n${channelContext}`;
        }

        // ✅ Add topic transition possibility
        if (Math.random() < 0.15) {
            const transition = topicTransitions[Math.floor(Math.random() * topicTransitions.length)];
            systemPrompt += `\n\nConsider using this natural transition: "${transition}..." if it fits the conversation flow.`;
        }

        // Build messages
        let messages = [{ role: "system", content: systemPrompt }];
        messages = messages.concat(selectedContext);
        messages.push({ role: 'user', content: message });

        // ✅ SINGLE API CALL with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
            try {
                response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: messages,
                    max_tokens: 400, // Reduced to prevent long responses
                    temperature: isSpecialUser ? 0.7 : 0.8 // Slightly reduced creativity
                });
                break; // Success, exit retry loop
            } catch (apiError) {
                retryCount++;
                if (apiError.code === 'rate_limit_exceeded' && retryCount <= maxRetries) {
                    console.log(`Rate limit hit, waiting before retry ${retryCount}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Exponential backoff
                } else {
                    throw apiError; // Re-throw if not rate limit or max retries exceeded
                }
            }
        }

        const aiResponse = response.choices[0].message.content;

        // Add AI response to history
        userHistory.push({ role: 'assistant', content: aiResponse });
        conversationHistory.set(userId, userHistory);

        // Clean up periodically
        if (conversationHistory.size > CLEANUP_THRESHOLD) {
            cleanUpOldConversations();
        }

        return aiResponse.length > 1900 ? aiResponse.substring(0, 1900) + "..." : aiResponse;

    } catch (error) {
        console.error('Optimized AI Error:', error);

        if (error.code === 'invalid_api_key') {
            return "🔑 Invalid OpenAI API key. Please check your credentials.";
        } else if (error.code === 'rate_limit_exceeded') {
            return "🚦 I'm thinking too fast! Please try again in a moment. ⏰";
        } else if (error.code === 'insufficient_quota') {
            return "💳 OpenAI quota exceeded. Please check your billing.";
        } else {
            return "🤖 Something went wrong with my AI processing. Please try again later!";
        }
    }
}

function cleanUpOldConversations() {
    const entries = Array.from(conversationHistory.entries());

    if (entries.length > 100) {
        const keep = entries.slice(-100);
        conversationHistory.clear();
        keep.forEach(([userId, history]) => {
            conversationHistory.set(userId, history);
        });

        // Also clean up cooldowns
        const activeCooldowns = Array.from(userCooldowns.entries())
            .filter(([userId]) => conversationHistory.has(userId));
        userCooldowns.clear();
        activeCooldowns.forEach(([userId, time]) => {
            userCooldowns.set(userId, time);
        });

        console.log(`🧹 Cleaned up old conversations and cooldowns, kept ${keep.length} recent users`);
    }
}
