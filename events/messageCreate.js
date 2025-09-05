const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const config = require('../config.json');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        console.log(`📨 Message received: "${message.content}" from ${message.author.username}`);

        // ✅ SIMPLE AI TEST - Test if AI responds to !test
        if (message.content === '!test') {
            console.log('🧪 Test message detected, sending simple response');
            try {
                await message.reply('🤖 AI module is working! Your message handler is functioning correctly.');
                return;
            } catch (error) {
                console.error('Failed to send test response:', error);
                return;
            }
        }

        // ✅ SIMPLE AI INTEGRATION TEST
        if (message.content.startsWith('!')) {
            console.log('🤖 AI trigger detected, testing AI module...');

            try {
                // Test if we can load the AI module
                const aiModule = require('../commands/ai.js');
                console.log('✅ AI module loaded successfully');

                // Test if we can get settings
                const aiSettings = await aiModule.getAISettings(client, message.guild.id);
                console.log('⚙️ AI Settings:', aiSettings);

                if (!aiSettings.enabled) {
                    await message.reply('❌ AI is disabled. Use `/ai-toggle enabled:True` to enable it.');
                    return;
                }

                // Test if we can call the AI response function
                const userMessage = message.content.slice(1).trim();
                const isSpecialUser = message.author.id === '1165238276735639572';

                console.log('🔮 Calling AI response function...');
                const aiResponse = await aiModule.getAIResponseWithAllFeatures(
                    userMessage,
                    isSpecialUser,
                    aiSettings.personality || 'casual',
                    message.author.id,
                    message.channel
                );

                console.log('✅ AI response received:', aiResponse.substring(0, 100) + '...');
                await message.reply(aiResponse);

            } catch (error) {
                console.error('❌ AI module error:', error);
                await message.reply(`🚨 AI Error: ${error.message}`);
            }
        }

        // Your existing code for XP, prefix commands, etc. can go here...
    }
};
