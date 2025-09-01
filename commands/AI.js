const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Hardcoded special user ID - replace with your actual Discord ID
const SPECIAL_USER_ID = '1165238276735639572';

module.exports = {
    data: [
        // Toggle AI on/off
        new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Enable or disable AI chat feature for this server')
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Turn AI chat on or off')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // Set AI channel
        new SlashCommandBuilder()
            .setName('ai-channel')
            .setDescription('Set which channel the AI should respond in')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel where AI should respond')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // Set trigger symbol
        new SlashCommandBuilder()
            .setName('ai-symbol')
            .setDescription('Set the symbol that triggers AI responses')
            .addStringOption(option =>
                option.setName('symbol')
                    .setDescription('Symbol to trigger AI (e.g., !, ?, @)')
                    .setRequired(true)
                    .setMaxLength(5))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // Check AI status
        new SlashCommandBuilder()
            .setName('ai-status')
            .setDescription('Check current AI chat settings for this server'),

        // Reset AI settings
        new SlashCommandBuilder()
            .setName('ai-reset')
            .setDescription('Reset all AI settings to default')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // Set AI personality
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
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    ],

    async execute(interaction, database) {
        const { commandName, guildId, user } = interaction;

        try {
            switch (commandName) {
                case 'ai-toggle':
                    await handleToggle(interaction, database);
                    break;
                case 'ai-channel':
                    await handleChannel(interaction, database);
                    break;
                case 'ai-symbol':
                    await handleSymbol(interaction, database);
                    break;
                case 'ai-status':
                    await handleStatus(interaction, database);
                    break;
                case 'ai-reset':
                    await handleReset(interaction, database);
                    break;
                case 'ai-personality':
                    await handlePersonality(interaction, database);
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

    // Message handler for AI responses
    async handleMessage(message, database) {
        // Ignore bot messages
        if (message.author.bot) return;

        const guildId = message.guild?.id;
        if (!guildId) return;

        try {
            // Get AI settings for the guild
            const settings = await getAISettings(database, guildId);

            // Check if AI is enabled
            if (!settings.enabled) return;

            // Check if message is in the correct channel
            if (settings.channelId && message.channel.id !== settings.channelId) return;

            // Check if message starts with trigger symbol
            if (!message.content.startsWith(settings.triggerSymbol)) return;

            // Remove trigger symbol from message
            const userMessage = message.content.slice(settings.triggerSymbol.length).trim();
            if (!userMessage) return;

            // Show typing indicator
            await message.channel.sendTyping();

            // Determine response tone
            const isSpecialUser = message.author.id === SPECIAL_USER_ID;
            const personality = settings.personality || 'casual';

            // Get AI response
            const aiResponse = await getAIResponse(userMessage, isSpecialUser, personality);

            // Send response
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

// Helper Functions

async function handleToggle(interaction, database) {
    const enabled = interaction.options.getBoolean('enabled');
    const guildId = interaction.guildId;

    await database.setAISetting(guildId, 'ai_enabled', enabled ? 1 : 0);

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00FF00' : '#FF9900')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI chat has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleChannel(interaction, database) {
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

    await database.setAISetting(guildId, 'ai_channel_id', channel.id);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 AI Chat Settings')
        .setDescription(`AI will now respond in ${channel}.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleSymbol(interaction, database) {
    const symbol = interaction.options.getString('symbol');
    const guildId = interaction.guildId;

    await database.setAISetting(guildId, 'ai_trigger_symbol', symbol);

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

async function handleStatus(interaction, database) {
    const guildId = interaction.guildId;
    const settings = await getAISettings(database, guildId);

    const channel = settings.channelId ? `<#${settings.channelId}>` : 'Any channel';
    const statusColor = settings.enabled ? '#00FF00' : '#FF0000';
    const statusText = settings.enabled ? '✅ Enabled' : '❌ Disabled';

    const embed = new EmbedBuilder()
        .setColor(statusColor)
        .setTitle('🤖 AI Chat Status')
        .addFields([
            { name: 'Status', value: statusText, inline: true },
            { name: 'Channel', value: channel, inline: true },
            { name: 'Trigger Symbol', value: `\`${settings.triggerSymbol}\``, inline: true },
            { name: 'Personality', value: settings.personality || 'casual', inline: true },
            { name: 'Usage', value: `Type \`${settings.triggerSymbol}your message\` in ${channel} to chat with AI`, inline: false }
        ])
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleReset(interaction, database) {
    const guildId = interaction.guildId;

    await database.setAISetting(guildId, 'ai_enabled', 0);
    await database.setAISetting(guildId, 'ai_channel_id', null);
    await database.setAISetting(guildId, 'ai_trigger_symbol', '!');
    await database.setAISetting(guildId, 'ai_personality', 'casual');

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

async function handlePersonality(interaction, database) {
    const personality = interaction.options.getString('type');
    const guildId = interaction.guildId;

    await database.setAISetting(guildId, 'ai_personality', personality);

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

async function getAISettings(database, guildId) {
    try {
        const result = await database.getGuildSetting(guildId);
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

async function getAIResponse(message, isSpecialUser, personality) {
    try {
        // Build the AI prompt based on user type and personality
        let systemPrompt = `You are a helpful AI assistant in a Discord server. You must ALWAYS respond in English only, even if the user writes in another language. You can understand multiple languages but your response must be in English.

Personality: ${personality}
User type: ${isSpecialUser ? 'VIP user - be respectful and polite' : 'Regular user - be frank, casual, and feel free to crack appropriate jokes'}

Guidelines:
- Keep responses concise (under 2000 characters)
- Be helpful and informative
- ${isSpecialUser ? 'Be respectful, polite, and professional' : 'Be frank, casual, and add humor when appropriate'}
- Always respond in English regardless of input language
- Avoid controversial topics
- Don't mention being an AI unless directly asked`;

        // Here you would integrate with your chosen AI API
        // For now, I'll provide a placeholder that you can replace with actual API calls

        // Example with OpenAI (replace with your preferred AI service)
        /*
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                max_tokens: 500,
                temperature: isSpecialUser ? 0.7 : 0.9
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
        */

        // Placeholder response - replace with actual AI API integration
        const responses = isSpecialUser ? [
            "I'd be happy to help you with that. Let me provide you with a detailed response.",
            "That's an excellent question. Here's what I can tell you about that topic.",
            "I appreciate you asking. Let me give you the best information I can provide."
        ] : [
            "Haha, that's a good one! Let me break it down for you...",
            "Oh, you're asking the real questions now! Here's the deal...",
            "Well, well, well... someone's curious today! Let me enlighten you..."
        ];

        return responses[Math.floor(Math.random() * responses.length)] + `\n\n*Regarding: "${message}"*\n\n⚠️ **Note**: AI integration is not yet configured. Please add your AI API credentials to enable full functionality.`;

    } catch (error) {
        console.error('AI API Error:', error);
        return "Sorry, I'm having trouble thinking right now. My circuits might need some coffee! ☕ Please try again in a moment.";
    }
}
