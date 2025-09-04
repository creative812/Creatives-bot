const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Hardcoded special user ID
const SPECIAL_USER_ID = '1165238276735639572';

// ✅ ENHANCED: Smart conversation memory settings
const MAX_MESSAGES_PER_USER = 150; // Maximum messages to store per user
const CONTEXT_MESSAGES = 50; // Messages to send to AI (recent ones)
const CLEANUP_THRESHOLD = 200; // Clean up when we have this many users

// ✅ NEW: In-memory conversation storage with smart management
const conversationHistory = new Map();

// ✅ NEW: Topic Transitions for natural conversation flow
const topicTransitions = [
    "Speaking of that, it reminds me of",
    "That's interesting! On a related note",
    "I love how that connects to",
    "You know what else is fascinating?",
    "By the way, that reminds me of",
    "Oh, and another thing about this topic",
    "That actually brings up an interesting point about"
];

// ✅ NEW: Interactive Conversation Games
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
            'Would you rather have perfect memory or perfect intuition?',
            'Would you rather be able to speak every language or play every instrument?'
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

// ✅ NEW: Mood-based emoji responses
const moodEmojis = {
    'happy': ['😊', '😄', '🎉', '✨', '🌟'],
    'sad': ['😢', '💙', '🤗', '🌧️', '💔'],
    'excited': ['🚀', '🎆', '⚡', '🔥', '🎊'],
    'frustrated': ['😤', '💆‍♀️', '🧘‍♀️', '🫂', '💪'],
    'confused': ['🤔', '🧐', '💭', '❓', '🔍'],
    'angry': ['😠', '🌊', '🧘‍♀️', '🍃', '☁️'],
    'thoughtful': ['🤔', '💭', '🧠', '📚', '🌙'],
    'neutral': ['😌', '👍', '💫', '🌸', '🎭']
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

        // ✅ Clear conversation memory command
        new SlashCommandBuilder()
            .setName('ai-clear')
            .setDescription('Clear your conversation history with the AI'),

        // ✅ NEW: Interactive conversation games command
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
        const { commandName, guildId, user } = interaction;

        try {
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

    // ✅ ENHANCED: Message handler with advanced conversational features
    async handleMessage(message, client) {
        if (message.author.bot) return;

        const guildId = message.guild?.id;
        if (!guildId) return;

        try {
            const settings = await getAISettings(client, guildId);

            if (!settings.enabled) return;
            if (settings.channelId && message.channel.id !== settings.channelId) return;
            if (!message.content.startsWith(settings.triggerSymbol)) return;

            const userMessage = message.content.slice(settings.triggerSymbol.length).trim();
            if (!userMessage) return;

            await message.channel.sendTyping();

            const isSpecialUser = message.author.id === SPECIAL_USER_ID;
            const personality = settings.personality || 'casual';

            // ✅ NEW: Dynamic Mood Detection
            const userMood = await detectUserMood(userMessage);

            // ✅ NEW: Context-Aware Responses (get recent channel context)
            const channelContext = await getChannelContext(message.channel);

            // ✅ ENHANCED: Get AI response with all new features
            const aiResponse = await getAIResponseWithAllFeatures(
                userMessage, 
                isSpecialUser, 
                personality, 
                message.author.id,
                userMood,
                channelContext
            );

            // ✅ NEW: Multi-Modal Responses with mood-appropriate emojis
            const enhancedResponse = addMultiModalElements(aiResponse, userMood);

            // ✅ NEW: Occasionally suggest interactive games (5% chance)
            if (Math.random() < 0.05) {
                const gameInvite = '\n\n🎮 *Feeling chatty? Try `/ai-game` to start a fun conversation game!*';
                await message.reply(enhancedResponse + gameInvite);
            } else {
                await message.reply(enhancedResponse);
            }

        } catch (error) {
            console.error('AI Message Handler Error:', error);
            try {
                await message.reply('Sorry, I encountered an error while processing your message. Please try again later.');
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};

// ✅ ALL EXISTING HELPER FUNCTIONS (preserved exactly)
async function handleToggle(interaction, client) {
    const enabled = interaction.options.getBoolean('enabled');
    const guildId = interaction.guildId;

    await client.db.setAISetting(guildId, 'ai_enabled', enabled ? 1 : 0);

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00FF00' : '#FF9900')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI chat has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleChannel(interaction, client) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    if (!channel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Channel')
            .setDescription('Please select a text channel for AI responses.')
            .setTimestamp();
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await client.db.setAISetting(guildId, 'ai_channel_id', channel.id);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI will now respond in ${channel}.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleSymbol(interaction, client) {
    const symbol = interaction.options.getString('symbol');
    const guildId = interaction.guildId;

    await client.db.setAISetting(guildId, 'ai_trigger_symbol', symbol);

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
    const guildId = interaction.guildId;
    const settings = await getAISettings(client, guildId);

    const channel = settings.channelId ? `<#${settings.channelId}>` : 'Any channel';
    const statusColor = settings.enabled ? '#00FF00' : '#FF0000';
    const statusText = settings.enabled ? '✅ Enabled' : '❌ Disabled';

    // Get memory stats for this user
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
            { name: 'Total Users', value: `${conversationHistory.size} with history`, inline: true },
            { name: '🎭 Enhanced Features', value: '• Dynamic mood detection\n• Context-aware responses\n• Topic transitions\n• Interactive games', inline: false },
            { name: 'Usage', value: `Type \`${settings.triggerSymbol}your message\` in ${channel} to chat with AI`, inline: false }
        ])
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleReset(interaction, client) {
    const guildId = interaction.guildId;

    await client.db.setAISetting(guildId, 'ai_enabled', 0);
    await client.db.setAISetting(guildId, 'ai_channel_id', null);
    await client.db.setAISetting(guildId, 'ai_trigger_symbol', '!');
    await client.db.setAISetting(guildId, 'ai_personality', 'casual');

    const embed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('🤖 AI Settings Reset')
        .setDescription('All AI settings have been reset to default values.')
        .addFields([
            { name: 'Status', value: '❌ Disabled', inline: true },
            { name: 'Channel', value: 'Any channel', inline: true },
            { name: 'Trigger Symbol', value: '`!`', inline: true },
            { name: 'Personality', value: 'casual', inline: true }
        ])
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handlePersonality(interaction, client) {
    const personality = interaction.options.getString('type');
    const guildId = interaction.guildId;

    await client.db.setAISetting(guildId, 'ai_personality', personality);

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
        await interaction.reply({ 
            content: `🧹 Your conversation history has been cleared! (${historyLength} exchanges removed)\nThe AI will start fresh with no memory of our previous conversations.`, 
            ephemeral: true 
        });
    } else {
        await interaction.reply({ 
            content: '📝 You don\'t have any conversation history to clear.', 
            ephemeral: true 
        });
    }
}

// ✅ NEW: Handle interactive conversation games
async function handleGame(interaction, client) {
    const gameType = interaction.options.getString('game');
    const game = conversationGames[gameType];

    if (!game) {
        return await interaction.reply({ content: 'Game not found!', ephemeral: true });
    }

    let gameContent = '';

    switch (gameType) {
        case '20questions':
            const randomItem = game.items[Math.floor(Math.random() * game.items.length)];
            // Store the answer in the user's conversation context
            gameContent = `${game.intro}\n\n*I've chosen something... Ask your first yes/no question!*`;
            break;

        case 'storytelling':
            const randomStarter = game.starters[Math.floor(Math.random() * game.starters.length)];
            gameContent = `${game.intro}\n\n**Story starter:** *${randomStarter}...*\n\nNow you continue the story!`;
            break;

        case 'wouldyourather':
            const randomQuestion = game.questions[Math.floor(Math.random() * game.questions.length)];
            gameContent = `${game.intro}\n\n**${randomQuestion}**\n\nTell me your choice and why!`;
            break;

        case 'riddles':
            const randomRiddle = game.riddles[Math.floor(Math.random() * game.riddles.length)];
            gameContent = `${game.intro}\n\n**${randomRiddle.question}**\n\nThink carefully and give me your answer!`;
            break;
    }

    const embed = new EmbedBuilder()
        .setColor('#9932CC')
        .setTitle(`🎪 ${game.name} Game Started!`)
        .setDescription(gameContent)
        .setFooter({ text: 'Have fun! The AI will play along with your responses.' })
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

// ✅ NEW: Dynamic Mood Detection
async function detectUserMood(message) {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Analyze the mood/sentiment of this message. Respond with only one word: happy, sad, excited, frustrated, confused, neutral, angry, or thoughtful."
                },
                { role: "user", content: message }
            ],
            max_tokens: 10,
            temperature: 0.3
        });

        return response.choices[0].message.content.toLowerCase().trim();
    } catch (error) {
        console.error('Mood detection error:', error);
        return 'neutral';
    }
}

// ✅ NEW: Context-Aware Responses (get recent channel context)
async function getChannelContext(channel) {
    try {
        const recentMessages = await channel.messages.fetch({ limit: 3 });
        const context = recentMessages
            .filter(m => !m.author.bot && m.content.length > 0)
            .map(m => `${m.author.username}: ${m.content.substring(0, 100)}`)
            .reverse()
            .join('\n');

        return context || '';
    } catch (error) {
        console.error('Context fetch error:', error);
        return '';
    }
}

// ✅ NEW: Multi-Modal Responses with mood-appropriate elements
function addMultiModalElements(response, mood) {
    const emojis = moodEmojis[mood] || moodEmojis['neutral'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    // Add mood-appropriate emoji with 70% chance
    if (Math.random() < 0.7) {
        return `${response} ${randomEmoji}`;
    }

    return response;
}

// ✅ NEW: Topic Transitions for natural conversation flow
function addTopicTransition() {
    if (Math.random() < 0.15) { // 15% chance to add transition
        const transition = topicTransitions[Math.floor(Math.random() * topicTransitions.length)];
        return `\n\n${transition}... `;
    }
    return '';
}

// ✅ ENHANCED: AI Response with All New Features
async function getAIResponseWithAllFeatures(message, isSpecialUser, personality, userId, userMood, channelContext) {
    try {
        const OpenAI = require('openai');

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Get or create conversation history for this user
        let userHistory = conversationHistory.get(userId) || [];

        // Add current user message to history
        userHistory.push({ role: 'user', content: message });

        // Keep maximum messages per user
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

        // ✅ ENHANCED: System prompt with mood awareness and context
        let systemPrompt = `You are a helpful AI assistant in a Discord server. You must ALWAYS respond in English only.

Personality: ${personality}
User type: ${isSpecialUser ? 'VIP user - be respectful, polite, and professional' : 'Regular user - be frank, casual, and feel free to crack appropriate jokes'}
User's current mood: ${userMood}

Guidelines:
- Keep responses concise (under 1400 characters)
- Be helpful and informative
- ${isSpecialUser ? 'Be respectful, polite, and professional' : 'Be frank, casual, and add humor when appropriate'}
- Respond to the user's ${userMood} mood appropriately
- Always respond in English regardless of input language
- Remember the conversation context and refer to previous messages naturally
- Use natural conversation flow and transitions
- Avoid controversial topics
- Build engaging dialogue that encourages continued conversation`;

        // Add channel context if available
        if (channelContext.trim()) {
            systemPrompt += `\n\nRecent channel context:\n${channelContext}`;
        }

        // ✅ NEW: Add topic transition possibility
        const topicTransition = addTopicTransition();
        if (topicTransition) {
            systemPrompt += `\n\nConsider using this natural transition: "${topicTransition.trim()}" if appropriate for continuing the conversation.`;
        }

        // Build messages for OpenAI
        let messages = [
            { role: "system", content: systemPrompt }
        ];

        messages = messages.concat(selectedContext);
        messages.push({ role: 'user', content: message });

        // Call OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 500,
            temperature: isSpecialUser ? 0.7 : 0.9
        });

        const aiResponse = response.choices[0].message.content;

        // Add AI response to conversation history
        userHistory.push({ role: 'assistant', content: aiResponse });

        // Update conversation history
        conversationHistory.set(userId, userHistory);

        // Clean up old conversations periodically
        if (conversationHistory.size > CLEANUP_THRESHOLD) {
            cleanUpOldConversations();
        }

        return aiResponse.length > 1900 ? aiResponse.substring(0, 1900) + "..." : aiResponse;

    } catch (error) {
        console.error('OpenAI Error:', error);

        if (error.code === 'invalid_api_key') {
            return "🔑 Invalid OpenAI API key. Please check your credentials.";
        } else if (error.code === 'rate_limit_exceeded') {
            return "🚦 Rate limit exceeded. Please try again in a moment.";
        } else if (error.code === 'insufficient_quota') {
            return "💳 OpenAI quota exceeded. Please check your billing.";
        } else if (error.message?.includes('API_KEY')) {
            return "🔑 My AI brain needs proper credentials. Please check the OpenAI API key configuration.";
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
        console.log(`🧹 Cleaned up old conversations, kept ${keep.length} recent users`);
        console.log(`💾 Total messages in memory: ${Array.from(conversationHistory.values()).reduce((total, hist) => total + hist.length, 0)}`);
    }
}
