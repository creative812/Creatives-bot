const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Hardcoded special user ID
const SPECIAL_USER_ID = '1165238276735639572';

// ✅ ENHANCED: Smart conversation memory settings
const MAX_MESSAGES_PER_USER = 150; // Maximum messages to store per user
const CONTEXT_MESSAGES = 50; // Messages to send to AI (recent ones)
const CLEANUP_THRESHOLD = 200; // Clean up when we have this many users

// ✅ NEW: In-memory conversation storage with smart management
const conversationHistory = new Map();

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

        // ✅ NEW: Clear conversation memory command
        new SlashCommandBuilder()
            .setName('ai-clear')
            .setDescription('Clear your conversation history with the AI')
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

    // ✅ ENHANCED: Message handler with smart conversation memory
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

            // ✅ ENHANCED: Get AI response with smart conversation context
            const aiResponse = await getAIResponseWithSmartMemory(
                userMessage, 
                isSpecialUser, 
                personality, 
                message.author.id
            );

            await message.reply(aiResponse);

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
        .setTitle('🤖 AI Chat Status')
        .addFields([
            { name: 'Status', value: statusText, inline: true },
            { name: 'Channel', value: channel, inline: true },
            { name: 'Trigger Symbol', value: `\`${settings.triggerSymbol}\``, inline: true },
            { name: 'Personality', value: settings.personality || 'casual', inline: true },
            { name: 'Your Memory', value: memoryInfo, inline: true },
            { name: 'Total Users', value: `${conversationHistory.size} with history`, inline: true },
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

// ✅ NEW: Clear conversation memory
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

// ✅ NEW: Smart token estimation
function estimateTokens(text) {
    return Math.ceil(text.length / 4); // Rough estimate: 1 token ≈ 4 characters
}

// ✅ UPDATED: OpenAI Integration with Smart Memory Management
async function getAIResponseWithSmartMemory(message, isSpecialUser, personality, userId) {
    try {
        const OpenAI = require('openai');

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Get or create conversation history for this user
        let userHistory = conversationHistory.get(userId) || [];

        // Add current user message to history
        userHistory.push({ role: 'user', content: message });

        // Keep maximum messages per user (150 * 2 = 300 total including AI responses)
        if (userHistory.length > MAX_MESSAGES_PER_USER * 2) {
            userHistory = userHistory.slice(-MAX_MESSAGES_PER_USER * 2);
        }

        // ✅ SMART: Select recent messages that fit within token limit
        let contextMessages = userHistory.slice(0, -1); // All except current message
        let totalTokens = 0;
        let selectedContext = [];

        // Start from most recent and work backwards
        for (let i = contextMessages.length - 1; i >= 0; i--) {
            const msgTokens = estimateTokens(contextMessages[i].content);
            if (totalTokens + msgTokens < 3000) { // Leave room for system prompt + response
                selectedContext.unshift(contextMessages[i]);
                totalTokens += msgTokens;
            } else {
                break; // Stop if we'd exceed token limit
            }
        }

        // Build messages for OpenAI format
        let messages = [
            {
                role: "system",
                content: `You are a helpful AI assistant in a Discord server. You must ALWAYS respond in English only.

Personality: ${personality}
User type: ${isSpecialUser ? 'VIP user - be respectful, polite, and professional' : 'Regular user - be frank, casual, and feel free to crack appropriate jokes'}

Guidelines:
- Keep responses concise (under 1500 characters)
- Be helpful and informative
- ${isSpecialUser ? 'Be respectful, polite, and professional' : 'Be frank, casual, and add humor when appropriate'}
- Always respond in English regardless of input language
- Remember the conversation context and refer to previous messages naturally
- Avoid controversial topics
- Build on the conversation history to create engaging dialogue`
            }
        ];

        // Add conversation history
        messages = messages.concat(selectedContext);
        messages.push({ role: 'user', content: message });

        // Call OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Fast and affordable!
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

// ✅ ENHANCED: Better memory cleanup
function cleanUpOldConversations() {
    const entries = Array.from(conversationHistory.entries());

    // Keep only the 100 most recent conversations
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
