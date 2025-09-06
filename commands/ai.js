const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Hardcoded special user ID
const SPECIAL_USER_ID = '1165238276735639572';

// ✅ ENHANCED: Smart conversation memory settings
const MAX_MESSAGES_PER_USER = 150;
const CONTEXT_MESSAGES = 50;
const CLEANUP_THRESHOLD = 200;

// ✅ NEW: In-memory conversation storage with smart management
const conversationHistory = new Map();
const userCooldowns = new Map();
const activeGames = new Map(); // Track active games per user

// ✅ NEW: Topic Transitions & Games
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

// ✅ EXPORTED FUNCTIONS for messageCreate.js to use
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

// ✅ ENHANCED: AI Response with Game State Integration
async function getAIResponseWithAllFeatures(message, isSpecialUser, personality, userId, channel) {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Rate limiting per user
        const now = Date.now();
        const lastRequest = userCooldowns.get(userId) || 0;
        if (now - lastRequest < 3000) {
            return "⏰ Please wait a moment before sending another message.";
        }
        userCooldowns.set(userId, now);

        // ✅ CHECK FOR ACTIVE GAME
        const activeGame = activeGames.get(userId);
        let gameContext = '';
        if (activeGame) {
            gameContext = `\n\nACTIVE GAME CONTEXT: The user is currently playing ${activeGame.type}. `;
            switch (activeGame.type) {
                case '20questions':
                    gameContext += `You're thinking of "${activeGame.answer}". The user is asking question #${activeGame.guesses + 1}. Answer only YES or NO, and give a hint if they're close. If they guess correctly, congratulate them and end the game.`;
                    activeGame.guesses++;
                    break;
                case 'storytelling':
                    gameContext += `Story so far: "${activeGame.story}" The user is continuing the story. Add their contribution and continue the narrative naturally.`;
                    activeGame.story += ' ' + message;
                    break;
                case 'wouldyourather':
                    gameContext += `The question was: "${activeGame.question}" The user is sharing their choice. Respond to their reasoning and maybe ask a follow-up question about their choice.`;
                    activeGames.delete(userId); // End game after one response
                    break;
                case 'riddles':
                    gameContext += `The riddle was: "${activeGame.riddle.question}" and the answer is "${activeGame.riddle.answer}". Check if their answer is correct and respond accordingly.`;
                    activeGames.delete(userId); // End game after one attempt
                    break;
            }
        }

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
            if (totalTokens + msgTokens < 2000) {
                selectedContext.unshift(contextMessages[i]);
                totalTokens += msgTokens;
            } else {
                break;
            }
        }

        // Get light channel context
        let channelContext = '';
        try {
            const recentMessages = await channel.messages.fetch({ limit: 2 });
            channelContext = recentMessages
                .filter(m => !m.author.bot && m.content.length > 0 && m.id !== channel.lastMessageId)
                .map(m => `${m.author.username}: ${m.content.substring(0, 80)}`)
                .reverse()
                .join('\n');
        } catch (error) {
            // Continue without context if fetch fails
        }

        // ✅ ENHANCED: System prompt with game context
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
- Add appropriate emojis based on detected mood (happy=😊✨, sad=💙🤗, excited=🚀🎉, confused=🤔💭, etc.)
- Avoid controversial topics
- Build engaging dialogue that encourages continued conversation${gameContext}`;

        if (channelContext.trim()) {
            systemPrompt += `\n\nRecent channel context:\n${channelContext}`;
        }

        if (Math.random() < 0.15 && !activeGame) {
            const transition = topicTransitions[Math.floor(Math.random() * topicTransitions.length)];
            systemPrompt += `\n\nConsider using this natural transition: "${transition}..." if it fits the conversation flow.`;
        }

        // Build messages
        let messages = [{ role: "system", content: systemPrompt }];
        messages = messages.concat(selectedContext);
        messages.push({ role: 'user', content: message });

        // API call with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
            try {
                response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: messages,
                    max_tokens: 400,
                    temperature: isSpecialUser ? 0.7 : 0.8
                });
                break;
            } catch (apiError) {
                retryCount++;
                if (apiError.code === 'rate_limit_exceeded' && retryCount <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                } else {
                    throw apiError;
                }
            }
        }

        const aiResponse = response.choices[0].message.content;

        // Add to history
        userHistory.push({ role: 'assistant', content: aiResponse });
        conversationHistory.set(userId, userHistory);

        // Cleanup
        if (conversationHistory.size > CLEANUP_THRESHOLD) {
            cleanUpOldConversations();
        }

        return aiResponse.length > 1900 ? aiResponse.substring(0, 1900) + "..." : aiResponse;

    } catch (error) {
        console.error('AI Error:', error);
        if (error.code === 'rate_limit_exceeded') {
            return "🚦 I'm thinking too fast! Please try again in a moment.";
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

        // Also clean up cooldowns and games for removed users
        const activeCooldowns = Array.from(userCooldowns.entries())
            .filter(([userId]) => conversationHistory.has(userId));
        userCooldowns.clear();
        activeCooldowns.forEach(([userId, time]) => {
            userCooldowns.set(userId, time);
        });

        const activeGameEntries = Array.from(activeGames.entries())
            .filter(([userId]) => conversationHistory.has(userId));
        activeGames.clear();
        activeGameEntries.forEach(([userId, game]) => {
            activeGames.set(userId, game);
        });

        console.log(`🧹 Cleaned up conversations, kept ${keep.length} recent users`);
    }
}

// ✅ SLASH COMMAND HANDLERS
async function handleToggle(interaction, client) {
    try {
        const enabled = interaction.options.getBoolean('enabled');
        await client.db.setAISetting(interaction.guildId, 'ai_enabled', enabled ? 1 : 0);
        const embed = new EmbedBuilder()
            .setColor(enabled ? '#00FF00' : '#FF9900')
            .setTitle('🤖 AI Chat Settings')
            .setDescription(`AI chat has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Toggle error:', error);
        await interaction.editReply({ content: 'Error updating AI toggle setting.' });
    }
}

async function handleChannel(interaction, client) {
    try {
        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Channel')
                .setDescription('Please select a text channel for AI responses.')
                .setTimestamp();
            return await interaction.editReply({ embeds: [embed] });
        }

        await client.db.setAISetting(interaction.guildId, 'ai_channel_id', channel.id);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🤖 AI Chat Settings')
            .setDescription(`AI will now respond in ${channel}.`)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Channel error:', error);
        await interaction.editReply({ content: 'Error updating AI channel setting.' });
    }
}

async function handleSymbol(interaction, client) {
    try {
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
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Symbol error:', error);
        await interaction.editReply({ content: 'Error updating AI trigger symbol.' });
    }
}

async function handleStatus(interaction, client) {
    try {
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
                { name: '🎭 Enhanced Features', value: '• Advanced mood detection\n• Context-aware responses\n• Natural topic transitions\n• Interactive games', inline: false }
            ])
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Status error:', error);
        await interaction.editReply({ content: 'Error retrieving AI status.' });
    }
}

async function handleReset(interaction, client) {
    try {
        await client.db.setAISetting(interaction.guildId, 'ai_enabled', 0);
        await client.db.setAISetting(interaction.guildId, 'ai_channel_id', null);
        await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', '!');
        await client.db.setAISetting(interaction.guildId, 'ai_personality', 'casual');

        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('🤖 AI Settings Reset')
            .setDescription('All AI settings have been reset to default values.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Reset error:', error);
        await interaction.editReply({ content: 'Error resetting AI settings.' });
    }
}

async function handlePersonality(interaction, client) {
    try {
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
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Personality error:', error);
        await interaction.editReply({ content: 'Error updating AI personality.' });
    }
}

async function handleClear(interaction, client) {
    try {
        const userId = interaction.user.id;
        if (conversationHistory.has(userId)) {
            const historyLength = Math.floor(conversationHistory.get(userId).length / 2);
            conversationHistory.delete(userId);
            userCooldowns.delete(userId);
            activeGames.delete(userId);

            await interaction.editReply({ 
                content: `🧹 Your conversation history and active games have been cleared! (${historyLength} exchanges removed)\nThe AI will start fresh with no memory of our previous conversations.`
            });
        } else {
            await interaction.editReply({ 
                content: '📝 You don\'t have any conversation history to clear.'
            });
        }
    } catch (error) {
        console.error('Clear error:', error);
        await interaction.editReply({ content: 'Error clearing conversation history.' });
    }
}

// ✅ ENHANCED: Game handler with state tracking
async function handleGame(interaction, client) {
    try {
        const gameType = interaction.options.getString('game');
        const game = conversationGames[gameType];
        if (!game) {
            return await interaction.editReply({ content: 'Game not found!' });
        }

        let gameContent = '';
        let gameState = { type: gameType, step: 1 };

        switch (gameType) {
            case '20questions':
                const randomItem = game.items[Math.floor(Math.random() * game.items.length)];
                gameState.answer = randomItem;
                gameState.guesses = 0;
                gameContent = `${game.intro}\n\n*I've chosen something... Ask your first yes/no question!*\n\n**Hint:** Use your trigger symbol (like \`!\`) before your question so I can respond!`;
                break;

            case 'storytelling':
                const randomStarter = game.starters[Math.floor(Math.random() * game.starters.length)];
                gameState.story = randomStarter;
                gameContent = `${game.intro}\n\n**Story starter:** *${randomStarter}...*\n\n**Your turn:** Continue the story using your trigger symbol (like \`!your continuation\`)!`;
                break;

            case 'wouldyourather':
                const randomQuestion = game.questions[Math.floor(Math.random() * game.questions.length)];
                gameState.question = randomQuestion;
                gameContent = `${game.intro}\n\n**${randomQuestion}**\n\n**Tell me:** Use your trigger symbol (like \`!I choose flying because...\`) to share your choice and reasoning!`;
                break;

            case 'riddles':
                const randomRiddle = game.riddles[Math.floor(Math.random() * game.riddles.length)];
                gameState.riddle = randomRiddle;
                gameContent = `${game.intro}\n\n**${randomRiddle.question}**\n\n**Your answer:** Use your trigger symbol (like \`!echo\`) to give your answer!`;
                break;
        }

        // ✅ STORE GAME STATE for this user
        activeGames.set(interaction.user.id, gameState);

        const embed = new EmbedBuilder()
            .setColor('#9932CC')
            .setTitle(`🎪 ${game.name} Game Started!`)
            .setDescription(gameContent)
            .setFooter({ text: 'Remember to use your AI trigger symbol so I can respond to your game moves!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Game error:', error);
        await interaction.editReply({ content: 'Error starting game.' });
    }
}

// ✅ ROBUST: Main module export with complete duplicate protection
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

    // ✅ BULLETPROOF: Interaction handler with complete duplicate protection
    async execute(interaction, client) {
        // ✅ PREVENT DUPLICATE PROCESSING with unique lock per interaction
        const lockKey = `ai_interaction_${interaction.id}`;
        if (client.processingLocks?.has(lockKey)) {
            console.log('🔒 [ai.js] Duplicate interaction detected, ignoring');
            return;
        }
        client.processingLocks?.set(lockKey, Date.now());

        try {
            // ✅ SAFE DEFER: Only defer if not already deferred/replied
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
                console.log('🟢 [ai.js] Successfully deferred interaction:', interaction.commandName);
            } else {
                console.log('⚠️ [ai.js] Interaction already deferred/replied, skipping:', interaction.commandName);
                client.processingLocks?.delete(lockKey);
                return;
            }
        } catch (deferError) {
            console.error('❌ [ai.js] Failed to defer interaction:', deferError.message);
            client.processingLocks?.delete(lockKey);
            return;
        }

        const { commandName } = interaction;

        try {
            // ✅ COMMAND ROUTING with comprehensive error handling
            switch (commandName) {
                case 'ai-toggle': 
                    await handleToggle(interaction, client); 
                    break;
                case 'ai-channel': 
                    await handleChannel(interaction, client); 
                    break;
                case 'ai-symbol': 
                    await handleSymbol(interaction, client); 
                    break;
                case 'ai-status': 
                    await handleStatus(interaction, client); 
                    break;
                case 'ai-reset': 
                    await handleReset(interaction, client); 
                    break;
                case 'ai-personality': 
                    await handlePersonality(interaction, client); 
                    break;
                case 'ai-clear': 
                    await handleClear(interaction, client); 
                    break;
                case 'ai-game': 
                    await handleGame(interaction, client); 
                    break;
                default:
                    await interaction.editReply({ 
                        content: '❌ Unknown AI command. Please try again or contact support.' 
                    });
            }

            console.log('✅ [ai.js] Successfully processed command:', commandName);

        } catch (commandError) {
            console.error('❌ [ai.js] Error executing command:', commandName, commandError);

            try {
                // ✅ SAFE ERROR RESPONSE: Only respond if we haven't replied yet
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ 
                        content: '❌ An error occurred while processing your AI command. Please try again later.'
                    });
                } else if (!interaction.replied) {
                    await interaction.followUp({ 
                        content: '❌ An error occurred while processing your AI command. Please try again later.',
                        ephemeral: true 
                    });
                }
            } catch (replyError) {
                console.error('❌ [ai.js] Failed to send error response:', replyError.message);
            }
        } finally {
            // ✅ CLEANUP: Always remove the processing lock
            client.processingLocks?.delete(lockKey);
        }
    },

    // ✅ EXPORT FUNCTIONS for messageCreate.js
    getAISettings: getAISettings,
    getAIResponseWithAllFeatures: getAIResponseWithAllFeatures
};
