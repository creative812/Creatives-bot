const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger.js');

// Ensure the data directory exists
const dataDir = path.resolve('./data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Path to the SQLite database file
const dbPath = path.join(dataDir, 'bot.db');

// Initialize the SQLite database connection
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize all necessary tables and ensure columns exist, including safe migrations
const initTables = () => {
    try {
        // Guild settings table - UPDATED WITH AI FIELDS AND COMMAND MANAGEMENT
        db.exec(`
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY,
                prefix TEXT DEFAULT '!',
                log_channel_id TEXT,
                welcome_channel_id TEXT,
                mute_role_id TEXT,
                auto_role_id TEXT,
                welcome_message TEXT,
                leave_message TEXT,
                embed_color TEXT DEFAULT '7289DA',
                automod_enabled INTEGER DEFAULT 1,
                ai_enabled INTEGER DEFAULT 0,
                ai_channel_id TEXT,
                ai_trigger_symbol TEXT DEFAULT '!',
                ai_personality TEXT DEFAULT 'cheerful',
                ai_channels TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // NEW: Disabled commands table for command management
        db.exec(`
            CREATE TABLE IF NOT EXISTS disabled_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                command_name TEXT NOT NULL,
                disabled_by TEXT NOT NULL,
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, command_name)
            )
        `);

        // Channel messages table for AI memory (stores last 100 messages per channel)
        db.exec(`
            CREATE TABLE IF NOT EXISTS channel_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                message_content TEXT NOT NULL,
                is_ai_response INTEGER DEFAULT 0,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add index for better performance
        db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_timestamp ON channel_messages(channel_id, timestamp)`);

        // Generic settings table for key-value pairs (level channel, messages, etc.)
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                guild_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, key)
            )
        `);

        // Users table for leveling (EXP, level, messages)
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                exp INTEGER DEFAULT 0,
                lvl INTEGER DEFAULT 0,
                messages INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

        // Roles table to assign roles by level
        db.exec(`
            CREATE TABLE IF NOT EXISTS roles (
                guild_id TEXT NOT NULL,
                lvl INTEGER NOT NULL,
                role_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, lvl)
            )
        `);

        // Warnings table
        db.exec(`
            CREATE TABLE IF NOT EXISTS warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME
            )
        `);

        // Mutes table
        db.exec(`
            CREATE TABLE IF NOT EXISTS mutes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Giveaways table
        db.exec(`
            CREATE TABLE IF NOT EXISTS giveaways (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                message_id TEXT UNIQUE,
                host_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                winner_count INTEGER DEFAULT 1,
                requirements TEXT,
                ends_at DATETIME NOT NULL,
                ended INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Giveaway entries table
        db.exec(`
            CREATE TABLE IF NOT EXISTS giveaway_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                giveaway_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (giveaway_id) REFERENCES giveaways(id),
                UNIQUE(giveaway_id, user_id)
            )
        `);

        // Moderation logs table
        db.exec(`
            CREATE TABLE IF NOT EXISTS mod_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target_user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                duration TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Self-roles table
        db.exec(`
            CREATE TABLE IF NOT EXISTS self_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                emoji TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, role_id)
            )
        `);

        // Ticket settings table
        db.exec(`
            CREATE TABLE IF NOT EXISTS ticket_settings (
                guild_id TEXT PRIMARY KEY,
                category_id TEXT,
                staff_role_ids TEXT,
                log_channel_id TEXT,
                next_ticket_number INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tickets table
        db.exec(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                channel_id TEXT UNIQUE,
                ticket_number INTEGER NOT NULL,
                reason TEXT,
                status TEXT DEFAULT 'open',
                claimed_by TEXT,
                closed_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME
            )
        `);

        // Migration fixes - safely add missing columns if not present
        const addColumnIfNotExists = (table, column, definition) => {
            try {
                const columns = db.prepare(`PRAGMA table_info(${table})`).all();
                const columnExists = columns.some(col => col.name === column);
                if (!columnExists) {
                    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                }
            } catch (error) {
                // Column might already exist or table doesn't exist
            }
        };

        // Add missing columns for existing databases
        addColumnIfNotExists('ticket_settings', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
        addColumnIfNotExists('ticket_settings', 'staff_role_ids', 'TEXT');

        // AI COLUMNS MIGRATION - Add these for existing databases
        addColumnIfNotExists('guild_settings', 'ai_enabled', 'INTEGER DEFAULT 0');
        addColumnIfNotExists('guild_settings', 'ai_channel_id', 'TEXT');
        addColumnIfNotExists('guild_settings', 'ai_trigger_symbol', 'TEXT DEFAULT "!"');
        addColumnIfNotExists('guild_settings', 'ai_personality', 'TEXT DEFAULT "cheerful"');
        addColumnIfNotExists('guild_settings', 'ai_channels', 'TEXT DEFAULT "[]"');

        Logger.info('Database tables initialized successfully');
    } catch (error) {
        Logger.error('Error initializing database tables:', error);
        throw error;
    }
};

initTables();

// Prepared SQL statements for all features (leveling, tickets, giveaways, moderation, etc.)
const statements = {
    // Guild settings - UPDATED TO INCLUDE AI FIELDS AND COMMAND MANAGEMENT
    getGuildSettings: db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`),
    setGuildSettings: db.prepare(`
        INSERT OR REPLACE INTO guild_settings 
        (guild_id, prefix, log_channel_id, welcome_channel_id, mute_role_id, auto_role_id, 
         welcome_message, leave_message, embed_color, automod_enabled, ai_enabled, 
         ai_channel_id, ai_trigger_symbol, ai_personality, ai_channels, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `),

    // Command management statements - NEW
    disableCommand: db.prepare(`
        INSERT OR REPLACE INTO disabled_commands 
        (guild_id, command_name, disabled_by, reason) 
        VALUES (?, ?, ?, ?)
    `),
    enableCommand: db.prepare(`
        DELETE FROM disabled_commands 
        WHERE guild_id = ? AND command_name = ?
    `),
    getDisabledCommand: db.prepare(`
        SELECT * FROM disabled_commands 
        WHERE guild_id = ? AND command_name = ?
    `),
    getDisabledCommands: db.prepare(`
        SELECT * FROM disabled_commands 
        WHERE guild_id = ?
    `),

    // Channel messages for AI memory
    addChannelMessage: db.prepare(`
        INSERT INTO channel_messages 
        (channel_id, user_id, username, message_content, is_ai_response, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getChannelHistory: db.prepare(`
        SELECT * FROM channel_messages 
        WHERE channel_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
    `),
    cleanOldChannelMessages: db.prepare(`
        DELETE FROM channel_messages 
        WHERE channel_id = ? AND id NOT IN (
            SELECT id FROM channel_messages 
            WHERE channel_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 100
        )
    `),
    getChannelMessageCount: db.prepare(`SELECT COUNT(*) as count FROM channel_messages WHERE channel_id = ?`),
    clearChannelHistory: db.prepare(`DELETE FROM channel_messages WHERE channel_id = ?`),

    // Settings
    setSetting: db.prepare(`INSERT OR REPLACE INTO settings (guild_id, key, value) VALUES (?, ?, ?)`),
    getSetting: db.prepare(`SELECT value FROM settings WHERE guild_id = ? AND key = ?`),
    deleteSetting: db.prepare(`DELETE FROM settings WHERE guild_id = ? AND key = ?`),

    // User leveling system
    getUser: db.prepare(`SELECT * FROM users WHERE guild_id = ? AND user_id = ?`),
    createUser: db.prepare(`
        INSERT OR IGNORE INTO users (guild_id, user_id, exp, lvl, messages) 
        VALUES (?, ?, 0, 0, 0)
    `),
    updateUser: db.prepare(`
        UPDATE users 
        SET exp = ?, lvl = ?, messages = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE guild_id = ? AND user_id = ?
    `),
    getTopUsers: db.prepare(`
        SELECT * FROM users 
        WHERE guild_id = ? 
        ORDER BY exp DESC 
        LIMIT ?
    `),
    resetAllUsers: db.prepare(`
        UPDATE users 
        SET exp = 0, lvl = 0, messages = 0, updated_at = CURRENT_TIMESTAMP 
        WHERE guild_id = ?
    `),

    // Role management
    addLevelRole: db.prepare(`
        INSERT OR REPLACE INTO roles (guild_id, lvl, role_id) 
        VALUES (?, ?, ?)
    `),
    removeLevelRole: db.prepare(`DELETE FROM roles WHERE guild_id = ? AND lvl = ?`),
    getLevelRoles: db.prepare(`SELECT * FROM roles WHERE guild_id = ? ORDER BY lvl ASC`),
    getRoleForLevel: db.prepare(`SELECT * FROM roles WHERE guild_id = ? AND lvl = ?`),

    // Warning system
    addWarning: db.prepare(`
        INSERT INTO warnings (guild_id, user_id, moderator_id, reason, expires_at) 
        VALUES (?, ?, ?, ?, ?)
    `),
    getWarnings: db.prepare(`
        SELECT * FROM warnings 
        WHERE guild_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now')) 
        ORDER BY created_at DESC 
        LIMIT ?
    `),
    getAllWarnings: db.prepare(`
        SELECT * FROM warnings 
        WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > datetime('now')) 
        ORDER BY created_at DESC 
        LIMIT ?
    `),
    clearWarnings: db.prepare(`DELETE FROM warnings WHERE guild_id = ? AND user_id = ?`),
    removeExpiredWarnings: db.prepare(`DELETE FROM warnings WHERE expires_at <= datetime('now')`),

    // Mute system
    addMute: db.prepare(`
        INSERT INTO mutes (guild_id, user_id, moderator_id, reason, expires_at) 
        VALUES (?, ?, ?, ?, ?)
    `),
    getMute: db.prepare(`
        SELECT * FROM mutes 
        WHERE guild_id = ? AND user_id = ? AND expires_at > datetime('now') 
        ORDER BY created_at DESC 
        LIMIT 1
    `),
    removeMute: db.prepare(`DELETE FROM mutes WHERE guild_id = ? AND user_id = ?`),
    getExpiredMutes: db.prepare(`
        SELECT * FROM mutes 
        WHERE expires_at <= datetime('now')
    `),

    // Giveaway system
    createGiveaway: db.prepare(`
        INSERT INTO giveaways 
        (guild_id, channel_id, message_id, host_id, title, description, winner_count, requirements, ends_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getGiveaway: db.prepare(`SELECT * FROM giveaways WHERE message_id = ?`),
    endGiveaway: db.prepare(`UPDATE giveaways SET ended = 1 WHERE id = ?`),
    getActiveGiveaways: db.prepare(`
        SELECT * FROM giveaways 
        WHERE ended = 0 AND ends_at <= datetime('now')
    `),
    addGiveawayEntry: db.prepare(`
        INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) 
        VALUES (?, ?)
    `),
    removeGiveawayEntry: db.prepare(`
        DELETE FROM giveaway_entries 
        WHERE giveaway_id = ? AND user_id = ?
    `),
    getGiveawayEntries: db.prepare(`SELECT * FROM giveaway_entries WHERE giveaway_id = ?`),

    // Moderation logs
    addModLog: db.prepare(`
        INSERT INTO mod_logs (guild_id, action_type, target_user_id, moderator_id, reason, duration) 
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getModLogs: db.prepare(`
        SELECT * FROM mod_logs 
        WHERE guild_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `),
    getUserModLogs: db.prepare(`
        SELECT * FROM mod_logs 
        WHERE guild_id = ? AND target_user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `),

    // Self-roles
    addSelfRole: db.prepare(`
        INSERT OR REPLACE INTO self_roles (guild_id, role_id, emoji, description) 
        VALUES (?, ?, ?, ?)
    `),
    removeSelfRole: db.prepare(`DELETE FROM self_roles WHERE guild_id = ? AND role_id = ?`),
    getSelfRoles: db.prepare(`SELECT * FROM self_roles WHERE guild_id = ?`),

    // Ticket system
    getTicketSettings: db.prepare(`SELECT * FROM ticket_settings WHERE guild_id = ?`),
    setTicketSettings: db.prepare(`
        INSERT OR REPLACE INTO ticket_settings 
        (guild_id, category_id, staff_role_ids, log_channel_id, next_ticket_number, updated_at) 
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `),
    getNextTicketNumber: db.prepare(`
        UPDATE ticket_settings 
        SET next_ticket_number = next_ticket_number + 1 
        WHERE guild_id = ? 
        RETURNING next_ticket_number - 1
    `),
    createTicket: db.prepare(`
        INSERT INTO tickets (guild_id, user_id, channel_id, ticket_number, reason) 
        VALUES (?, ?, ?, ?, ?)
    `),
    getTicketByChannel: db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`),
    getUserTicket: db.prepare(`
        SELECT * FROM tickets 
        WHERE guild_id = ? AND user_id = ? AND status = 'open'
    `),
    getOpenTickets: db.prepare(`SELECT * FROM tickets WHERE guild_id = ? AND status = 'open'`),
    claimTicket: db.prepare(`
        UPDATE tickets 
        SET claimed_by = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `),
    closeTicket: db.prepare(`
        UPDATE tickets 
        SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `),

    // Cleanup operations
    cleanupOldData: db.prepare(`
        DELETE FROM mod_logs 
        WHERE created_at < date('now', '-30 days')
    `)
};

// Backup system
const backup = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(dataDir, `backup-${timestamp}.db`);

    try {
        // Create a backup using SQLite VACUUM INTO command
        db.exec(`VACUUM INTO '${backupPath}'`);
        return backupPath;
    } catch (error) {
        Logger.error('Error creating backup:', error);
        throw error;
    }
};

// Export database instance and prepared statements
module.exports = {
    db,
    backup,

    // Command management functions - NEW
    disableCommand: (guildId, commandName, disabledBy, reason) => {
        return statements.disableCommand.run(guildId, commandName, disabledBy, reason);
    },
    enableCommand: (guildId, commandName) => {
        return statements.enableCommand.run(guildId, commandName);
    },
    getDisabledCommand: (guildId, commandName) => {
        return statements.getDisabledCommand.get(guildId, commandName);
    },
    getDisabledCommands: (guildId) => {
        return statements.getDisabledCommands.all(guildId);
    },

    // Guild settings functions
    getGuildSettings: (guildId) => {
        return statements.getGuildSettings.get(guildId);
    },
    setGuildSetting: (guildId, key, value) => {
        const settings = statements.getGuildSettings.get(guildId) || {};
        settings[key] = value;
        return statements.setGuildSettings.run(
            guildId, settings.prefix, settings.log_channel_id, settings.welcome_channel_id,
            settings.mute_role_id, settings.auto_role_id, settings.welcome_message,
            settings.leave_message, settings.embed_color, settings.automod_enabled,
            settings.ai_enabled, settings.ai_channel_id, settings.ai_trigger_symbol,
            settings.ai_personality, settings.ai_channels
        );
    },

    // Channel message functions for AI
    addChannelMessage: (channelId, userId, username, messageContent, isAiResponse, timestamp) => {
        statements.addChannelMessage.run(channelId, userId, username, messageContent, isAiResponse || 0, timestamp);
        statements.cleanOldChannelMessages.run(channelId, channelId);
    },
    getChannelHistory: (channelId, limit = 50) => {
        return statements.getChannelHistory.all(channelId, limit);
    },
    clearChannelHistory: (channelId) => {
        return statements.clearChannelHistory.run(channelId);
    },

    // Settings functions
    setSetting: (guildId, key, value) => statements.setSetting.run(guildId, key, value),
    getSetting: (guildId, key) => {
        const result = statements.getSetting.get(guildId, key);
        return result?.value;
    },
    deleteSetting: (guildId, key) => statements.deleteSetting.run(guildId, key),

    // User functions
    getUser: (guildId, userId) => {
        let user = statements.getUser.get(guildId, userId);
        if (!user) {
            statements.createUser.run(guildId, userId);
            user = statements.getUser.get(guildId, userId);
        }
        return user;
    },
    updateUser: (guildId, userId, exp, level, messages) => {
        return statements.updateUser.run(exp, level, messages, guildId, userId);
    },
    getTopUsers: (guildId, limit = 10) => {
        return statements.getTopUsers.all(guildId, limit);
    },
    resetAllUsers: (guildId) => statements.resetAllUsers.run(guildId),

    // Role functions
    addLevelRole: (guildId, level, roleId) => statements.addLevelRole.run(guildId, level, roleId),
    removeLevelRole: (guildId, level) => statements.removeLevelRole.run(guildId, level),
    getLevelRoles: (guildId) => statements.getLevelRoles.all(guildId),
    getRoleForLevel: (guildId, level) => statements.getRoleForLevel.get(guildId, level),

    // Warning functions
    addWarning: (guildId, userId, moderatorId, reason, expiresAt) => {
        return statements.addWarning.run(guildId, userId, moderatorId, reason, expiresAt);
    },
    getWarnings: (guildId, userId, limit = 10) => {
        return statements.getWarnings.all(guildId, userId, limit);
    },
    getAllWarnings: (guildId, limit = 50) => {
        return statements.getAllWarnings.all(guildId, limit);
    },
    clearWarnings: (guildId, userId) => statements.clearWarnings.run(guildId, userId),
    removeExpiredWarnings: () => statements.removeExpiredWarnings.run(),

    // Mute functions
    addMute: (guildId, userId, moderatorId, reason, expiresAt) => {
        return statements.addMute.run(guildId, userId, moderatorId, reason, expiresAt);
    },
    getMute: (guildId, userId) => statements.getMute.get(guildId, userId),
    removeMute: (guildId, userId) => statements.removeMute.run(guildId, userId),
    getExpiredMutes: () => statements.getExpiredMutes.all(),

    // Giveaway functions
    createGiveaway: (guildId, channelId, messageId, hostId, title, description, winnerCount, requirements, endsAt) => {
        return statements.createGiveaway.run(guildId, channelId, messageId, hostId, title, description, winnerCount, requirements, endsAt);
    },
    getGiveaway: (messageId) => statements.getGiveaway.get(messageId),
    endGiveaway: (giveawayId) => statements.endGiveaway.run(giveawayId),
    getActiveGiveaways: () => statements.getActiveGiveaways.all(),
    addGiveawayEntry: (giveawayId, userId) => statements.addGiveawayEntry.run(giveawayId, userId),
    removeGiveawayEntry: (giveawayId, userId) => statements.removeGiveawayEntry.run(giveawayId, userId),
    getGiveawayEntries: (giveawayId) => statements.getGiveawayEntries.all(giveawayId),

    // Moderation log functions
    addModLog: (guildId, actionType, targetUserId, moderatorId, reason, duration = null) => {
        return statements.addModLog.run(guildId, actionType, targetUserId, moderatorId, reason, duration);
    },
    getModLogs: (guildId, limit = 50) => statements.getModLogs.all(guildId, limit),
    getUserModLogs: (guildId, userId, limit = 25) => statements.getUserModLogs.all(guildId, userId, limit),

    // Self-role functions
    addSelfRole: (guildId, roleId, emoji, description) => {
        return statements.addSelfRole.run(guildId, roleId, emoji, description);
    },
    removeSelfRole: (guildId, roleId) => statements.removeSelfRole.run(guildId, roleId),
    getSelfRoles: (guildId) => statements.getSelfRoles.all(guildId),

    // Ticket functions
    getTicketSettings: (guildId) => statements.getTicketSettings.get(guildId),
    setTicketSettings: (guildId, categoryId, staffRoleIds, logChannelId, nextTicketNumber) => {
        return statements.setTicketSettings.run(guildId, categoryId, staffRoleIds, logChannelId, nextTicketNumber);
    },
    getNextTicketNumber: (guildId) => {
        const result = statements.getNextTicketNumber.get(guildId);
        return result?.next_ticket_number || 1;
    },
    createTicket: (guildId, userId, channelId, ticketNumber, reason) => {
        const result = statements.createTicket.run(guildId, userId, channelId, ticketNumber, reason);
        return result.lastInsertRowid;
    },
    getTicketByChannel: (channelId) => statements.getTicketByChannel.get(channelId),
    getUserTicket: (guildId, userId) => statements.getUserTicket.get(guildId, userId),
    getOpenTickets: (guildId) => statements.getOpenTickets.all(guildId),
    claimTicket: (ticketId, userId) => statements.claimTicket.run(userId, ticketId),
    closeTicket: (ticketId, userId) => statements.closeTicket.run(userId, ticketId),

    // Cleanup function
    cleanupOldData: () => {
        statements.cleanupOldData.run();
        statements.removeExpiredWarnings.run();
    }
};