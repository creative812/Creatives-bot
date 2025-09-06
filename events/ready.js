const { ActivityType } = require('discord.js');

module.exports = {
    name: 'clientready',  
    once: true,
    execute(client) {
        console.log('🟡 [ready.js] Handler fired');

        client.logger.success(`Bot logged in as ${client.user.tag}!`);
        client.logger.info(`Ready to serve ${client.guilds.cache.size} server(s) and ${client.users.cache.size} user(s)`);

        // Set bot activity
        const activities = [
            { name: 'for rule violations', type: ActivityType.Watching },
            { name: `${client.config.prefix}help for commands`, type: ActivityType.Listening },
            { name: `over ${client.guilds.cache.size} servers`, type: ActivityType.Watching },
            { name: 'Discord moderation', type: ActivityType.Playing }
        ];
        let currentActivity = 0;

        const updateActivity = () => {
            client.user.setActivity(activities[currentActivity]);
            currentActivity = (currentActivity + 1) % activities.length;
        };

        // Set initial activity
        updateActivity();

        // Change activity every 30 seconds
        setInterval(updateActivity, 30000);

        // Log some startup statistics
        client.logger.info(`Commands loaded: ${client.commands.size}`);
        client.logger.info(`Bot latency: ${Math.round(client.ws.ping)}ms`);

        // Database cleanup on startup
        try {
            client.db.cleanupOldData();
            client.logger.info('Database cleanup completed');
        } catch (error) {
            client.logger.error('Database cleanup failed:', error);
        }

        // Log cleanup on startup
        try {
            client.logger.cleanup(30); // Keep logs for 30 days
        } catch (error) {
            client.logger.error('Log cleanup failed:', error);
        }
    }
};
