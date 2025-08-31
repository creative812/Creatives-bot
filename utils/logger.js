const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        // Ensure logs directory exists
        const logsDir = './logs';
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        this.logFile = path.join(logsDir, `bot-${new Date().toISOString().split('T')[0]}.log`);
    }

    /**
     * Get current timestamp
     * @returns {string}
     */
    getTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Write log to file and console
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {any} data - Additional data
     */
    writeLog(level, message, data = null) {
        const timestamp = this.getTimestamp();
        const logMessage = data 
            ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
            : `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        // Write to console with colors
        const colors = {
            info: '\x1b[36m',    // cyan
            warn: '\x1b[33m',    // yellow
            error: '\x1b[31m',   // red
            debug: '\x1b[35m',   // magenta
            success: '\x1b[32m'  // green
        };

        const reset = '\x1b[0m';
        const color = colors[level] || reset;
        
        console.log(`${color}${logMessage}${reset}`);

        // Write to file
        try {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {any} data - Additional data
     */
    info(message, data = null) {
        this.writeLog('info', message, data);
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {any} data - Additional data
     */
    warn(message, data = null) {
        this.writeLog('warn', message, data);
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {any} data - Additional data
     */
    error(message, data = null) {
        this.writeLog('error', message, data);
    }

    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {any} data - Additional data
     */
    debug(message, data = null) {
        this.writeLog('debug', message, data);
    }

    /**
     * Log success message
     * @param {string} message - Log message
     * @param {any} data - Additional data
     */
    success(message, data = null) {
        this.writeLog('success', message, data);
    }

    /**
     * Log command usage
     * @param {string} command - Command name
     * @param {User} user - User who executed command
     * @param {Guild} guild - Guild where command was executed
     */
    logCommand(command, user, guild) {
        this.info(`Command executed: ${command} by ${user.tag} (${user.id}) in ${guild?.name || 'DM'} (${guild?.id || 'DM'})`);
    }

    /**
     * Log moderation action
     * @param {string} action - Moderation action
     * @param {User} target - Target user
     * @param {User} moderator - Moderator
     * @param {Guild} guild - Guild
     * @param {string} reason - Reason
     */
    logModeration(action, target, moderator, guild, reason) {
        this.info(`Moderation: ${action} - Target: ${target.tag} (${target.id}) - Moderator: ${moderator.tag} (${moderator.id}) - Guild: ${guild.name} (${guild.id}) - Reason: ${reason || 'No reason'}`);
    }

    /**
     * Clean up old log files
     * @param {number} daysToKeep - Number of days to keep logs
     */
    cleanup(daysToKeep = 30) {
        const logsDir = './logs';
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        try {
            const files = fs.readdirSync(logsDir);
            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.isFile() && file.endsWith('.log') && stats.mtime < cutoffDate) {
                    fs.unlinkSync(filePath);
                    this.info(`Deleted old log file: ${file}`);
                }
            });
        } catch (error) {
            this.error('Failed to cleanup old log files:', error);
        }
    }
}

module.exports = new Logger();
