const cron = require('node-cron');
const { endGiveaway } = require('../commands/giveaway.js');
const TimeParser = require('../utils/timeParser.js');

let client = null;

/**
 * Initialize scheduled tasks
 * @param {Client} discordClient - Discord client instance
 */
function init(discordClient) {
    client = discordClient;
    
    // Start all scheduled tasks
    startGiveawayChecker();
    startMuteChecker();
    startDataCleanup();
    startStatusUpdater();
    
    client.logger.info('Scheduled tasks initialized');
}

/**
 * Check for ended giveaways every minute
 */
function startGiveawayChecker() {
    cron.schedule('* * * * *', async () => {
        try {
            const endedGiveaways = client.db.getActiveGiveaways();
            
            for (const giveaway of endedGiveaways) {
                await endGiveaway(client, giveaway);
                client.logger.info(`Automatically ended giveaway: ${giveaway.title}`);
            }
        } catch (error) {
            client.logger.error('Error in giveaway checker task:', error);
        }
    });
    
    client.logger.info('Giveaway checker task started');
}

/**
 * Check for expired mutes every 30 seconds
 */
function startMuteChecker() {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            const expiredMutes = client.db.getExpiredMutes();
            
            for (const mute of expiredMutes) {
                try {
                    const guild = client.guilds.cache.get(mute.guild_id);
                    if (!guild) continue;
                    
                    const member = guild.members.cache.get(mute.user_id);
                    if (!member) {
                        // Remove mute from database if member not found
                        client.db.removeMute(mute.guild_id, mute.user_id);
                        continue;
                    }
                    
                    // Check if member is still muted
                    if (member.isCommunicationDisabled()) {
                        await member.timeout(null, 'Mute expired');
                        client.logger.info(`Automatically unmuted: ${member.user.tag} in ${guild.name}`);
                        
                        // Send notification to log channel
                        const settings = client.db.getGuildSettings(guild.id);
                        if (settings?.log_channel_id) {
                            const logChannel = guild.channels.cache.get(settings.log_channel_id);
                            if (logChannel) {
                                const EmbedManager = require('../utils/embeds.js');
                                const embed = EmbedManager.createEmbed('🔓 Auto-Unmute', 
                                    `${member.user.tag} has been automatically unmuted (mute expired).`);
                                embed.addFields([
                                    { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
                                    { name: 'Original Reason', value: mute.reason || 'No reason provided', inline: true },
                                    { name: 'Muted At', value: TimeParser.getDiscordTimestamp(mute.created_at), inline: true }
                                ]);
                                await logChannel.send({ embeds: [embed] });
                            }
                        }
                    }
                    
                    // Remove from database
                    client.db.removeMute(mute.guild_id, mute.user_id);
                    
                } catch (error) {
                    client.logger.error(`Error unmuting user ${mute.user_id}:`, error);
                }
            }
        } catch (error) {
            client.logger.error('Error in mute checker task:', error);
        }
    });
    
    client.logger.info('Mute checker task started');
}

/**
 * Clean up old data daily at 3 AM
 */
function startDataCleanup() {
    cron.schedule('0 3 * * *', async () => {
        try {
            client.logger.info('Starting daily data cleanup...');
            
            // Clean up old warnings and logs
            client.db.cleanupOldData();
            
            // Clean up log files
            client.logger.cleanup(30); // Keep logs for 30 days
            
            // Backup database weekly (on Sundays)
            const now = new Date();
            if (now.getDay() === 0) { // Sunday
                try {
                    const backupPath = client.db.backup();
                    client.logger.info(`Weekly database backup created: ${backupPath}`);
                } catch (backupError) {
                    client.logger.error('Failed to create weekly backup:', backupError);
                }
            }
            
            client.logger.info('Daily data cleanup completed');
        } catch (error) {
            client.logger.error('Error in data cleanup task:', error);
        }
    });
    
    client.logger.info('Data cleanup task started (daily at 3 AM)');
}

/**
 * Update bot status every 5 minutes
 */
function startStatusUpdater() {
    cron.schedule('*/5 * * * *', async () => {
        try {
            // Update guild count and other stats
            const guildCount = client.guilds.cache.size;
            const userCount = client.users.cache.size;
            
            // You can customize these activities based on your bot's features
            const activities = [
                { name: `${guildCount} servers`, type: 3 }, // Watching
                { name: `${userCount} users`, type: 3 }, // Watching
                { name: 'for rule violations', type: 3 }, // Watching
                { name: `${client.config.prefix}help for commands`, type: 2 }, // Listening
                { name: 'Discord moderation', type: 0 } // Playing
            ];
            
            const randomActivity = activities[Math.floor(Math.random() * activities.length)];
            client.user.setActivity(randomActivity.name, { type: randomActivity.type });
            
        } catch (error) {
            client.logger.error('Error in status updater task:', error);
        }
    });
    
    client.logger.info('Status updater task started (every 5 minutes)');
}

/**
 * Handle process shutdown gracefully
 */
function setupGracefulShutdown() {
    const shutdown = (signal) => {
        client.logger.info(`Received ${signal}, shutting down gracefully...`);
        
        // Stop all cron jobs
        cron.getTasks().forEach(task => task.stop());
        
        // Close database connections
        if (client.db && client.db.close) {
            client.db.close();
        }
        
        // Destroy Discord client
        if (client.destroy) {
            client.destroy();
        }
        
        process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

// Set up graceful shutdown when module is loaded
setupGracefulShutdown();

module.exports = {
    init,
    startGiveawayChecker,
    startMuteChecker,
    startDataCleanup,
    startStatusUpdater
};
