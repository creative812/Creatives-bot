require('dotenv').config({ override: true });

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// Get Discord token and client ID
const token = process.env.DISCORD_TOKEN || config.token;
const clientId = process.env.CLIENT_ID || config.clientId;

// Debug information
console.log('🔍 Debug Info:');
console.log('Token configured:', !!token);
console.log('ClientId:', clientId);
console.log('Process args:', process.argv);

if (!token) {
    console.error('❌ No Discord token provided! Please set DISCORD_TOKEN environment variable or add it to config.json');
    process.exit(1);
}

if (!clientId) {
    console.error('❌ No client ID provided! Please set CLIENT_ID environment variable or add clientId to config.json');
    process.exit(1);
}

const commands = [];

// Load all command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const commandModule = require(`./commands/${file}`);

    // Handle existing style (commands array)
    if (commandModule.commands) {
        commandModule.commands.forEach(command => {
            if (command.data) {
                commands.push(command.data.toJSON());
                console.log(`✅ Loaded command: ${command.data.name}`);
            }
        });
    }
    // Handle AI style (data array)
    else if (commandModule.data && Array.isArray(commandModule.data)) {
        commandModule.data.forEach(command => {
            commands.push(command.toJSON());
            console.log(`✅ Loaded AI command: ${command.name}`);
        });
    }
    // Handle single command export
    else if (commandModule.data) {
        commands.push(commandModule.data.toJSON());
        console.log(`✅ Loaded single command: ${commandModule.data.name}`);
    }
    else {
        console.log(`⚠️ Skipping ${file} - no valid command structure found`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// Test token validity first
const testToken = async () => {
    try {
        console.log('\n🔍 Testing token validity...');
        const application = await rest.get('/applications/@me');
        console.log(`✅ Token is valid! Application: ${application.name} (${application.id})`);
        return true;
    } catch (error) {
        console.error('❌ Token test failed:', error.message);
        if (error.status === 401) {
            console.error('🔑 Your bot token is invalid. Please:');
            console.error('   1. Go to Discord Developer Portal');
            console.error('   2. Go to your bot application → Bot tab');
            console.error('   3. Click "Reset Token" and get a new one');
            console.error('   4. Update your .env file or config.json');
        }
        return false;
    }
};

// Deploy commands
(async () => {
    // Test token first
    const tokenValid = await testToken();
    if (!tokenValid) {
        process.exit(1);
    }

    try {
        console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Get deployment mode from command line arguments
        const args = process.argv.slice(2);

        if (args.length === 0) {
            // No arguments - deploy globally
            console.log('🌍 Deploying globally (this may take up to 1 hour to sync)');

            const data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log(`✅ Successfully deployed ${data.length} application (/) commands globally.`);

        } else if (args[0] === 'all') {
            // Deploy to all your servers
            const guildIds = [
                '1405977553742729297', // Your first server
                '1410899842066157610',// Add your second server ID here: 'YOUR_SECOND_SERVER_ID'
            ];

            console.log(`📍 Deploying to ${guildIds.length} servers...`);

            for (const guildId of guildIds) {
                try {
                    console.log(`\n🎯 Deploying to guild: ${guildId}`);
                    const data = await rest.put(
                        Routes.applicationGuildCommands(clientId, guildId),
                        { body: commands },
                    );
                    console.log(`✅ Successfully deployed ${data.length} commands to guild ${guildId}`);
                } catch (error) {
                    console.error(`❌ Failed to deploy to guild ${guildId}:`, error.message);
                    if (error.status === 403) {
                        console.error('🚫 Bot is not in this server or lacks permissions');
                    }
                }
            }

        } else {
            // Deploy to specific guild
            const guildId = args[0];
            console.log(`📍 Deploying to guild: ${guildId}`);

            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`✅ Successfully deployed ${data.length} application (/) commands for guild ${guildId}.`);
        }

        console.log('\n📋 Deployed Commands:');
        commands.forEach((cmd, index) => {
            console.log(`${index + 1}. /${cmd.name} - ${cmd.description}`);
        });

        console.log('\n🎉 Command deployment completed successfully!');
        console.log('\n💡 Usage:');
        console.log('   node deploy-commands.js                    (deploy globally)');
        console.log('   node deploy-commands.js <guild_id>         (deploy to specific guild)');
        console.log('   node deploy-commands.js all                (deploy to all configured guilds)');

    } catch (error) {
        console.error('❌ Error deploying commands:', error);

        if (error.status === 401) {
            console.error('🔑 Unauthorized - Token is invalid or expired');
            console.error('   → Reset your bot token in Discord Developer Portal');
        } else if (error.status === 403) {
            console.error('🚫 Forbidden - Bot lacks permissions or is not in the server');
            console.error('   → Make sure bot is in the server with applications.commands scope');
        } else if (error.status === 404) {
            console.error('🔍 Not Found - Check your Client ID or Guild ID');
        } else if (error.code === 50001) {
            console.error('🔒 Missing Access - Make sure the bot is invited to the server with the applications.commands scope');
        } else if (error.code === 10001) {
            console.error('🔍 Unknown Application - Check that your CLIENT_ID is correct');
        } else if (error.code === 50035) {
            console.error('📝 Invalid Form Body - Check your command structure');
        }

        process.exit(1);
    }
})();

