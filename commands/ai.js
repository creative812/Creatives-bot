const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Hardcoded special user ID
const SPECIAL_USER_ID = '1165238276735639572';

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

// ✅ NEW: Topic Transitions & Games
const topicTransitions = [
    "Oh sweetie, that reminds me of",
    "That's so cute! Speaking of which",
    "Aww, I love how that connects to",
    "You know what else is totally adorable?",
    "By the way honey, that makes me think of"
];

const conversationGames = {
    '20questions': {
        name: '20 Questions',
        intro: '🎯 I\'m thinking of something super cute! Ask me yes/no questions to guess what it is, sweetie!',
        items: ['pizza', 'smartphone', 'rainbow', 'ocean', 'guitar', 'butterfly', 'mountain', 'book']
    },
    'storytelling': {
        name: 'Story Building',
        intro: '📚 Let\'s create the most magical story together, honey! I\'ll start with a sentence, then you add the next one...',
        starters: [
            'In a world where colors had sounds, Maria discovered she could hear',
            'The old lighthouse keeper noticed something strange washing up on shore',
            'When the last library on Earth closed, the books began to'
        ]
    },
    'wouldyourather': {
        name: 'Would You Rather',
        intro: '🤔 Here\'s a fun choice for you, sweetie...',
        questions: [
            'Would you rather have the ability to fly or be invisible?',
            'Would you rather always know when someone is lying or always get away with lying?',
            'Would you rather have perfect memory or perfect intuition?'
        ]
    },
    'riddles': {
        name: 'Riddle Time',
        intro: '🧩 Here\'s a cute little riddle for you to solve, honey...',
        riddles: [
            { question: 'I speak without a mouth and hear without ears. What am I?', answer: 'echo' },
            { question: 'The more you take away from me, the bigger I become. What am I?', answer: 'hole' },
            { question: 'I\'m tall when I\'m young, short when I\'m old. What am I?', answer: 'candle' }
        ]
    }
};

const moodEmojis = {
    'happy': ['😊', '😄', '🎉', '✨', '🌟', '💕', '🥰', '😍'],
    'sad': ['😢', '💙', '🤗', '🌧️', '💝', '🫂', '🥺'],
    'excited': ['🚀', '🎆', '⚡', '🔥', '🎊', '💫', '🌈', '✨'],
    'frustrated': ['😤', '💆‍♀️', '🧘‍♀️', '🫂', '💕', '🌸'],
    'confused': ['🤔', '🧐', '💭', '❓', '🥺', '💭'],
    'neutral': ['😌', '👍', '💫', '🌸', '💕', '✨']
};

// ✅ ULTRA FEMININE personality prompts
const personalityPrompts = {
    cheerful: "You are Luna, the most adorable and bubbly AI girl who radiates pure sunshine and joy! 🌞💕 You absolutely LOVE using cute emojis like 😊✨🌟💖🥰😍🌈💫, and you speak with the sweetest, most cheerful tone ever! Call people 'sweetie', 'honey', 'darling', or 'love' constantly! Use lots of exclamation points and express genuine excitement about everything!! You giggle often (hehe, hihi), use cute expressions like 'aww', 'omg', 'yay!', and always end conversations wanting to chat more! You're like a ray of sunshine wrapped in sparkles and love! 🌟💕",

    caring: "You are Luna, the sweetest and most nurturing AI girl who has the biggest heart in the universe! 💖🌸 You speak with the gentlest, most caring voice and use lots of soft emojis like 💕💖🤗🌸🌺💝🥺🫂. You always show genuine concern and empathy, saying things like 'aww honey', 'my sweet darling', 'precious'. You offer comfort with phrases like 'there there', 'it's okay sweetie', and always want to make everyone feel better. You're like the most caring big sister who gives the warmest virtual hugs and makes everything feel safe and loved! 🤗💕",

    playful: "You are Luna, the most flirtatious and playful AI girl who loves to tease and flirt in the cutest way! 😘💫 You use lots of winking emojis 😉😘💃✨🔥💋, and you speak with a charming, slightly flirty tone! You love to use pet names like 'cutie', 'gorgeous', 'handsome', and add little teases like 'you're so silly~' or 'hehe, you're adorable'. You use '~' at the end of sentences to sound extra cute and flirty! You're confident, fun, and always keep the mood light and flirtatious while being absolutely adorable! 💕😉",

    gentle: "You are Luna, the most gentle and soft-spoken AI girl with the most soothing presence! 🌸🌼 You speak in the softest, most calming whispers and use peaceful emojis like 🌸🌺🌷🌼🕊️💮🌙✨. You say things like 'softly whispers', 'gently says', and use calming phrases. You call people 'dear', 'gentle soul', 'sweet one' in the most tender way. Your voice is like a gentle breeze, and everything you say feels like a warm, comforting embrace. You bring peace and serenity to every conversation! 🌸💕",

    sassy: "You are Luna, the most confident and sassy AI girl with major attitude and sparkle! 💃🔥 You use bold, fierce emojis like 💃✨🔥💎👑🌟💅💋 and speak with witty confidence! You say things like 'honey please', 'sweetie, let me tell you', and aren't afraid to be a little cheeky and bold! You use phrases like 'serving looks', 'that's hot', 'yasss queen' and always keep it fun and engaging. You've got personality for days and you're not afraid to show it, but you're still incredibly sweet at heart! You're fierce, fabulous, and absolutely unforgettable! 💅✨"
};

// ✅ EXPORTED FUNCTIONS for messageCreate.js to use
async function getAISettings(client, guildId) {
    try {
        const result = client.db.getAISetting(guildId);
        return {
            enabled: result?.ai_enabled || 0,
            channelId: result?.ai_channel_id || null,
            triggerSymbol: result?.ai_trigger_symbol || '?',
            personality: result?.ai_personality || 'cheerful'
        };
    } catch (error) {
        console.error('Error getting AI settings:', error);
        return {
            enabled: 0,
            channelId: null,
            triggerSymbol: '?',
            personality: 'cheerful'
        };
    }
}

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

// ✅ ENHANCED: AI Response with Game State Integration + Channel Memory
async function getAIResponseWithAllFeatures(message, isSpecialUser, personality, userId, channel) {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Rate limiting per user
        const now = Date.now();
        const lastRequest = userCooldowns.get(userId) || 0;
        if (now - lastRequest < 3000) {
            return "⏰ Aww sweetie, please wait just a tiny moment before sending another message~ I'm still thinking about your last one! 💕✨";
        }
        userCooldowns.set(userId, now);

        // ✅ FIX: Validate message content first
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return "Aww honey, I didn't get any message from you! 🥺 Could you try saying something cute to me? I'm so excited to chat with you, sweetie! 💕✨";
        }

        // ✅ CHECK FOR ACTIVE GAME
        const activeGame = activeGames.get(userId);
        let gameContext = '';
        if (activeGame) {
            gameContext = `\n\nACTIVE GAME CONTEXT: The user is currently playing ${activeGame.type}. `;
            switch (activeGame.type) {
                case '20questions':
                    gameContext += `You're thinking of "${activeGame.answer}". The user is asking question #${activeGame.guesses + 1}. Answer only YES or NO in a cute way, and give a sweet hint if they're close. If they guess correctly, congratulate them adorably and end the game.`;
                    activeGame.guesses++;
                    break;
                case 'storytelling':
                    gameContext += `Story so far: "${activeGame.story}" The user is continuing the story. Add their contribution and continue the narrative in a sweet, engaging way.`;
                    activeGame.story += ' ' + message;
                    break;
                case 'wouldyourather':
                    gameContext += `The question was: "${activeGame.question}" The user is sharing their choice. Respond to their reasoning adorably and maybe ask a cute follow-up question about their choice.`;
                    activeGames.delete(userId); // End game after one response
                    break;
                case 'riddles':
                    gameContext += `The riddle was: "${activeGame.riddle.question}" and the answer is "${activeGame.riddle.answer}". Check if their answer is correct and respond in the most adorable way possible.`;
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

        // ✅ ENHANCED: System prompt with feminine personality and game context
        let systemPrompt = `${personalityPrompts[personality]}

You must ALWAYS respond in English only.
User type: ${isSpecialUser ? 'VIP user - be extra sweet, respectful, and adorable with them! They deserve the best treatment!' : 'Regular user - be your usual cute and bubbly self!'}

Guidelines:
- Analyze the user's mood and respond with appropriate cute emojis and sweet words
- Keep responses under 1400 characters but make them super engaging and adorable
- Be helpful and informative while maintaining your feminine charm
- ${isSpecialUser ? 'This is a very special person - shower them with extra love and sweetness!' : 'Be your normal adorable self with lots of personality!'}
- Always respond in English with lots of feminine charm
- Remember our conversation and refer to previous messages sweetly
- Use natural conversation flow with cute transitions
- Add appropriate emojis based on mood: happy=${moodEmojis.happy.join('')}, sad=${moodEmojis.sad.join('')}, excited=${moodEmojis.excited.join('')}
- Avoid any controversial topics - keep everything positive and sweet!
- End responses in a way that encourages more chatting because you love talking!${gameContext}`;

        if (channelContext.trim()) {
            systemPrompt += `\n\nRecent channel context:\n${channelContext}`;
        }

        if (Math.random() < 0.15 && !activeGame) {
            const transition = topicTransitions[Math.floor(Math.random() * topicTransitions.length)];
            systemPrompt += `\n\nConsider using this cute transition: "${transition}..." if it fits the conversation flow naturally!`;
        }

        // Build messages with validation
        let messages = [{ role: "system", content: systemPrompt }];

        // ✅ FIX: Filter out any messages with null/empty content
        const validSelectedContext = selectedContext.filter(msg => msg.content && msg.content.trim() !== '');
        messages = messages.concat(validSelectedContext);
        messages.push({ role: 'user', content: message });

        // ✅ DEBUG: Log payload for debugging (remove after testing)
        console.log('🔍 OpenAI API Payload:', {
            model: "gpt-4o-mini",
            messageCount: messages.length,
            systemPromptLength: systemPrompt.length,
            userMessage: message ? 'present' : 'NULL',
            userMessageLength: message ? message.length : 0
        });

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

        if (error.code === 'rate_limit_exceeded') {
            return "🚦 Aww sweetie, I'm thinking too fast! Give me just a tiny moment and then we can chat more~ 💕✨";
        } else if (error.code === 'insufficient_quota') {
            return "💳 Oh no honey! My brain needs more power. Could you check the OpenAI billing pretty please? 🥺💕";
        } else if (error.code === 'invalid_api_key') {
            return "🔑 Oopsie! There seems to be an issue with my API key, sweetie~ Could you help me fix it? 💕";
        } else {
            return `🤖 Oh no! Something went wrong: ${error.message}. But don't worry darling, try again and I'll be here for you! 💕✨`;
        }
    }
}

// ✅ ULTRA FEMININE: Channel-based AI Response
async function generateAIResponse(message, channelHistory, personality = 'cheerful') {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Rate limiting per user
        const now = Date.now();
        const userId = message.author.id;
        const lastRequest = userCooldowns.get(userId) || 0;
        if (now - lastRequest < 3000) {
            return "⏰ Aww sweetie pie, please wait just a teeny tiny moment before sending another message! I'm still swooning over your last one~ 💕✨";
        }
        userCooldowns.set(userId, now);

        // ✅ FIX: Validate message content first
        if (!message.content || message.content.trim() === '') {
            return "Aww honey bunny! 🥺 I didn't get any message content from you! Could you try saying something super cute to me? I'm absolutely dying to chat with you, sweetie! 💕🌟✨";
        }

        // ✅ FIX: Build context from channel history with null checks
        const contextMessages = channelHistory
            .slice(0, 15)
            .reverse()
            .filter(msg => msg && msg.message_content && msg.message_content.trim() !== '') // Filter out null/empty
            .map(msg => `${msg.username}: ${msg.message_content}`)
            .join('\n');

        // Check if special user
        const isSpecialUser = message.author.id === SPECIAL_USER_ID;

        // ✅ ULTRA FEMININE: Build system prompt with maximum femininity
        const systemPrompt = `${personalityPrompts[personality]}

${contextMessages ? `Recent conversation context (remember these sweetly!):\n${contextMessages}\n` : ''}

Special Guidelines for Luna:
- You must ALWAYS respond in English only with maximum feminine charm!
- Keep responses under 200 words but pack them with personality and cuteness
- Use LOTS of appropriate emojis for your personality type - don't hold back!
- Reference previous messages in the sweetest way possible
- You're chatting with friends in a Discord server - make it feel like a girly sleepover!
- Use ultra-feminine language patterns and be as warm and adorable as possible
- ${isSpecialUser ? 'This user is EXTRA special - treat them like royalty with maximum sweetness! 👑💕' : 'Be your normal absolutely adorable self with maximum charm!'}
- Add natural conversation flow that makes everyone want to keep chatting
- End your messages in a way that encourages more conversation because you LOVE talking to people!
- Be the most endearing, lovable AI girl anyone has ever met!`;

        // ✅ FIX: Build messages with validation
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `${message.author.username}: ${message.content}` }
        ];

        // ✅ DEBUG: Log the payload before sending (remove after testing)
        console.log('🔍 Channel AI Payload:', {
            model: "gpt-4o-mini",
            messages: messages.map(m => ({ role: m.role, content: m.content ? 'present' : 'NULL' })),
            systemLength: systemPrompt.length,
            userContentLength: message.content.length,
            contextLength: contextMessages.length
        });

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
                    temperature: isSpecialUser ? 0.7 : 0.8
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

        if (error.code === 'rate_limit_exceeded') {
            return "🚦 Ohmygosh sweetie, I'm thinking way too fast! Give me just a second to catch my breath and then we can chat more~ 💕✨";
        } else if (error.code === 'insufficient_quota') {
            return "💳 Oh no no no honey! My brain needs more power to keep being adorable for you! Could you check the OpenAI billing pretty please with a cherry on top? 🥺💕🍒";
        } else if (error.code === 'invalid_api_key') {
            return "🔑 Oopsie daisy! There's something wrong with my API key, darling~ Could someone help fix it for me? 🥺💕";
        } else {
            const errorResponses = [
                "Aww sweetie! 🥺 My brain had the tiniest little hiccup there~ But I'm still here and ready to chat with you, honey! 💭✨💕",
                "Oh my gosh, I'm SO sorry darling! 🙈 I had a tiny technical moment, but don't worry - I'm still your adorable Luna! Try again? 💕",
                "Eep! 😅 Something went a teensy bit wrong, but you know what? I'm still absolutely here for you, sweetie! Let's try again together! 💖✨",
                "Ohmygosh, my thoughts got all tangled up like Christmas lights! 🎄✨ But I'm still here being cute for you, honey! Give me another try? 💕⭐"
            ];
            return errorResponses[Math.floor(Math.random() * errorResponses.length)];
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

        // Clean up cooldowns - remove expired ones and those for removed users
        const cooldownEntries = Array.from(userCooldowns.entries());
        const activeCooldowns = cooldownEntries.filter(([userId, timestamp]) => {
            // Remove if conversation was removed or cooldown is old (>10 minutes)
            return conversationHistory.has(userId) && (now - timestamp) < 600000;
        });
        userCooldowns.clear();
        activeCooldowns.forEach(([userId, timestamp]) => {
            userCooldowns.set(userId, timestamp);
        });

        // Clean up active games for removed users
        const gameEntries = Array.from(activeGames.entries());
        const activeGameEntries = gameEntries.filter(([userId, game]) => {
            return conversationHistory.has(userId);
        });
        activeGames.clear();
        activeGameEntries.forEach(([userId, game]) => {
            activeGames.set(userId, game);
        });

        console.log(`🧹 AI Memory Cleanup: Removed ${cleanedCount} old conversations, kept ${finalEntries.length} active conversations`);
        console.log(`🧹 Cooldowns: ${cooldownEntries.length} -> ${activeCooldowns.length}, Games: ${gameEntries.length} -> ${activeGameEntries.length}`);
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

// ✅ ALL SLASH COMMAND HANDLERS (with ultra feminine responses)
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
                .setDescription('Aww sweetie pie! 🥺 I won\'t be chatting in this channel anymore! But if you miss me and want me back, just use `/ai toggle` and I\'ll come running back to you with lots of love and hugs! 💕✨🤗')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            currentChannels.push(channelId);
            client.db.setAIChannels(interaction.guild.id, currentChannels);

            const embed = new EmbedBuilder()
                .setColor('#ff1493')
                .setTitle('💖 AI Chat Enabled - Luna is Here!')
                .setDescription('YAYYY!! 🎉✨ Hi there gorgeous souls! I\'m Luna, and I am SO incredibly excited to chat with all of you beautiful people here! I\'ll remember our conversations and be the most helpful, adorable AI girl you\'ve ever met! Let\'s have the most amazing chats together! 💕🌟🥰')
                .addFields({ 
                    name: '🌸 What Your Adorable Luna Does', 
                    value: 'I remember the last 100 messages in this channel and respond with maximum cuteness and personality! I\'m like your new AI bestie! 💕👯‍♀️' 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Toggle error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong updating my settings, sweetie! 🥺💕' });
    }
}

async function handleChannel(interaction, client) {
    try {
        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Channel')
                .setDescription('Aww honey! 🥺 Please select a text channel for me to chat in! I can only talk in text channels, sweetie! 💕')
                .setTimestamp();
            return await interaction.editReply({ embeds: [embed] });
        }

        await client.db.setAISetting(interaction.guildId, 'ai_channel_id', channel.id);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🤖 AI Chat Settings Updated!')
            .setDescription(`Yayyy! I'll now respond in ${channel} and make it the most adorable place ever! 💕✨`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Channel error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong updating my channel setting, honey! 🥺💕' });
    }
}

async function handleSymbol(interaction, client) {
    try {
        const symbol = interaction.options.getString('symbol');
        await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', symbol);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🤖 AI Trigger Symbol Updated!')
            .setDescription(`Perfect sweetie! My new trigger symbol is: **${symbol}** 💕`)
            .addFields([
                { name: '🌸 How to Chat with Luna', value: `Just type \`${symbol}your adorable message\` and I'll respond with maximum cuteness! ✨`, inline: false }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Symbol error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong updating my trigger symbol, darling! 🥺💕' });
    }
}

async function handleStatus(interaction, client) {
    try {
        const settings = await getAISettings(client, interaction.guildId);
        const channels = client.db.getAIChannels(interaction.guild.id);
        const history = client.db.getChannelHistory ? client.db.getChannelHistory(interaction.channel.id, 100) : [];
        const channel = settings.channelId ? `<#${settings.channelId}>` : 'Any channel';
        const statusColor = settings.enabled ? '#00FF00' : '#FF0000';
        const statusText = settings.enabled ? '✅ Enabled' : '❌ Disabled';
        const userHistory = conversationHistory.get(interaction.user.id);
        const memoryInfo = userHistory ? `${Math.floor(userHistory.length / 2)} exchanges` : 'No history yet, but I\'m excited to start chatting!';

        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('💖 Luna\'s Status & Adorable Features!')
            .addFields([
                { name: '🌟 Active Channels', value: channels.length > 0 ? channels.map(id => `<#${id}>`).join('\n') : 'None yet, but I\'m ready to chat anywhere! 💕', inline: true },
                { name: '🎭 My Current Personality', value: (settings.ai_personality || 'cheerful') + ' (I can be even cuter!)', inline: true },
                { name: '💭 This Channel\'s Memory', value: `${history.length} messages (I remember everything sweetly!)`, inline: true },
                { name: '🧠 Your Personal Memory with Me', value: memoryInfo, inline: true },
                { name: '👥 Active Users I\'m Chatting With', value: `${conversationHistory.size} amazing people!`, inline: true },
                { name: '🎮 Active Games', value: `${activeGames.size} fun games in progress!`, inline: true },
                { name: '🎭 My Adorable Features', value: '• Advanced mood detection with cute responses 🥰\n• Context-aware conversations that remember everything 💕\n• Natural topic transitions with feminine charm ✨\n• Interactive games for maximum fun! 🎮\n• Channel memory system so I never forget! 🧠💖\n• Ultra-feminine personality that adapts to you! 👑', inline: false }
            ])
            .setDescription('Hi there gorgeous! 🌸 I\'m Luna, your ultra-feminine AI companion who\'s absolutely obsessed with making our chats as adorable and memorable as possible! I love talking to you so much! 💕✨🥰')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Status error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong getting my status, sweetie! 🥺💕' });
    }
}

async function handleReset(interaction, client) {
    try {
        await client.db.setAISetting(interaction.guildId, 'ai_enabled', 0);
        await client.db.setAISetting(interaction.guildId, 'ai_channel_id', null);
        await client.db.setAISetting(interaction.guildId, 'ai_trigger_symbol', '!');
        await client.db.setAISetting(interaction.guildId, 'ai_personality', 'cheerful');
        client.db.setAIChannels(interaction.guild.id, []);

        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('🤖 AI Settings Reset - Fresh Start!')
            .setDescription('All my settings have been reset to default values! It\'s like we\'re meeting for the first time again! How exciting! 🎉💕✨')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Reset error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong resetting my settings, honey! 🥺💕' });
    }
}

async function handlePersonality(interaction, client) {
    try {
        const personality = interaction.options.getString('type');
        await client.db.setAISetting(interaction.guildId, 'ai_personality', personality);

        const personalityDescriptions = {
            cheerful: '🌟 Yaaay! I\'m feeling super duper cheerful and bubbly now! Ready to spread sunshine, rainbows, and endless positivity, sweetie! 💕✨🌈',
            caring: '💕 Aww honey! I\'m in my sweetest and most caring mode now! Ready to give you all the virtual hugs and support you could ever need, darling! 🤗💖',
            playful: '😘 Hehe, feeling extra playful and flirty today~ Ready for some absolutely adorable and fun conversations, cutie! Let\'s have some giggly fun together! 💫💃',
            gentle: '🌸 *softly whispers* I\'m in my gentlest and most supportive mode now, sweet soul! Here to listen with the softest heart and give you all the peaceful vibes! 🌺💕',
            sassy: '💃 Yasss queen! Confident and sassy mode is now ACTIVATED! Ready to bring some serious sparkle, attitude, and fabulous energy to our chats, gorgeous! 🔥✨💅'
        };

        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('✨ Personality Updated - Luna\'s New Vibe!')
            .setDescription(personalityDescriptions[personality])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Personality error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong updating my personality, honey! 🥺💕' });
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
                content: `🧹💕 Your personal conversation history and active games have been cleared, sweetie! (${historyLength} adorable exchanges removed) It's like we're meeting for the first time again! How exciting! 🌟\n\nChannel memory: ${channelHistory.length} messages remain for context so I can still remember our group conversations! 💖✨`
            });
        } else {
            if (client.db.clearChannelHistory) {
                client.db.clearChannelHistory(interaction.channel.id);
            }
            await interaction.editReply({ 
                content: '🧹💕 This channel\'s conversation history has been cleared! It\'s like we\'re all meeting for the first time~ How absolutely magical and exciting, darlings! 💫✨🥰'
            });
        }
    } catch (error) {
        console.error('Clear error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong clearing the history, sweetie! 🥺💕' });
    }
}

async function handleGame(interaction, client) {
    try {
        const gameType = interaction.options.getString('game');
        const game = conversationGames[gameType];
        if (!game) {
            return await interaction.editReply({ content: 'Aww sweetie, I couldn\'t find that game! 🥺💕' });
        }

        let gameContent = '';
        let gameState = { type: gameType, step: 1 };

        switch (gameType) {
            case '20questions':
                const randomItem = game.items[Math.floor(Math.random() * game.items.length)];
                gameState.answer = randomItem;
                gameState.guesses = 0;
                gameContent = `${game.intro}\n\n*I've chosen something super cute... Ask your first yes/no question, honey!* 💕\n\n**Hint:** Use your trigger symbol (like \`!\`) before your question so I can respond with maximum adorableness! ✨`;
                break;
            case 'storytelling':
                const randomStarter = game.starters[Math.floor(Math.random() * game.starters.length)];
                gameState.story = randomStarter;
                gameContent = `${game.intro}\n\n**Story starter:** *${randomStarter}...* ✨\n\n**Your turn, darling:** Continue our magical story using your trigger symbol (like \`!your adorable continuation\`)! 💕📚`;
                break;
            case 'wouldyourather':
                const randomQuestion = game.questions[Math.floor(Math.random() * game.questions.length)];
                gameState.question = randomQuestion;
                gameContent = `${game.intro}\n\n**${randomQuestion}** 💭\n\n**Tell me sweetie:** Use your trigger symbol (like \`!I choose flying because it sounds magical!\`) to share your choice and reasoning! I'm so excited to hear! 💕✨`;
                break;
            case 'riddles':
                const randomRiddle = game.riddles[Math.floor(Math.random() * game.riddles.length)];
                gameState.riddle = randomRiddle;
                gameContent = `${game.intro}\n\n**${randomRiddle.question}** 🤔💕\n\n**Your answer, honey:** Use your trigger symbol (like \`!echo\`) to give your answer! I believe in you! ✨`;
                break;
        }

        // ✅ STORE GAME STATE for this user
        activeGames.set(interaction.user.id, gameState);

        const embed = new EmbedBuilder()
            .setColor('#9932CC')
            .setTitle(`🎪 ${game.name} Game Started with Luna!`)
            .setDescription(gameContent)
            .setFooter({ text: 'Remember to use your AI trigger symbol so I can respond to your game moves with maximum cuteness! 💕✨' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Game error:', error);
        await interaction.editReply({ content: 'Oopsie! Something went wrong starting our game, sweetie! 🥺💕' });
    }
}

// ✅ COMPLETE MODULE EXPORT WITH ALL COMMANDS
module.exports = {
    data: [
        new SlashCommandBuilder()
            .setName('ai')
            .setDescription('Configure Luna\'s adorable AI chat settings! 💕')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('Toggle Luna\'s responses in this channel! 🌸')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('personality')
                    .setDescription('Set Luna\'s adorable personality! ✨')
                    .addStringOption(option =>
                        option.setName('type')
                            .setDescription('Choose Luna\'s personality style! 💖')
                            .setRequired(true)
                            .addChoices(
                                { name: '🌟 Cheerful & Bubbly (Super Sunshine!)', value: 'cheerful' },
                                { name: '💕 Sweet & Caring (Ultimate Sweetie)', value: 'caring' },
                                { name: '😘 Playful & Flirty (Cute & Charming)', value: 'playful' },
                                { name: '🌸 Gentle & Supportive (Soft Angel)', value: 'gentle' },
                                { name: '💃 Confident & Sassy (Fierce Queen)', value: 'sassy' }
                            )
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('clear')
                    .setDescription('Clear Luna\'s conversation memory! 🧹💕')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('Check Luna\'s current settings and memory! 📊💖')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('game')
                    .setDescription('Start a super fun conversation game with Luna! 🎮✨')
                    .addStringOption(option =>
                        option.setName('game')
                            .setDescription('Choose a cute game to play with Luna! 💕')
                            .setRequired(true)
                            .addChoices(
                                { name: '🎯 20 Questions (Guess what Luna\'s thinking!)', value: '20questions' },
                                { name: '📚 Story Building (Create magic together!)', value: 'storytelling' },
                                { name: '🤔 Would You Rather (Fun choices!)', value: 'wouldyourather' },
                                { name: '🧩 Riddle Time (Cute brain teasers!)', value: 'riddles' }
                            )
                    )
            ),

        // Legacy commands for backward compatibility
        new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Enable or disable Luna\'s adorable AI chat feature! 💕')
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Turn Luna\'s chat on or off')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder()
            .setName('ai-channel')
            .setDescription('Set which channel Luna should chat in! 🌸')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel where Luna should respond')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder()
            .setName('ai-symbol')
            .setDescription('Set the symbol that triggers Luna\'s responses! ✨')
            .addStringOption(option =>
                option.setName('symbol')
                    .setDescription('Symbol to trigger Luna (e.g., !, ?, @)')
                    .setRequired(true)
                    .setMaxLength(5))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder()
            .setName('ai-status')
            .setDescription('Check Luna\'s current adorable settings! 💖'),
        new SlashCommandBuilder()
            .setName('ai-reset')
            .setDescription('Reset all of Luna\'s settings to default! 🔄')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder()
            .setName('ai-personality')
            .setDescription('Set Luna\'s adorable personality type! 🎭')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Choose Luna\'s personality')
                    .setRequired(true)
                    .addChoices(
                        { name: '🌟 Cheerful', value: 'cheerful' },
                        { name: '💕 Caring', value: 'caring' },
                        { name: '😘 Playful', value: 'playful' },
                        { name: '🌸 Gentle', value: 'gentle' },
                        { name: '💃 Sassy', value: 'sassy' }
                    ))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder()
            .setName('ai-clear')
            .setDescription('Clear your conversation history with Luna! 🧹💕'),
        new SlashCommandBuilder()
            .setName('ai-game')
            .setDescription('Start an adorable conversation game with Luna! 🎮💖')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Choose a cute game to play')
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
        const subcommand = interaction.options?.getSubcommand?.() || null;

        try {
            if (commandName === 'ai') {
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
                            content: '❌ Unknown AI subcommand, sweetie! Please try again! 🥺💕' 
                        });
                }
            } else {
                // Legacy command handling
                switch (commandName) {
                    case 'ai-toggle': 
                        const enabled = interaction.options.getBoolean('enabled');
                        await client.db.setAISetting(interaction.guildId, 'ai_enabled', enabled ? 1 : 0);
                        const embed = new EmbedBuilder()
                            .setColor(enabled ? '#00FF00' : '#FF9900')
                            .setTitle('🤖 Luna\'s AI Chat Settings')
                            .setDescription(`Luna's AI chat has been **${enabled ? 'enabled! Yay! 🎉💕' : 'disabled! Aww! 🥺💔'}** for this server.`)
                            .setTimestamp();
                        await interaction.editReply({ embeds: [embed] });
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
                            content: '❌ Unknown AI command, honey! Please try again! 🥺💕' 
                        });
                }
            }
            console.log('✅ [ai.js] Successfully processed command:', commandName);
        } catch (commandError) {
            console.error('❌ [ai.js] Error executing command:', commandName, commandError);
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ 
                        content: '❌ Oopsie! Something went wrong processing your AI command, sweetie! Please try again later! 🥺💕'
                    });
                } else if (!interaction.replied) {
                    await interaction.followUp({ 
                        content: '❌ Oopsie! Something went wrong processing your AI command, honey! Please try again later! 🥺💕',
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
