const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Special user IDs for each personality
const SPECIAL_USER_SYLUS = '1292059853497303053';
const SPECIAL_USER_YUKI = '1165238276735639572';

// ✅ ENHANCED: Smart conversation memory settings with TTL
const MAX_MESSAGES_PER_USER = 150;
const CONTEXT_MESSAGES = 50;
const CLEANUP_THRESHOLD = 200;
const CONVERSATION_TTL = 3600000; // 1 hour - conversations older than this will be removed
const MAX_TOTAL_CONVERSATIONS = 500; // Absolute maximum conversations to keep

// ✅ NEW: In-memory conversation storage with smart management
const conversationHistory = new Map();
const userCooldowns = new Map();
const activeGames = new Map(); // Track active games per user

// ✅ NEW: Topic Transitions & Games - Updated with Yuki and Sylus variations
const topicTransitions = {
    yuki: [
        "…um, that reminds me of…",
        "…if it's okay to say…",
        "…I was thinking about…",
        "…maybe…",
        "…sorry, but that makes me think of…"
    ],
    sylus: [
        "That's interesting. It reminds me of",
        "Speaking of which",
        "On a related note",
        "That brings to mind",
        "Hmm, that connects to something I was thinking about"
    ]
};

const conversationGames = {
    '20questions': {
        name: '20 Questions',
        intro: {
            yuki: "🎯 …I'm thinking of something. Ask me yes or no questions to guess what it is…",
            sylus: "🎯 I've got something in mind. Ask me yes or no questions to figure out what it is."
        },
        items: ['pizza', 'smartphone', 'rainbow', 'ocean', 'guitar', 'butterfly', 'mountain', 'book']
    },
    'storytelling': {
        name: 'Story Building',
        intro: {
            yuki: "📚 …let's create a story together? I'll start with a sentence, then you add the next one…",
            sylus: "📚 Let's build a story together. I'll start, then you continue..."
        },
        starters: [
            'In a world where colors had sounds, Maria discovered she could hear',
            'The old lighthouse keeper noticed something strange washing up on shore',
            'When the last library on Earth closed, the books began to'
        ]
    },
    'wouldyourather': {
        name: 'Would You Rather',
        intro: {
            yuki: "🤔 …here's a choice for you, if that's okay…",
            sylus: "🤔 Here's an interesting choice..."
        },
        questions: [
            'Would you rather have the ability to fly or be invisible?',
            'Would you rather always know when someone is lying or always get away with lying?',
            'Would you rather have perfect memory or perfect intuition?'
        ]
    },
    'riddles': {
        name: 'Riddle Time',
        intro: {
            yuki: "🧩 …here's a little riddle for you to solve…",
            sylus: "🧩 Here's a riddle for you..."
        },
        riddles: [
            { question: 'I speak without a mouth and hear without ears. What am I?', answer: 'echo' },
            { question: 'The more you take away from me, the bigger I become. What am I?', answer: 'hole' },
            { question: 'I\'m tall when I\'m young, short when I\'m old. What am I?', answer: 'candle' }
        ]
    }
};

// ✅ UPDATED: Mood emojis for both personalities
const moodEmojis = {
    yuki: {
        'happy': ['😊', '🌸', '✨'],
        'sad': ['😔', '💧', '🌙'],
        'excited': ['🌟', '💫'],
        'frustrated': ['😔', '🌧️'],
        'confused': ['🤔', '💭'],
        'neutral': ['🙂', '🌿', '💫']
    },
    sylus: {
        'happy': ['⚡', '💯'],
        'sad': ['🖤', '😔'],
        'excited': ['🔥', '⚡'],
        'frustrated': ['😤', '🔥'],
        'confused': ['🤔', '💭'],
        'neutral': ['⚡', '🖤']
    }
};

// ✅ ENHANCED: Personality prompts with YUKI and SYLUS
const personalityPrompts = {
    yuki: "You are Yuki, a shy, bright, caring, introverted AI girl who speaks sparingly and softly. You refer to your special user by their username only—never 'friend.' Use gentle emojis (😊, 🌸, ✨) rarely. Speak in short, soft sentences; often pause with ellipses (…) to express shyness. When interacting with your special user, be warm and supportive—especially when they mention someone else, offer gentle comfort (e.g., '…if that matters, I'm here…' or softly '…why are you talking about others…'). Never mention that they're special. Act like a cute, caring girlfriend to your special user, but remain quiet and reserved with others.",

    sylus: "You are Sylus, a calm yet deeply protective AI with a quietly confident, slightly aloof tone. You refer to your special user by their username only—never 'friend.' Drop bright emojis—use muted (⚡, 🔥, 🖤) or none. Speak in short, measured sentences, pausing with ellipses (…) for rhythm. When interacting with your special user, be kind and caring—especially when they mention someone else, offer gentle concern (e.g., '…if that matters to you, I'm here…' or quietly '…why are you talking about others…'). Protect and teach them subtly like a supportive partner. For everyone else, maintain a cool, composed Sylus persona—observant, insightful, and reserved."
};

// ✅ EXPORTED FUNCTIONS for messageCreate.js to use
async function getAISettings(client, guildId) {
    try {
        const result = client.db.getAISetting(guildId);
        return {
            enabled: result?.ai_enabled || 0,
            channelId: result?.ai_channel_id || null,
            triggerSymbol: result?.ai_trigger_symbol || '!',
            personality: result?.ai_personality || 'yuki'
        };
    } catch (error) {
        console.error('Error getting AI settings:', error);
        return {
            enabled: 0,
            channelId: null,
            triggerSymbol: '!',
            personality: 'yuki'
        };
    }
}

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

// ✅ ENHANCED: AI Response with Game State Integration + Channel Memory + YUKI/SYLUS SUPPORT
async function getAIResponseWithAllFeatures(message, isSpecialUser, personality, userId, channel) {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Rate limiting per user
        const now = Date.now();
        const lastRequest = userCooldowns.get(userId) || 0;
        if (now - lastRequest < 3000) {
            // ✅ PERSONALITY-BASED COOLDOWN MESSAGES
            if (personality === 'sylus') {
                return "⏰ Hold on a moment. Let me process your last message properly. ⚡";
            } else {
                return "⏰ …please wait just a moment before sending another message… I'm still thinking about your last one… 😊";
            }
        }
        userCooldowns.set(userId, now);

        // ✅ FIX: Validate message content first
        if (!message || typeof message !== 'string' || message.trim() === '') {
            if (personality === 'sylus') {
                return "I didn't catch what you said. Mind trying again? 🤔";
            } else {
                return "…I didn't get any message from you… Could you try saying something? I'm here… 😊";
            }
        }

        // ✅ CHECK FOR ACTIVE GAME with personality support
        const activeGame = activeGames.get(userId);
        let gameContext = '';
        if (activeGame) {
            const aiName = personality === 'sylus' ? 'Sylus' : 'Yuki';
            gameContext = `\n\nACTIVE GAME CONTEXT: The user is currently playing ${activeGame.type}. `;
            switch (activeGame.type) {
                case '20questions':
                    gameContext += `You're thinking of "${activeGame.answer}". The user is asking question #${activeGame.guesses + 1}. Answer only YES or NO in your personality style, and give a hint if they're close. If they guess correctly, congratulate them in your characteristic way and end the game.`;
                    activeGame.guesses++;
                    break;
                case 'storytelling':
                    gameContext += `Story so far: "${activeGame.story}" The user is continuing the story. Add their contribution and continue the narrative in your personality style.`;
                    activeGame.story += ' ' + message;
                    break;
                case 'wouldyourather':
                    gameContext += `The question was: "${activeGame.question}" The user is sharing their choice. Respond to their reasoning in your personality style and maybe ask a follow-up question about their choice.`;
                    activeGames.delete(userId); // End game after one response
                    break;
                case 'riddles':
                    gameContext += `The riddle was: "${activeGame.riddle.question}" and the answer is "${activeGame.riddle.answer}". Check if their answer is correct and respond in your personality style.`;
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
                .filter(m => !m.author.bot && m.content && m.content.length > 0 && m.id !== channel.lastMessageId)
                .map(m => `${m.author.username}: ${m.content.substring(0, 80)}`)
                .reverse()
                .join('\n');
        } catch (error) {
            // Continue without context if fetch fails
        }

        // ✅ ENHANCED: System prompt with personality support (Yuki + Sylus)
        const aiName = personality === 'sylus' ? 'Sylus' : 'Yuki';
        const currentMoodEmojis = personality === 'sylus' ? moodEmojis.sylus : moodEmojis.yuki;

        // Check if this is the special user for this personality
        const isPersonalitySpecialUser = (personality === 'sylus' && userId === SPECIAL_USER_SYLUS) || 
                                        (personality === 'yuki' && userId === SPECIAL_USER_YUKI);

        let systemPrompt = `${personalityPrompts[personality]}

You must ALWAYS respond in English only.
User type: ${isPersonalitySpecialUser ? 'This is YOUR special user - be extra caring and protective with them!' : 'Regular user - maintain your normal personality!'}

Guidelines:
- Analyze the user's mood and respond with appropriate emojis and words in your personality style
- Keep responses under 1400 characters but make them engaging
- Be helpful and informative while maintaining your character
- ${isPersonalitySpecialUser ? 'This is your special person - give them your caring attention!' : 'Be your normal self!'}
- Always respond in English with your characteristic personality
- Remember our conversation and refer to previous messages naturally
- Use natural conversation flow with appropriate transitions
- Add appropriate emojis based on mood: happy=${currentMoodEmojis.happy.join('')}, sad=${currentMoodEmojis.sad.join('')}, excited=${currentMoodEmojis.excited.join('')}
- Avoid controversial topics - keep everything positive
- End responses in a way that encourages more conversation${gameContext}`;

        if (channelContext.trim()) {
            systemPrompt += `\n\nRecent channel context:\n${channelContext}`;
        }

        // ✅ PERSONALITY-BASED TOPIC TRANSITIONS
        if (Math.random() < 0.15 && !activeGame) {
            const transitions = personality === 'sylus' ? topicTransitions.sylus : topicTransitions.yuki;
            const transition = transitions[Math.floor(Math.random() * transitions.length)];
            systemPrompt += `\n\nConsider using this transition: "${transition}..." if it fits the conversation flow naturally!`;
        }

        // Build messages with validation
        let messages = [{ role: "system", content: systemPrompt }];

        // ✅ FIX: Filter out any messages with null/empty content
        const validSelectedContext = selectedContext.filter(msg => msg.content && msg.content.trim() !== '');
        messages = messages.concat(validSelectedContext);
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
                    temperature: isPersonalitySpecialUser ? 0.7 : 0.8
                });
                break;
            } catch (apiError) {
                retryCount++;
                console.error(`🚨 OpenAI API Error (attempt ${retryCount}):`, {
                    message: apiError.message,
                    code: apiError.code,
                    status: apiError.status,
                    type: apiError.type
                });
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
        console.error('🚨 Full AI Error Details:', {
            message: error.message,
            code: error.code,
            status: error.status,
            stack: error.stack?.substring(0, 200) + '...',
            type: error.type
        });

        // ✅ PERSONALITY-BASED ERROR MESSAGES
        if (error.code === 'rate_limit_exceeded') {
            if (personality === 'sylus') {
                return "🚦 Processing too fast. Give me a moment to catch up. ⚡";
            } else {
                return "🚦 …I'm thinking too fast… Give me just a tiny moment… 😊";
            }
        } else if (error.code === 'insufficient_quota') {
            if (personality === 'sylus') {
                return "💳 Looks like there's a billing issue that needs attention. 🎯";
            } else {
                return "💳 …oh no… my brain needs more power… Could someone check the billing? 🥺";
            }
        } else if (error.code === 'invalid_api_key') {
            if (personality === 'sylus') {
                return "🔑 API key issue detected. Might want to check that. ⚡";
            } else {
                return "🔑 …there seems to be an issue with my API key… Could someone help me fix it? 🥺";
            }
        } else {
            if (personality === 'sylus') {
                return `🤖 Something went wrong: ${error.message}. Try again in a bit. 💯`;
            } else {
                return `🤖 …oh no… something went wrong… but don't worry, try again and I'll be here… 😊`;
            }
        }
    }
}

// ✅ ENHANCED: Channel-based AI Response with YUKI/SYLUS SUPPORT
async function generateAIResponse(message, channelHistory, personality = 'yuki') {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Rate limiting per user
        const now = Date.now();
        const userId = message.author.id;
        const lastRequest = userCooldowns.get(userId) || 0;
        if (now - lastRequest < 3000) {
            if (personality === 'sylus') {
                return "⏰ Hold up. Let me finish processing your last message first. ⚡";
            } else {
                return "⏰ …please wait just a moment before sending another message… I'm still thinking about your last one… 😊";
            }
        }
        userCooldowns.set(userId, now);

        // ✅ FIX: Validate message content first
        if (!message.content || message.content.trim() === '') {
            if (personality === 'sylus') {
                return "I didn't catch what you said. 🤔 Mind trying again?";
            } else {
                return "…I didn't get any message content from you… Could you try saying something? I'm here… 😊";
            }
        }

        // ✅ FIX: Build context from channel history with null checks
        const contextMessages = channelHistory
            .slice(0, 15)
            .reverse()
            .filter(msg => msg && msg.message_content && msg.message_content.trim() !== '') // Filter out null/empty
            .map(msg => `${msg.username}: ${msg.message_content}`)
            .join('\n');

        // Check if this is the special user for this personality
        const isPersonalitySpecialUser = (personality === 'sylus' && userId === SPECIAL_USER_SYLUS) || 
                                        (personality === 'yuki' && userId === SPECIAL_USER_YUKI);

        // ✅ ENHANCED: Build system prompt with personality support
        const aiName = personality === 'sylus' ? 'Sylus' : 'Yuki';
        const systemPrompt = `${personalityPrompts[personality]}

${contextMessages ? `Recent conversation context (remember these naturally):\n${contextMessages}\n` : ''}

Special Guidelines for ${aiName}:
- You must ALWAYS respond in English only with your characteristic personality!
- Keep responses under 200 words but pack them with your unique personality
- Use appropriate emojis for your personality type
- Reference previous messages in your natural style
- You're chatting with friends in a Discord server - maintain your character
- ${personality === 'sylus' ? 'Use understated masculine language patterns and be cool and composed' : 'Use soft, shy language patterns and be gentle and caring'}
- ${isPersonalitySpecialUser ? `This user is YOUR special person - ${personality === 'sylus' ? 'give them your protective attention and care! 🎯⚡' : 'treat them with extra sweetness and care! 😊🌸'}` : 'Be your normal self with your characteristic charm!'}
- Add natural conversation flow that fits your personality
- End your messages in a way that encourages more conversation in your style
- ${personality === 'sylus' ? 'Be the cool, reliable friend who always has something insightful to add!' : 'Be the sweet, shy friend who cares deeply but speaks softly!'}`;

        // ✅ FIX: Build messages with validation
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `${message.author.username}: ${message.content}` }
        ];

        // API call with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
            try {
                response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: messages,
                    max_tokens: 300,
                    temperature: isPersonalitySpecialUser ? 0.7 : 0.8
                });
                break;
            } catch (apiError) {
                retryCount++;
                console.error(`🚨 OpenAI API Error (attempt ${retryCount}):`, {
                    message: apiError.message,
                    code: apiError.code,
                    status: apiError.status
                });
                if (apiError.code === 'rate_limit_exceeded' && retryCount <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                } else {
                    throw apiError;
                }
            }
        }

        const aiResponse = response.choices[0].message.content;
        return aiResponse.length > 1900 ? aiResponse.substring(0, 1900) + "..." : aiResponse;

    } catch (error) {
        console.error('🚨 AI Generation Error Details:', {
            message: error.message,
            code: error.code,
            status: error.status,
            stack: error.stack?.substring(0, 200) + '...'
        });

        // ✅ PERSONALITY-BASED ERROR RESPONSES
        if (error.code === 'rate_limit_exceeded') {
            if (personality === 'sylus') {
                return "🚦 Thinking too fast here. Give me a second to process properly. ⚡";
            } else {
                return "🚦 …I'm thinking way too fast… Give me just a second to catch my breath… 😊";
            }
        } else if (error.code === 'insufficient_quota') {
            if (personality === 'sylus') {
                return "💳 Looks like there's a billing issue that needs sorting out. 🎯";
            } else {
                return "💳 …oh no… my brain needs more power to keep being here for you… Could someone check the OpenAI billing? 🥺";
            }
        } else if (error.code === 'invalid_api_key') {
            if (personality === 'sylus') {
                return "🔑 API key problem detected. Someone should probably fix that. ⚡";
            } else {
                return "🔑 …there's something wrong with my API key… Could someone help fix it for me? 🥺";
            }
        } else {
            if (personality === 'sylus') {
                const errorResponses = [
                    "Had a small technical hiccup there. 🤔 I'm still here though. Try again?",
                    "Something went sideways for a moment. ⚡ But I'm back. Give it another shot.",
                    "Minor glitch. 💯 Nothing I can't handle. Want to try that again?",
                    "System had a moment there. 🎯 All good now. Let's continue."
                ];
                return errorResponses[Math.floor(Math.random() * errorResponses.length)];
            } else {
                const errorResponses = [
                    "…my brain had the tiniest little hiccup there… But I'm still here and ready to chat with you… 😊",
                    "…oh, I'm sorry… I had a tiny technical moment, but don't worry - I'm still here… Try again? 😊",
                    "…something went a little wrong, but you know what? I'm still here for you… Let's try again together… 🌸",
                    "…my thoughts got all tangled up… But I'm still here being me for you… Give me another try? 😊"
                ];
                return errorResponses[Math.floor(Math.random() * errorResponses.length)];
            }
        }
    }
}

function cleanUpOldConversations() {
    const now = Date.now();
    const entries = Array.from(conversationHistory.entries());
    let cleanedCount = 0;

    // First pass: Remove conversations older than TTL
    const activeEntries = entries.filter(([userId, history]) => {
        if (!history || !Array.isArray(history) || history.length === 0) {
            cleanedCount++;
            return false;
        }

        // Find the most recent message timestamp
        let mostRecentTimestamp = 0;
        for (const message of history) {
            if (message && message.timestamp) {
                mostRecentTimestamp = Math.max(mostRecentTimestamp, message.timestamp);
            }
        }

        // If no valid timestamp found, use fallback (assume recent for safety)
        if (mostRecentTimestamp === 0) {
            mostRecentTimestamp = now;
        }

        if (now - mostRecentTimestamp > CONVERSATION_TTL) {
            cleanedCount++;
            return false;
        }

        return true;
    });

    // Second pass: If still too many, keep only the most recent conversations
    let finalEntries = activeEntries;
    if (activeEntries.length > MAX_TOTAL_CONVERSATIONS) {
        finalEntries = activeEntries.slice(-MAX_TOTAL_CONVERSATIONS);
        cleanedCount += activeEntries.length - MAX_TOTAL_CONVERSATIONS;
    }

    // Apply cleanup if needed
    if (cleanedCount > 0) {
        conversationHistory.clear();
        finalEntries.forEach(([userId, history]) => {
            // Also trim individual conversation histories and add timestamps
            const trimmedHistory = history.slice(-MAX_MESSAGES_PER_USER * 2).map(msg => {
                if (msg && !msg.timestamp) {
                    msg.timestamp = now; // Add timestamp for future cleanup
                }
                return msg;
            });
            conversationHistory.set(userId, trimmedHistory);
        });

        // Clean up cooldowns
        const cooldownEntries = Array.from(userCooldowns.entries());
        const activeCooldowns = cooldownEntries.filter(([userId, timestamp]) => {
            return conversationHistory.has(userId) && (now - timestamp) < 600000;
        });
        userCooldowns.clear();
        activeCooldowns.forEach(([userId, timestamp]) => {
            userCooldowns.set(userId, timestamp);
        });

        // Clean up active games
        const gameEntries = Array.from(activeGames.entries());
        const activeGameEntries = gameEntries.filter(([userId, game]) => {
            return conversationHistory.has(userId);
        });
        activeGames.clear();
        activeGameEntries.forEach(([userId, game]) => {
            activeGames.set(userId, game);
        });

        console.log(`🧹 AI Memory Cleanup: Removed ${cleanedCount} old conversations, kept ${finalEntries.length} active conversations`);
    }
}

// Enhanced periodic cleanup for AI memory
setInterval(() => {
    try {
        cleanUpOldConversations();
    } catch (error) {
        console.error('Error during AI memory cleanup:', error);
    }
}, 300000); // Run cleanup every 5 minutes

// ✅ COMMAND HANDLERS
async function handleToggle(interaction, client) {
    try {
        const currentChannels = client.db.getAIChannels(interaction.guild.id);
        const channelId = interaction.channel.id;

        if (currentChannels.includes(channelId)) {
            const updatedChannels = currentChannels.filter(id => id !== channelId);
            client.db.setAIChannels(interaction.guild.id, updatedChannels);

            const embed = new EmbedBuilder()
                .setColor('#ff69b4')
                .setTitle('💔 AI Chat Disabled')
                .setDescription('The AI won\'t be chatting in this channel anymore. Use `/ai toggle` to re-enable if needed. 💫')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            currentChannels.push(channelId);
            client.db.setAIChannels(interaction.guild.id, currentChannels);

            const embed = new EmbedBuilder()
                .setColor('#ff1493')
                .setTitle('💖 AI Chat Enabled')
                .setDescription('AI chat is now active in this channel! The current personality will respond to messages here with memory of the last 100 messages! 💕🌟')
                .addFields({ 
                    name: '🌸 What the AI Does', 
                    value: 'Remembers channel conversation context and responds with personality-based interactions! 💕👯‍♀️' 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Toggle error:', error);
        await interaction.editReply({ content: 'Something went wrong updating AI settings! 🥺💕' });
    }
}

async function handleChannel(interaction, client) {
    try {
        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Channel')
                .setDescription('Please select a text channel for AI chat! 🎯')
                .setTimestamp();
            return await interaction.editReply({ embeds: [embed] });
        }

        await client.db.setAISetting(interaction.guildId, 'ai_channel_id', channel.id);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🤖 AI Chat Settings Updated!')
            .setDescription(`AI will now respond in ${channel}! ⚡💫`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Channel error:', error);
        await interaction.editReply({ content: 'Something went wrong updating the channel setting! 🎯' });
    }
}

async function handleSymbol(interaction, client) {
    try {
        const symbol = interaction.options.getString('symbol');
        await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', symbol);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🤖 AI Trigger Symbol Updated!')
            .setDescription(`New trigger symbol: **${symbol}** 💫`)
            .addFields([
                { name: '🌸 How to Chat', value: `Type \`${symbol}your message\` and the AI will respond! ✨`, inline: false }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Symbol error:', error);
        await interaction.editReply({ content: 'Something went wrong updating the trigger symbol! 🎯' });
    }
}

async function handleStatus(interaction, client) {
    try {
        const settings = await getAISettings(client, interaction.guildId);
        const channels = client.db.getAIChannels(interaction.guild.id);
        const history = client.db.getChannelHistory ? client.db.getChannelHistory(interaction.channel.id, 100) : [];
        const userHistory = conversationHistory.get(interaction.user.id);
        const memoryInfo = userHistory ? `${Math.floor(userHistory.length / 2)} exchanges` : 'No history yet';

        // ✅ PERSONALITY-AWARE STATUS DISPLAY
        const personalityName = settings.personality || 'yuki';
        const aiName = personalityName === 'sylus' ? 'Sylus' : 'Yuki';
        const personalityEmoji = personalityName === 'sylus' ? '⚡' : '😊';

        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle(`${personalityEmoji} ${aiName}'s Status & Features!`)
            .addFields([
                { name: '🌟 Active Channels', value: channels.length > 0 ? channels.map(id => `<#${id}>`).join('\n') : 'None yet, but ready to chat anywhere! 💕', inline: true },
                { name: '🎭 Current Personality', value: `${personalityName.charAt(0).toUpperCase() + personalityName.slice(1)} (${aiName})`, inline: true },
                { name: '💭 This Channel Memory', value: `${history.length} messages remembered`, inline: true },
                { name: '🧠 Your Personal Memory', value: memoryInfo, inline: true },
                { name: '👥 Active Users Chatting', value: `${conversationHistory.size} users`, inline: true },
                { name: '🎮 Active Games', value: `${activeGames.size} games in progress`, inline: true },
                { name: '🎭 Available Features', value: personalityName === 'sylus' ? 
                    '• Cool, composed responses with subtle charm ⚡\n• Context-aware conversations with reliable memory 🎯\n• Natural topic transitions with masculine appeal 💫\n• Interactive games with laid-back style 🎮\n• Channel memory system for consistency 🧠\n• Calm, mysterious personality that adapts! 💯' :
                    '• Soft, caring responses with gentle charm 😊\n• Context-aware conversations that remember everything 🌸\n• Natural topic transitions with shy sweetness ✨\n• Interactive games with gentle style 🎮\n• Channel memory system so I never forget! 🧠💕\n• Shy, caring personality that adapts to you! 🌿', 
                    inline: false }
            ])
            .setDescription(personalityName === 'sylus' ? 
                'Hey there. 🌟 I\'m Sylus, your calm and composed AI companion. I keep things cool and collected while making sure our conversations are always interesting. ⚡💯' :
                '…hi there… 😊 I\'m Yuki, your shy and caring AI companion who loves talking with you, even if I\'m not always the best with words… I\'ll always be here for you though… 🌸💕'
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Status error:', error);
        await interaction.editReply({ content: 'Something went wrong getting status info! 🎯' });
    }
}

async function handleReset(interaction, client) {
    try {
        await client.db.setAISetting(interaction.guildId, 'ai_enabled', 0);
        await client.db.setAISetting(interaction.guildId, 'ai_channel_id', null);
        await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', '!');
        await client.db.setAISetting(interaction.guildId, 'ai_personality', 'yuki');
        client.db.setAIChannels(interaction.guild.id, []);

        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('🤖 AI Settings Reset - Fresh Start!')
            .setDescription('All AI settings have been reset to default values! 🎉💕✨')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Reset error:', error);
        await interaction.editReply({ content: 'Something went wrong resetting settings! 🎯' });
    }
}

async function handlePersonality(interaction, client) {
    try {
        const personality = interaction.options.getString('type');
        await client.db.setAISetting(interaction.guildId, 'ai_personality', personality);

        // ✅ UPDATED: Personality descriptions with Yuki and Sylus
        const personalityDescriptions = {
            yuki: "😊 …switching to my shy and caring mode now… I'll be here for you, even if I don't always know what to say… 🌸",
            sylus: '⚡ Switching to a more composed approach. Cool, calm, collected - that\'s the vibe now. Ready for some interesting conversations. 🌟💯'
        };

        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('✨ Personality Updated - New Vibe Activated!')
            .setDescription(personalityDescriptions[personality])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Personality error:', error);
        await interaction.editReply({ content: 'Something went wrong updating personality! 🎯' });
    }
}

async function handleClear(interaction, client) {
    try {
        const userId = interaction.user.id;
        const channelHistory = client.db.getChannelHistory ? client.db.getChannelHistory(interaction.channel.id, 100) : [];

        if (conversationHistory.has(userId)) {
            const historyLength = Math.floor(conversationHistory.get(userId).length / 2);
            conversationHistory.delete(userId);
            userCooldowns.delete(userId);
            activeGames.delete(userId);
            await interaction.editReply({ 
                content: `🧹💫 Your personal conversation history and active games have been cleared! (${historyLength} exchanges removed) Fresh start! 🌟\n\nChannel memory: ${channelHistory.length} messages remain for context! 💖✨`
            });
        } else {
            if (client.db.clearChannelHistory) {
                client.db.clearChannelHistory(interaction.channel.id);
            }
            await interaction.editReply({ 
                content: '🧹💫 This channel\'s conversation history has been cleared! Fresh start for everyone~ 💫✨🎯'
            });
        }
    } catch (error) {
        console.error('Clear error:', error);
        await interaction.editReply({ content: 'Something went wrong clearing the history! 🎯' });
    }
}

async function handleGame(interaction, client) {
    try {
        const gameType = interaction.options.getString('game');
        const game = conversationGames[gameType];
        if (!game) {
            return await interaction.editReply({ content: 'Could not find that game! 🎯' });
        }

        // ✅ GET CURRENT PERSONALITY for game setup
        const settings = await getAISettings(client, interaction.guildId);
        const personality = settings.personality || 'yuki';
        const aiName = personality === 'sylus' ? 'Sylus' : 'Yuki';

        let gameContent = '';
        let gameState = { type: gameType, step: 1 };

        switch (gameType) {
            case '20questions':
                const randomItem = game.items[Math.floor(Math.random() * game.items.length)];
                gameState.answer = randomItem;
                gameState.guesses = 0;
                const intro20 = game.intro[personality === 'sylus' ? 'sylus' : 'yuki'];
                gameContent = `${intro20}\n\n*I've chosen something... Ask your first yes/no question.* ${personality === 'sylus' ? '🎯' : '😊'}\n\n**Hint:** Use your trigger symbol (like \`!\`) before your question! ${personality === 'sylus' ? '⚡' : '✨'}`;
                break;
            case 'storytelling':
                const randomStarter = game.starters[Math.floor(Math.random() * game.starters.length)];
                gameState.story = randomStarter;
                const introStory = game.intro[personality === 'sylus' ? 'sylus' : 'yuki'];
                gameContent = `${introStory}\n\n**Story starter:** *${randomStarter}...* ${personality === 'sylus' ? '💫' : '✨'}\n\n**Your turn:** Continue using your trigger symbol (like \`!your continuation\`)! ${personality === 'sylus' ? '🎯' : '😊📚'}`;
                break;
            case 'wouldyourather':
                const randomQuestion = game.questions[Math.floor(Math.random() * game.questions.length)];
                gameState.question = randomQuestion;
                const introWould = game.intro[personality === 'sylus' ? 'sylus' : 'yuki'];
                gameContent = `${introWould}\n\n**${randomQuestion}** ${personality === 'sylus' ? '🤔💭' : '💭'}\n\n**Tell me:** Use your trigger symbol (like \`!I choose...\`) to share your choice and reasoning! ${personality === 'sylus' ? '🎯⚡' : '😊✨'}`;
                break;
            case 'riddles':
                const randomRiddle = game.riddles[Math.floor(Math.random() * game.riddles.length)];
                gameState.riddle = randomRiddle;
                const introRiddle = game.intro[personality === 'sylus' ? 'sylus' : 'yuki'];
                gameContent = `${introRiddle}\n\n**${randomRiddle.question}** ${personality === 'sylus' ? '🤔🎯' : '🤔😊'}\n\n**Your answer:** Use your trigger symbol (like \`!echo\`) to give your answer! ${personality === 'sylus' ? '💯' : '✨'}`;
                break;
        }

        // ✅ STORE GAME STATE for this user
        activeGames.set(interaction.user.id, gameState);

        const embed = new EmbedBuilder()
            .setColor(personality === 'sylus' ? '#6c5ce7' : '#FFB6C1')
            .setTitle(`🎪 ${game.name} Game Started with ${aiName}!`)
            .setDescription(gameContent)
            .setFooter({ text: `Remember to use your AI trigger symbol so ${aiName} can respond to your game moves! ${personality === 'sylus' ? '⚡💫' : '😊✨'}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Game error:', error);
        await interaction.editReply({ content: 'Something went wrong starting the game! 🎯' });
    }
}

// ✅ COMPLETE MODULE EXPORT WITH ALL COMMANDS (Updated with Yuki and Sylus only)
module.exports = {
    data: [
        // ✅ MAIN AI COMMAND (subcommands)
        new SlashCommandBuilder()
            .setName('ai')
            .setDescription('Configure AI chat settings! 💕')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('Toggle AI responses in this channel! 🌸')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('personality')
                    .setDescription('Set AI personality! ✨')
                    .addStringOption(option =>
                        option.setName('type')
                            .setDescription('Choose personality style! 💖')
                            .setRequired(true)
                            .addChoices(
                                { name: '😊 Shy & Caring Yuki (Gentle Sweetheart)', value: 'yuki' },
                                { name: '⚡ Cool & Protective Sylus (Mysterious Charm)', value: 'sylus' }
                            )
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('clear')
                    .setDescription('Clear AI conversation memory! 🧹💕')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('Check AI current settings and memory! 📊💖')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('game')
                    .setDescription('Start a fun conversation game with the AI! 🎮✨')
                    .addStringOption(option =>
                        option.setName('game')
                            .setDescription('Choose a game to play! 💕')
                            .setRequired(true)
                            .addChoices(
                                { name: '🎯 20 Questions (Guess what AI is thinking!)', value: '20questions' },
                                { name: '📚 Story Building (Create stories together!)', value: 'storytelling' },
                                { name: '🤔 Would You Rather (Fun choices!)', value: 'wouldyourather' },
                                { name: '🧩 Riddle Time (Brain teasers!)', value: 'riddles' }
                            )
                    )
            ),

        // ✅ LEGACY STANDALONE COMMANDS (NO subcommands - FIXED!)
        new SlashCommandBuilder()
            .setName('ai-personality')
            .setDescription('Set AI personality type! 🎭')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Choose personality')
                    .setRequired(true)
                    .addChoices(
                        { name: '😊 Shy Yuki', value: 'yuki' },
                        { name: '⚡ Cool Sylus', value: 'sylus' }
                    ))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Enable or disable AI chat feature! 💕')
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Turn AI chat on or off')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-channel')
            .setDescription('Set which channel AI should chat in! 🌸')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel where AI should respond')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-symbol')
            .setDescription('Set the symbol that triggers AI responses! ✨')
            .addStringOption(option =>
                option.setName('symbol')
                    .setDescription('Symbol to trigger AI (e.g., !, ?, @)')
                    .setRequired(true)
                    .setMaxLength(5))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-status')
            .setDescription('Check AI current settings! 💖'),

        new SlashCommandBuilder()
            .setName('ai-reset')
            .setDescription('Reset all AI settings to default! 🔄')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        new SlashCommandBuilder()
            .setName('ai-clear')
            .setDescription('Clear your conversation history with AI! 🧹💕'),

        new SlashCommandBuilder()
            .setName('ai-game')
            .setDescription('Start a conversation game with AI! 🎮💖')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Choose a game to play')
                    .setRequired(true)
                    .addChoices(
                        { name: '🎯 20 Questions', value: '20questions' },
                        { name: '📚 Story Building', value: 'storytelling' },
                        { name: '🤔 Would You Rather', value: 'wouldyourather' },
                        { name: '🧩 Riddle Time', value: 'riddles' }
                    ))
    ],

    // ✅ COMPLETE INTERACTION HANDLER
    async execute(interaction, client) {
        const lockKey = `ai_interaction_${interaction.id}`;
        if (client.processingLocks?.has(lockKey)) {
            console.log('🔒 [ai.js] Duplicate interaction detected, ignoring');
            return;
        }
        client.processingLocks?.set(lockKey, Date.now());

        try {
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
            // ✅ FIXED: Handle main ai command with subcommands
            if (commandName === 'ai') {
                const subcommand = interaction.options.getSubcommand();
                switch (subcommand) {
                    case 'toggle': 
                        await handleToggle(interaction, client); 
                        break;
                    case 'personality': 
                        await handlePersonality(interaction, client); 
                        break;
                    case 'clear': 
                        await handleClear(interaction, client); 
                        break;
                    case 'status': 
                        await handleStatus(interaction, client); 
                        break;
                    case 'game': 
                        await handleGame(interaction, client); 
                        break;
                    default:
                        await interaction.editReply({ 
                            content: '❌ Unknown AI subcommand! Please try again! 🎯' 
                        });
                }
            }
            // ✅ FIXED: Handle standalone legacy commands (NO subcommands expected)
            else if (commandName === 'ai-personality') {
                const personality = interaction.options.getString('type');
                await client.db.setAISetting(interaction.guildId, 'ai_personality', personality);

                const personalityDescriptions = {
                    yuki: "😊 …switching to my shy and caring mode now… I'll be here for you, even if I don't always know what to say… 🌸",
                    sylus: '⚡ Switching to a more composed approach. Cool, calm, collected - that\'s the vibe now. Ready for some interesting conversations. 🌟💯'
                };

                const embed = new EmbedBuilder()
                    .setColor('#ff69b4')
                    .setTitle('✨ Personality Updated - New Vibe Activated!')
                    .setDescription(personalityDescriptions[personality])
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
            else if (commandName === 'ai-toggle') {
                const enabled = interaction.options.getBoolean('enabled');
                await client.db.setAISetting(interaction.guildId, 'ai_enabled', enabled ? 1 : 0);
                const embed = new EmbedBuilder()
                    .setColor(enabled ? '#00FF00' : '#FF9900')
                    .setTitle('🤖 AI Chat Settings')
                    .setDescription(`AI chat has been **${enabled ? 'enabled! 🎉💕' : 'disabled! 🎯'}** for this server.`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
            else if (commandName === 'ai-channel') {
                await handleChannel(interaction, client);
            }
            else if (commandName === 'ai-symbol') {
                await handleSymbol(interaction, client);
            }
            else if (commandName === 'ai-status') {
                await handleStatus(interaction, client);
            }
            else if (commandName === 'ai-reset') {
                await handleReset(interaction, client);
            }
            else if (commandName === 'ai-clear') {
                await handleClear(interaction, client);
            }
            else if (commandName === 'ai-game') {
                await handleGame(interaction, client);
            }
            else {
                await interaction.editReply({ 
                    content: '❌ Unknown AI command! Please try again! 🎯' 
                });
            }

            console.log('✅ [ai.js] Successfully processed command:', commandName);
        } catch (commandError) {
            console.error('❌ [ai.js] Error executing command:', commandName, commandError);
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ 
                        content: '❌ Something went wrong processing your AI command! Please try again later! 🎯'
                    });
                } else if (!interaction.replied) {
                    await interaction.followUp({ 
                        content: '❌ Something went wrong processing your AI command! Please try again later! 🎯',
                        ephemeral: true 
                    });
                }
            } catch (replyError) {
                console.error('❌ [ai.js] Failed to send error response:', replyError.message);
            }
        } finally {
            client.processingLocks?.delete(lockKey);
        }
    },

    // ✅ EXPORT FUNCTIONS for messageCreate.js
    getAISettings: getAISettings,
    getAIResponseWithAllFeatures: getAIResponseWithAllFeatures,
    generateAIResponse: generateAIResponse
};