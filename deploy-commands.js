const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// Get Discord token
const token = process.env.DISCORD_TOKEN || config.token;
const clientId = process.env.CLIENT_ID || config.clientId;

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
    
    if (commandModule.commands) {
        commandModule.commands.forEach(command => {
            if (command.data) {
                commands.push(command.data.toJSON());
                console.log(`✅ Loaded command: ${command.name}`);
            }
        });
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// Deploy commands
(async () => {
    try {
        console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Get guild ID from command line argument for guild-specific deployment
        const guildId = process.argv[2];
        
        if (guildId) {
            // Deploy to specific guild (faster for testing)
            console.log(`📍 Deploying to guild: ${guildId}`);
            
            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );

            console.log(`✅ Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
        } else {
            // Deploy globally (takes up to 1 hour to sync)
            console.log('🌍 Deploying globally (this may take up to 1 hour to sync)');
            
            const data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );

            console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally.`);
        }

        console.log('\n📋 Deployed Commands:');
        commands.forEach((cmd, index) => {
            console.log(`${index + 1}. /${cmd.name} - ${cmd.description}`);
        });

        console.log('\n🎉 Command deployment completed successfully!');
        console.log('\n💡 Usage:');
        console.log('   node deploy-commands.js              (deploy globally)');
        console.log('   node deploy-commands.js <guild_id>   (deploy to specific guild)');

    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        
        if (error.code === 50001) {
            console.error('🔒 Missing Access - Make sure the bot is invited to the server with the applications.commands scope');
        } else if (error.code === 10001) {
            console.error('🔍 Unknown Application - Check that your CLIENT_ID is correct');
        } else if (error.code === 50035) {
            console.error('📝 Invalid Form Body - Check your command structure');
        }
        
        process.exit(1);
    }
})();
