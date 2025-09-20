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
        // Guild settings table - UPDATED WITH AI FIELDS
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
                embed_color TEXT DEFAULT '#7289DA',
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
                roleid TEXT NOT NULL,
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
                UNIQUE (giveaway_id, user_id)
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
                UNIQUE (guild_id, role_id)
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
                    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
                }
            } catch (error) {
                // Column might already exist or table doesn't exist
            }
        };

        addColumnIfNotExists('ticket_settings', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
        addColumnIfNotExists('ticket_settings', 'staff_role_ids', 'TEXT');
        // AI COLUMNS MIGRATION - Add these for existing databases
        addColumnIfNotExists('guild_settings', 'ai_enabled', 'INTEGER DEFAULT 0');
        addColumnIfNotExists('guild_settings', 'ai_channel_id', 'TEXT');
        addColumnIfNotExists('guild_settings', 'ai_trigger_symbol', "TEXT DEFAULT '!'");
        addColumnIfNotExists('guild_settings', 'ai_personality', "TEXT DEFAULT 'cheerful'");
        addColumnIfNotExists('guild_settings', 'ai_channels', 'TEXT DEFAULT "[]"');

        Logger.info('Database tables initialized successfully');
    } catch (error) {
        Logger.error('Error initializing database tables:', error);
        throw error;
    }
};

initTables();

// Debug output to confirm the ticket_settings columns
console.log('ticket_settings columns:', db.prepare("PRAGMA table_info(ticket_settings)").all());

// Prepared SQL statements for all features (leveling, tickets, giveaways, moderation, etc.)
const statements = {
    // Guild settings - UPDATED TO INCLUDE AI FIELDS
    getGuildSettings: db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?'),
    setGuildSettings: db.prepare(`INSERT OR REPLACE INTO guild_settings 
        (guild_id, prefix, log_channel_id, welcome_channel_id, mute_role_id, auto_role_id, welcome_message, leave_message, embed_color, automod_enabled, ai_enabled, ai_channel_id, ai_trigger_symbol, ai_personality, ai_channels, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `),

    // Command management - NEW
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
    getChannelMessageCount: db.prepare(`
        SELECT COUNT(*) as count FROM channel_messages 
        WHERE channel_id = ?
    `),
    clearChannelHistory: db.prepare(`DELETE FROM channel_messages WHERE channel_id = ?`),

    // Settings
    setSetting: db.prepare('INSERT OR REPLACE INTO settings (guild_id, key, value) VALUES (?, ?, ?)'),
    getSetting: db.prepare('SELECT value FROM settings WHERE guild_id = ? AND key = ?'),

    // Users (leveling)
    getUser: db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?'),
    insertUser: db.prepare('INSERT OR IGNORE INTO users (guild_id, user_id) VALUES (?, ?)'),
    updateUser: db.prepare('UPDATE users SET exp = ?, lvl = ?, messages = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?'),
    resetUser: db.prepare('UPDATE users SET exp = 0, lvl = 0, messages = 0, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?'),
    resetAllUsers: db.prepare('UPDATE users SET exp = 0, lvl = 0, messages = 0, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?'),
    getLeaderboardByLevel: db.prepare('SELECT user_id, exp, lvl, messages FROM users WHERE guild_id = ? ORDER BY lvl DESC, exp DESC LIMIT ?'),
    getLeaderboardByMessages: db.prepare('SELECT user_id, exp, lvl, messages FROM users WHERE guild_id = ? ORDER BY messages DESC LIMIT ?'),

    // Roles (level-role mapping)
    setRoleForLevel: db.prepare('INSERT OR REPLACE INTO roles (guild_id, lvl, roleid) VALUES (?, ?, ?)'),
    getRoleForLevel: db.prepare('SELECT roleid FROM roles WHERE guild_id = ? AND lvl = ?'),

    // Warnings
    addWarning: db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, expires_at) VALUES (?, ?, ?, ?, ?)'),
    getWarnings: db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC'),
    clearWarnings: db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?'),
    deleteWarning: db.prepare('DELETE FROM warnings WHERE id = ?'),

    // Mutes
    addMute: db.prepare('INSERT INTO mutes (guild_id, user_id, moderator_id, reason, expires_at) VALUES (?, ?, ?, ?, ?)'),
    getMute: db.prepare('SELECT * FROM mutes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'),
    removeMute: db.prepare('DELETE FROM mutes WHERE guild_id = ? AND user_id = ?'),
    getExpiredMutes: db.prepare('SELECT * FROM mutes WHERE expires_at <= CURRENT_TIMESTAMP'),

    // Giveaways
    createGiveaway: db.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, host_id, title, description, winner_count, requirements, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getGiveaway: db.prepare('SELECT * FROM giveaways WHERE message_id = ?'),
    getActiveGiveaways: db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= CURRENT_TIMESTAMP'),
    endGiveaway: db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?'),
    addGiveawayEntry: db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)'),
    getGiveawayEntries: db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?'),
    removeGiveawayEntry: db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?'),

    // Moderation logs
    addModLog: db.prepare('INSERT INTO mod_logs (guild_id, action_type, target_user_id, moderator_id, reason, duration) VALUES (?, ?, ?, ?, ?, ?)'),
    getModLogs: db.prepare('SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?'),

    // Self Roles
    addSelfRole: db.prepare('INSERT OR REPLACE INTO self_roles (guild_id, role_id, emoji, description) VALUES (?, ?, ?, ?)'),
    removeSelfRole: db.prepare('DELETE FROM self_roles WHERE guild_id = ? AND role_id = ?'),
    getSelfRoles: db.prepare('SELECT * FROM self_roles WHERE guild_id = ?'),

    // Ticket system
    setTicketSettings: db.prepare('INSERT OR REPLACE INTO ticket_settings (guild_id, category_id, staff_role_ids, log_channel_id, next_ticket_number, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'),
    getTicketSettings: db.prepare('SELECT * FROM ticket_settings WHERE guild_id = ?'),
    getTicketByChannel: db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'"),
    getUserTicket: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'"),
    getOpenTickets: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC"),
    createTicket: db.prepare('INSERT INTO tickets (guild_id, user_id, channel_id, reason, ticket_number, status) VALUES (?, ?, ?, ?, ?, ?)'),
    closeTicket: db.prepare("UPDATE tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
    claimTicket: db.prepare('UPDATE tickets SET claimed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),

    // Cleanup old data
    cleanupOldWarnings: db.prepare('DELETE FROM warnings WHERE expires_at <= CURRENT_TIMESTAMP'),
    cleanupOldLogs: db.prepare("DELETE FROM mod_logs WHERE created_at <= date('now', '-30 days')"),
    cleanupOldTickets: db.prepare("DELETE FROM tickets WHERE status = 'closed' AND closed_at <= date('now', '-90 days')")
};

// Helpers for database operations (ALL YOUR ORIGINAL FUNCTIONS PRESERVED + AI FUNCTIONS ADDED)
const DatabaseHelpers = {
    getGuildSettings: (guildId) => statements.getGuildSettings.get(guildId),

    // UPDATED TO HANDLE AI FIELDS
    setGuildSetting: (guildId, setting, value) => {
        const current = statements.getGuildSettings.get(guildId) || {};
        current[setting] = value;
        return statements.setGuildSettings.run(
            guildId,
            current.prefix || '!',
            current.log_channel_id,
            current.welcome_channel_id,
            current.mute_role_id,
            current.auto_role_id,
            current.welcome_message,
            current.leave_message,
            current.embed_color || '#7289DA',
            current.automod_enabled === undefined ? 1 : current.automod_enabled,
            current.ai_enabled === undefined ? 0 : current.ai_enabled,
            current.ai_channel_id || null,
            current.ai_trigger_symbol || '!',
            current.ai_personality || 'cheerful',
            current.ai_channels || '[]'
        );
    },

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

    // Channel message functions for AI memory
    addChannelMessage(channelId, userId, username, content, isAI = false) {
        const timestamp = Date.now();
        statements.addChannelMessage.run(channelId, userId, username, content, isAI ? 1 : 0, timestamp);
        // Clean old messages if we have more than 100
        const count = statements.getChannelMessageCount.get(channelId);
        if (count.count > 100) {
            statements.cleanOldChannelMessages.run(channelId, channelId);
        }
    },

    getChannelHistory(channelId, limit = 100) {
        return statements.getChannelHistory.all(channelId, limit);
    },

    clearChannelHistory(channelId) {
        statements.clearChannelHistory.run(channelId);
    },

    setSetting: (guildId, key, value) => statements.setSetting.run(guildId, key, value),
    getSetting: (guildId, key) => {
        const res = statements.getSetting.get(guildId, key);
        return res ? res.value : null;
    },

    getUser: (guildId, userId) => {
        statements.insertUser.run(guildId, userId);
        return statements.getUser.get(guildId, userId);
    },

    updateUser: (guildId, userId, exp, lvl, messages) => statements.updateUser.run(exp, lvl, messages, guildId, userId),
    resetUser: (guildId, userId) => statements.resetUser.run(guildId, userId),
    resetAllUsers: (guildId) => statements.resetAllUsers.run(guildId),
    getLeaderboardByLevel: (guildId, limit = 10) => statements.getLeaderboardByLevel.all(guildId, limit),
    getLeaderboardByMessages: (guildId, limit = 10) => statements.getLeaderboardByMessages.all(guildId, limit),

    setRoleForLevel: (guildId, lvl, roleid) => statements.setRoleForLevel.run(guildId, lvl, roleid),
    getRoleForLevel: (guildId, lvl) => {
        const r = statements.getRoleForLevel.get(guildId, lvl);
        return r ? r.roleid : null;
    },

    addWarning: (guildId, userId, moderatorId, reason, expiresAt = null) => statements.addWarning.run(guildId, userId, moderatorId, reason, expiresAt),
    getWarnings: (guildId, userId) => statements.getWarnings.all(guildId, userId),
    clearWarnings: (guildId, userId) => statements.clearWarnings.run(guildId, userId),

    addMute: (guildId, userId, moderatorId, reason, expiresAt) => statements.addMute.run(guildId, userId, moderatorId, reason, expiresAt),
    getMute: (guildId, userId) => statements.getMute.get(guildId, userId),
    removeMute: (guildId, userId) => statements.removeMute.run(guildId, userId),
    getExpiredMutes: () => statements.getExpiredMutes.all(),

    createGiveaway: (guildId, channelId, messageId, hostId, title, description, winnerCount, requirements, endsAt) => statements.createGiveaway.run(guildId, channelId, messageId, hostId, title, description, winnerCount, requirements, endsAt),
    getGiveaway: (messageId) => statements.getGiveaway.get(messageId),
    getActiveGiveaways: () => statements.getActiveGiveaways.all(),
    endGiveaway: (giveawayId) => statements.endGiveaway.run(giveawayId),
    addGiveawayEntry: (giveawayId, userId) => statements.addGiveawayEntry.run(giveawayId, userId),
    getGiveawayEntries: (giveawayId) => statements.getGiveawayEntries.all(giveawayId),
    removeGiveawayEntry: (giveawayId, userId) => statements.removeGiveawayEntry.run(giveawayId, userId),

    addModLog: (guildId, actionType, targetUserId, moderatorId, reason, duration = null) => statements.addModLog.run(guildId, actionType, targetUserId, moderatorId, reason, duration),
    getModLogs: (guildId, limit = 50) => statements.getModLogs.all(guildId, limit),

    addSelfRole: (guildId, roleId, emoji, description) => statements.addSelfRole.run(guildId, roleId, emoji, description),
    removeSelfRole: (guildId, roleId) => statements.removeSelfRole.run(guildId, roleId),
    getSelfRoles: (guildId) => statements.getSelfRoles.all(guildId),

    setTicketSettings(guildId, settings) {
        try {
            const staffRoleIds = Array.isArray(settings.staffRoleIds) ? JSON.stringify(settings.staffRoleIds) : JSON.stringify([settings.staffRoleIds]);
            statements.setTicketSettings.run(
                guildId,
                settings.categoryId,
                staffRoleIds,
                settings.logChannelId,
                settings.nextTicketNumber || 1
            );
        } catch (error) {
            Logger.error('Error setting ticket settings:', error);
        }
    },

    getTicketSettings(guildId) {
        try {
            return statements.getTicketSettings.get(guildId);
        } catch (error) {
            Logger.error('Error getting ticket settings:', error);
            return null;
        }
    },

    getNextTicketNumber(guildId) {
        try {
            // Ensure ticket settings exist with proper initialization
            let settings = this.getTicketSettings(guildId);
            if (!settings) {
                // Initialize with proper settings structure
                this.setTicketSettings(guildId, {
                    categoryId: null,
                    logChannelId: null,
                    staffRoleIds: [],
                    nextTicketNumber: 1
                });
                settings = { next_ticket_number: 1 };
            }

            // ATOMIC operation using transaction for SQLite compatibility
            const transaction = db.transaction(() => {
                // First ensure the row exists with UPSERT
                const upsertStmt = db.prepare(`
                    INSERT INTO ticket_settings (guild_id, next_ticket_number) 
                    VALUES (?, 1)
                    ON CONFLICT(guild_id) DO NOTHING
                `);
                upsertStmt.run(guildId);

                // Then atomically increment and get the old value
                const updateStmt = db.prepare(`
                    UPDATE ticket_settings 
                    SET next_ticket_number = COALESCE(next_ticket_number, 1) + 1,
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE guild_id = ?
                `);
                updateStmt.run(guildId);

                // Get the current value (which was just incremented)
                const selectStmt = db.prepare(`
                    SELECT next_ticket_number FROM ticket_settings 
                    WHERE guild_id = ?
                `);
                const result = selectStmt.get(guildId);

                // Return the previous value (current - 1)
                return result ? result.next_ticket_number - 1 : 1;
            });

            return transaction();
        } catch (error) {
            Logger.error('Error getting next ticket number:', error);
            return 1;
        }
    },

    createTicket(guildId, userId, channelId, reason, ticketNumber) {
        try {
            console.log('Creating ticket with params:', { guildId, userId, channelId, reason, ticketNumber });
            const result = statements.createTicket.run(guildId, userId, channelId, reason, ticketNumber, 'open');
            console.log('Ticket created with ID:', result.lastInsertRowid);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error creating ticket:', error);
            Logger.error('Error creating ticket:', error);
            return null;
        }
    },

    getTicketByChannel(channelId) {
        try {
            console.log('Looking for ticket in channel:', channelId);
            const result = statements.getTicketByChannel.get(channelId);
            console.log('Found ticket:', result);
            return result;
        } catch (error) {
            console.error('Error getting ticket by channel:', error);
            Logger.error('Error getting ticket by channel:', error);
            return null;
        }
    },

    getUserTicket(guildId, userId) {
        try {
            return statements.getUserTicket.get(guildId, userId);
        } catch (error) {
            Logger.error('Error getting user ticket:', error);
            return null;
        }
    },

    getOpenTickets(guildId) {
        try {
            return statements.getOpenTickets.all(guildId);
        } catch (error) {
            Logger.error('Error getting open tickets:', error);
            return [];
        }
    },

    closeTicket(ticketId, closedBy) {
        try {
            console.log('Closing ticket:', ticketId, 'by user:', closedBy);
            const result = statements.closeTicket.run(closedBy, ticketId);
            console.log('Ticket close result:', result);
        } catch (error) {
            console.error('Error closing ticket:', error);
            Logger.error('Error closing ticket:', error);
        }
    },

    claimTicket(ticketId, claimedBy) {
        try {
            statements.claimTicket.run(claimedBy, ticketId);
        } catch (error) {
            Logger.error('Error claiming ticket:', error);
        }
    },

    getStaffRoleIds(guildId) {
        try {
            const settings = this.getTicketSettings(guildId);
            if (!settings || !settings.staff_role_ids) return [];
            try {
                return JSON.parse(settings.staff_role_ids);
            } catch {
                return [settings.staff_role_ids];
            }
        } catch (error) {
            Logger.error('Error getting staff role IDs:', error);
            return [];
        }
    },

    cleanupOldData() {
        statements.cleanupOldWarnings.run();
        statements.cleanupOldLogs.run();
        statements.cleanupOldTickets.run();
        Logger.info('Cleaned up old warnings, logs, and tickets');
    },

    // AI HELPER FUNCTIONS
    setAISetting(guildId, setting, value) {
        const current = statements.getGuildSettings.get(guildId) || {};
        current[setting] = value;
        return statements.setGuildSettings.run(
            guildId,
            current.prefix || '!',
            current.log_channel_id,
            current.welcome_channel_id,
            current.mute_role_id,
            current.auto_role_id,
            current.welcome_message,
            current.leave_message,
            current.embed_color || '#7289DA',
            current.automod_enabled === undefined ? 1 : current.automod_enabled,
            setting === 'ai_enabled' ? (value ? 1 : 0) : (current.ai_enabled === undefined ? 0 : current.ai_enabled),
            setting === 'ai_channel_id' ? value : (current.ai_channel_id || null),
            setting === 'ai_trigger_symbol' ? value : (current.ai_trigger_symbol || '!'),
            setting === 'ai_personality' ? value : (current.ai_personality || 'cheerful'),
            setting === 'ai_channels' ? (Array.isArray(value) ? JSON.stringify(value) : value) : (current.ai_channels || '[]')
        );
    },

    getAISetting(guildId) {
        try {
            const row = statements.getGuildSettings.get(guildId);
            return {
                ai_enabled: row?.ai_enabled === undefined ? 0 : row.ai_enabled,
                ai_channel_id: row?.ai_channel_id || null,
                ai_trigger_symbol: row?.ai_trigger_symbol || '!',
                ai_personality: row?.ai_personality || 'cheerful',
                ai_channels: row?.ai_channels || '[]'
            };
        } catch (error) {
            Logger.error('Error getting AI settings:', error);
            return {
                ai_enabled: 0,
                ai_channel_id: null,
                ai_trigger_symbol: '!',
                ai_personality: 'cheerful',
                ai_channels: '[]'
            };
        }
    },

    // AI Channels management
    setAIChannels(guildId, channelIds) {
        const channelsArray = Array.isArray(channelIds) ? channelIds : [channelIds];
        return this.setAISetting(guildId, 'ai_channels', channelsArray);
    },

    getAIChannels(guildId) {
        try {
            const settings = statements.getGuildSettings.get(guildId);
            if (!settings) return [];

            // Try new ai_channels field first, fallback to old ai_channel_id
            if (settings.ai_channels) {
                return JSON.parse(settings.ai_channels);
            } else if (settings.ai_channel_id) {
                return [settings.ai_channel_id];
            }
            return [];
        } catch {
            return [];
        }
    }
};

module.exports = {
    db,
    ...DatabaseHelpers
};