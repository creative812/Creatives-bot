const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class BotDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.sqlite');
        this.db = new Database(this.dbPath);
        this.init();
        this.prepareStatements();
        console.log('✅ Database initialized successfully');
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY,
                prefix TEXT DEFAULT '!',
                log_channel_id TEXT,
                welcome_channel_id TEXT,
                embed_color TEXT DEFAULT '#7289DA',
                auto_role_id TEXT,
                welcome_message TEXT,
                leave_message TEXT,
                automod_enabled INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                expires_at TEXT
            );

            CREATE TABLE IF NOT EXISTS mod_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                target_user_id TEXT NOT NULL,
                reason TEXT,
                duration TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS self_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                description TEXT
            );

            CREATE TABLE IF NOT EXISTS giveaways (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                prize TEXT NOT NULL,
                winner_count INTEGER DEFAULT 1,
                ends_at TEXT NOT NULL,
                ended INTEGER DEFAULT 0,
                created_by TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS giveaway_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                giveaway_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (giveaway_id) REFERENCES giveaways (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                reason TEXT,
                ticket_number INTEGER NOT NULL,
                claimed_by TEXT,
                closed_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                closed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS ticket_settings (
                guild_id TEXT PRIMARY KEY,
                category_id TEXT,
                staff_role_ids TEXT,
                log_channel_id TEXT
            );

            CREATE TABLE IF NOT EXISTS ai_settings (
                guild_id TEXT PRIMARY KEY,
                ai_enabled INTEGER DEFAULT 0,
                ai_channel_id TEXT,
                ai_trigger_symbol TEXT DEFAULT '!',
                ai_personality TEXT DEFAULT 'cheerful'
            );

            CREATE TABLE IF NOT EXISTS ai_channels (
                guild_id TEXT,
                channel_id TEXT,
                PRIMARY KEY (guild_id, channel_id)
            );

            CREATE TABLE IF NOT EXISTS channel_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                message_content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS user_levels (
                guild_id TEXT,
                user_id TEXT,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                last_message TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS level_roles (
                guild_id TEXT,
                level INTEGER,
                role_id TEXT,
                PRIMARY KEY (guild_id, level)
            );
        `);
    }

    prepareStatements() {
        this.statements = {
            // Guild Settings
            getGuildSettings: this.db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?'),
            updateGuildSetting: this.db.prepare(`
                INSERT INTO guild_settings (guild_id, prefix, log_channel_id, welcome_channel_id, embed_color, auto_role_id, welcome_message, leave_message, automod_enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET
                    prefix = excluded.prefix,
                    log_channel_id = excluded.log_channel_id,
                    welcome_channel_id = excluded.welcome_channel_id,
                    embed_color = excluded.embed_color,
                    auto_role_id = excluded.auto_role_id,
                    welcome_message = excluded.welcome_message,
                    leave_message = excluded.leave_message,
                    automod_enabled = excluded.automod_enabled
            `),

            // Warnings - FIXED: Single quotes around 'now'
            addWarning: this.db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, expires_at) VALUES (?, ?, ?, ?, ?)'),
            getWarnings: this.db.prepare("SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"),
            getAllWarnings: this.db.prepare("SELECT * FROM warnings WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"),
            removeWarning: this.db.prepare('DELETE FROM warnings WHERE id = ?'),
            clearWarnings: this.db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?'),

            // Mod Logs
            addModLog: this.db.prepare('INSERT INTO mod_logs (guild_id, action_type, moderator_id, target_user_id, reason, duration) VALUES (?, ?, ?, ?, ?, ?)'),
            getModLogs: this.db.prepare('SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?'),

            // Self Roles
            addSelfRole: this.db.prepare('INSERT INTO self_roles (guild_id, role_id, description) VALUES (?, ?, ?)'),
            getSelfRoles: this.db.prepare('SELECT * FROM self_roles WHERE guild_id = ?'),
            removeSelfRole: this.db.prepare('DELETE FROM self_roles WHERE guild_id = ? AND role_id = ?'),

            // Giveaways - FIXED: Single quotes around 'now'
            createGiveaway: this.db.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'),
            getGiveaway: this.db.prepare('SELECT * FROM giveaways WHERE message_id = ?'),
            getActiveGiveaways: this.db.prepare("SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= datetime('now')"),
            endGiveaway: this.db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?'),
            addGiveawayEntry: this.db.prepare('INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)'),
            removeGiveawayEntry: this.db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?'),
            getGiveawayEntries: this.db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id = ?'),

            // Tickets - FIXED: Single quotes around 'now'
            createTicket: this.db.prepare('INSERT INTO tickets (guild_id, user_id, channel_id, reason, ticket_number) VALUES (?, ?, ?, ?, ?)'),
            getTicketByChannel: this.db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),
            getUserTicket: this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND closed_at IS NULL'),
            getOpenTickets: this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND closed_at IS NULL'),
            claimTicket: this.db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?'),
            closeTicket: this.db.prepare("UPDATE tickets SET closed_by = ?, closed_at = datetime('now') WHERE id = ?"),
            getNextTicketNumber: this.db.prepare('SELECT COALESCE(MAX(ticket_number), 0) + 1 as next_number FROM tickets WHERE guild_id = ?'),

            // Ticket Settings
            getTicketSettings: this.db.prepare('SELECT * FROM ticket_settings WHERE guild_id = ?'),
            setTicketSettings: this.db.prepare(`
                INSERT INTO ticket_settings (guild_id, category_id, staff_role_ids, log_channel_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET
                    category_id = excluded.category_id,
                    staff_role_ids = excluded.staff_role_ids,
                    log_channel_id = excluded.log_channel_id
            `),

            // AI Settings
            getAISetting: this.db.prepare('SELECT * FROM ai_settings WHERE guild_id = ?'),
            setAISetting: this.db.prepare(`
                INSERT INTO ai_settings (guild_id, ai_enabled, ai_channel_id, ai_trigger_symbol, ai_personality)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET
                    ai_enabled = excluded.ai_enabled,
                    ai_channel_id = excluded.ai_channel_id,
                    ai_trigger_symbol = excluded.ai_trigger_symbol,
                    ai_personality = excluded.ai_personality
            `),

            // AI Channels
            getAIChannels: this.db.prepare('SELECT channel_id FROM ai_channels WHERE guild_id = ?'),
            addAIChannel: this.db.prepare('INSERT OR IGNORE INTO ai_channels (guild_id, channel_id) VALUES (?, ?)'),
            removeAIChannel: this.db.prepare('DELETE FROM ai_channels WHERE guild_id = ? AND channel_id = ?'),
            clearAIChannels: this.db.prepare('DELETE FROM ai_channels WHERE guild_id = ?'),

            // Channel History
            addChannelMessage: this.db.prepare('INSERT INTO channel_history (guild_id, channel_id, user_id, username, message_content) VALUES (?, ?, ?, ?, ?)'),
            getChannelHistory: this.db.prepare('SELECT * FROM channel_history WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?'),
            clearChannelHistory: this.db.prepare('DELETE FROM channel_history WHERE channel_id = ?'),

            // User Levels
            getUserLevel: this.db.prepare('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?'),
            updateUserLevel: this.db.prepare(`
                INSERT INTO user_levels (guild_id, user_id, xp, level, last_message)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(guild_id, user_id) DO UPDATE SET
                    xp = excluded.xp,
                    level = excluded.level,
                    last_message = excluded.last_message
            `),
            getTopUsers: this.db.prepare('SELECT * FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?'),

            // Level Roles
            addLevelRole: this.db.prepare(`
                INSERT INTO level_roles (guild_id, level, role_id)
                VALUES (?, ?, ?)
                ON CONFLICT(guild_id, level) DO UPDATE SET role_id = excluded.role_id
            `),
            getLevelRoles: this.db.prepare('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC'),
            removeLevelRole: this.db.prepare('DELETE FROM level_roles WHERE guild_id = ? AND level = ?')
        };
    }

    // ✅ GUILD SETTINGS METHODS
    getGuildSettings(guildId) {
        try {
            const settings = this.statements.getGuildSettings.get(guildId);
            return settings || {};
        } catch (error) {
            console.error('Error getting guild settings:', error);
            return {};
        }
    }

    setGuildSetting(guildId, key, value) {
        try {
            console.log(`🔍 [DB] Setting ${key} = ${value} for guild ${guildId}`);

            // Get current settings
            const currentSettings = this.getGuildSettings(guildId);

            // Update the specific key
            const newSettings = {
                prefix: currentSettings.prefix || '!',
                log_channel_id: currentSettings.log_channel_id,
                welcome_channel_id: currentSettings.welcome_channel_id,
                embed_color: currentSettings.embed_color || '#7289DA',
                auto_role_id: currentSettings.auto_role_id,
                welcome_message: currentSettings.welcome_message,
                leave_message: currentSettings.leave_message,
                automod_enabled: currentSettings.automod_enabled || 0
            };

            // Update the specific key
            newSettings[key] = value;

            // Execute the update
            const result = this.statements.updateGuildSetting.run(
                guildId,
                newSettings.prefix,
                newSettings.log_channel_id,
                newSettings.welcome_channel_id,
                newSettings.embed_color,
                newSettings.auto_role_id,
                newSettings.welcome_message,
                newSettings.leave_message,
                newSettings.automod_enabled
            );

            // Verify the update worked
            const verifySettings = this.getGuildSettings(guildId);
            console.log(`✅ [DB] Verified ${key} = ${verifySettings[key]} for guild ${guildId}`);

            return result;
        } catch (error) {
            console.error(`Error setting guild setting ${key}:`, error);
            throw error;
        }
    }

    // ✅ WARNING METHODS
    addWarning(guildId, userId, moderatorId, reason, expiresAt = null) {
        try {
            const result = this.statements.addWarning.run(guildId, userId, moderatorId, reason, expiresAt);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error adding warning:', error);
            throw error;
        }
    }

    getWarnings(guildId, userId) {
        try {
            if (userId === '0') {
                return this.statements.getAllWarnings.all(guildId);
            }
            return this.statements.getWarnings.all(guildId, userId);
        } catch (error) {
            console.error('Error getting warnings:', error);
            return [];
        }
    }

    removeWarning(warningId) {
        try {
            return this.statements.removeWarning.run(warningId);
        } catch (error) {
            console.error('Error removing warning:', error);
            throw error;
        }
    }

    clearWarnings(guildId, userId) {
        try {
            return this.statements.clearWarnings.run(guildId, userId);
        } catch (error) {
            console.error('Error clearing warnings:', error);
            throw error;
        }
    }

    // ✅ MOD LOG METHODS
    addModLog(guildId, actionType, moderatorId, targetUserId, reason, duration = null) {
        try {
            return this.statements.addModLog.run(guildId, actionType, moderatorId, targetUserId, reason, duration);
        } catch (error) {
            console.error('Error adding mod log:', error);
            throw error;
        }
    }

    getModLogs(guildId, limit = 50) {
        try {
            return this.statements.getModLogs.all(guildId, limit);
        } catch (error) {
            console.error('Error getting mod logs:', error);
            return [];
        }
    }

    // ✅ SELF ROLE METHODS
    addSelfRole(guildId, roleId, description) {
        try {
            return this.statements.addSelfRole.run(guildId, roleId, description);
        } catch (error) {
            console.error('Error adding self role:', error);
            throw error;
        }
    }

    getSelfRoles(guildId) {
        try {
            return this.statements.getSelfRoles.all(guildId);
        } catch (error) {
            console.error('Error getting self roles:', error);
            return [];
        }
    }

    removeSelfRole(guildId, roleId) {
        try {
            return this.statements.removeSelfRole.run(guildId, roleId);
        } catch (error) {
            console.error('Error removing self role:', error);
            throw error;
        }
    }

    // ✅ GIVEAWAY METHODS
    createGiveaway(guildId, channelId, messageId, prize, winnerCount, endsAt, createdBy) {
        try {
            const result = this.statements.createGiveaway.run(guildId, channelId, messageId, prize, winnerCount, endsAt, createdBy);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error creating giveaway:', error);
            throw error;
        }
    }

    getGiveaway(messageId) {
        try {
            return this.statements.getGiveaway.get(messageId);
        } catch (error) {
            console.error('Error getting giveaway:', error);
            return null;
        }
    }

    getActiveGiveaways() {
        try {
            return this.statements.getActiveGiveaways.all();
        } catch (error) {
            console.error('Error getting active giveaways:', error);
            return [];
        }
    }

    endGiveaway(giveawayId) {
        try {
            return this.statements.endGiveaway.run(giveawayId);
        } catch (error) {
            console.error('Error ending giveaway:', error);
            throw error;
        }
    }

    addGiveawayEntry(giveawayId, userId) {
        try {
            return this.statements.addGiveawayEntry.run(giveawayId, userId);
        } catch (error) {
            console.error('Error adding giveaway entry:', error);
            throw error;
        }
    }

    removeGiveawayEntry(giveawayId, userId) {
        try {
            return this.statements.removeGiveawayEntry.run(giveawayId, userId);
        } catch (error) {
            console.error('Error removing giveaway entry:', error);
            throw error;
        }
    }

    getGiveawayEntries(giveawayId) {
        try {
            return this.statements.getGiveawayEntries.all(giveawayId);
        } catch (error) {
            console.error('Error getting giveaway entries:', error);
            return [];
        }
    }

    // ✅ TICKET METHODS
    createTicket(guildId, userId, channelId, reason, ticketNumber) {
        try {
            const result = this.statements.createTicket.run(guildId, userId, channelId, reason, ticketNumber);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error creating ticket:', error);
            throw error;
        }
    }

    getTicketByChannel(channelId) {
        try {
            return this.statements.getTicketByChannel.get(channelId);
        } catch (error) {
            console.error('Error getting ticket by channel:', error);
            return null;
        }
    }

    getUserTicket(guildId, userId) {
        try {
            return this.statements.getUserTicket.get(guildId, userId);
        } catch (error) {
            console.error('Error getting user ticket:', error);
            return null;
        }
    }

    getOpenTickets(guildId) {
        try {
            return this.statements.getOpenTickets.all(guildId);
        } catch (error) {
            console.error('Error getting open tickets:', error);
            return [];
        }
    }

    claimTicket(ticketId, userId) {
        try {
            return this.statements.claimTicket.run(userId, ticketId);
        } catch (error) {
            console.error('Error claiming ticket:', error);
            throw error;
        }
    }

    closeTicket(ticketId, userId) {
        try {
            return this.statements.closeTicket.run(userId, ticketId);
        } catch (error) {
            console.error('Error closing ticket:', error);
            throw error;
        }
    }

    getNextTicketNumber(guildId) {
        try {
            const result = this.statements.getNextTicketNumber.get(guildId);
            return result.next_number;
        } catch (error) {
            console.error('Error getting next ticket number:', error);
            return 1;
        }
    }

    // ✅ TICKET SETTINGS METHODS
    getTicketSettings(guildId) {
        try {
            const settings = this.statements.getTicketSettings.get(guildId);
            if (settings && settings.staff_role_ids) {
                try {
                    settings.staff_role_ids = JSON.parse(settings.staff_role_ids);
                } catch (e) {
                    settings.staff_role_ids = [settings.staff_role_ids];
                }
            }
            return settings;
        } catch (error) {
            console.error('Error getting ticket settings:', error);
            return null;
        }
    }

    setTicketSettings(guildId, categoryId, staffRoleIds, logChannelId) {
        try {
            const staffRoleIdsString = Array.isArray(staffRoleIds) ? JSON.stringify(staffRoleIds) : staffRoleIds;
            return this.statements.setTicketSettings.run(guildId, categoryId, staffRoleIdsString, logChannelId);
        } catch (error) {
            console.error('Error setting ticket settings:', error);
            throw error;
        }
    }

    // ✅ AI SETTINGS METHODS
    getAISetting(guildId) {
        try {
            return this.statements.getAISetting.get(guildId);
        } catch (error) {
            console.error('Error getting AI setting:', error);
            return null;
        }
    }

    setAISetting(guildId, key, value) {
        try {
            const currentSettings = this.getAISetting(guildId) || {};

            const newSettings = {
                ai_enabled: currentSettings.ai_enabled || 0,
                ai_channel_id: currentSettings.ai_channel_id,
                ai_trigger_symbol: currentSettings.ai_trigger_symbol || '!',
                ai_personality: currentSettings.ai_personality || 'cheerful'
            };

            newSettings[key] = value;

            return this.statements.setAISetting.run(
                guildId,
                newSettings.ai_enabled,
                newSettings.ai_channel_id,
                newSettings.ai_trigger_symbol,
                newSettings.ai_personality
            );
        } catch (error) {
            console.error(`Error setting AI setting ${key}:`, error);
            throw error;
        }
    }

    // ✅ AI CHANNELS METHODS
    getAIChannels(guildId) {
        try {
            const rows = this.statements.getAIChannels.all(guildId);
            return rows.map(row => row.channel_id);
        } catch (error) {
            console.error('Error getting AI channels:', error);
            return [];
        }
    }

    setAIChannels(guildId, channelIds) {
        try {
            // Clear existing channels
            this.statements.clearAIChannels.run(guildId);

            // Add new channels
            for (const channelId of channelIds) {
                this.statements.addAIChannel.run(guildId, channelId);
            }
        } catch (error) {
            console.error('Error setting AI channels:', error);
            throw error;
        }
    }

    // ✅ CHANNEL HISTORY METHODS
    addChannelMessage(guildId, channelId, userId, username, messageContent) {
        try {
            this.statements.addChannelMessage.run(guildId, channelId, userId, username, messageContent);

            // Keep only the latest 200 messages per channel - FIXED: Single quotes
            this.db.exec(`
                DELETE FROM channel_history 
                WHERE channel_id = '${channelId}' 
                AND id NOT IN (
                    SELECT id FROM channel_history 
                    WHERE channel_id = '${channelId}' 
                    ORDER BY created_at DESC 
                    LIMIT 200
                )
            `);
        } catch (error) {
            console.error('Error adding channel message:', error);
            throw error;
        }
    }

    getChannelHistory(channelId, limit = 100) {
        try {
            return this.statements.getChannelHistory.all(channelId, limit);
        } catch (error) {
            console.error('Error getting channel history:', error);
            return [];
        }
    }

    clearChannelHistory(channelId) {
        try {
            return this.statements.clearChannelHistory.run(channelId);
        } catch (error) {
            console.error('Error clearing channel history:', error);
            throw error;
        }
    }

    // ✅ USER LEVEL METHODS
    getUserLevel(guildId, userId) {
        try {
            return this.statements.getUserLevel.get(guildId, userId);
        } catch (error) {
            console.error('Error getting user level:', error);
            return null;
        }
    }

    updateUserLevel(guildId, userId, xp, level) {
        try {
            return this.statements.updateUserLevel.run(guildId, userId, xp, level);
        } catch (error) {
            console.error('Error updating user level:', error);
            throw error;
        }
    }

    getTopUsers(guildId, limit = 10) {
        try {
            return this.statements.getTopUsers.all(guildId, limit);
        } catch (error) {
            console.error('Error getting top users:', error);
            return [];
        }
    }

    // ✅ LEVEL ROLE METHODS
    addLevelRole(guildId, level, roleId) {
        try {
            return this.statements.addLevelRole.run(guildId, level, roleId);
        } catch (error) {
            console.error('Error adding level role:', error);
            throw error;
        }
    }

    getLevelRoles(guildId) {
        try {
            return this.statements.getLevelRoles.all(guildId);
        } catch (error) {
            console.error('Error getting level roles:', error);
            return [];
        }
    }

    removeLevelRole(guildId, level) {
        try {
            return this.statements.removeLevelRole.run(guildId, level);
        } catch (error) {
            console.error('Error removing level role:', error);
            throw error;
        }
    }

    // ✅ UTILITY METHODS
    backup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(__dirname, `backup_${timestamp}.db`);
            this.db.backup(backupPath);
            return backupPath;
        } catch (error) {
            console.error('Error creating backup:', error);
            throw error;
        }
    }

    cleanupOldData() {
        try {
            // Clean up old mod logs (older than 90 days) - FIXED: Single quotes
            this.db.exec("DELETE FROM mod_logs WHERE created_at <= datetime('now', '-90 days')");

            // Clean up old channel history (older than 30 days) - FIXED: Single quotes
            this.db.exec("DELETE FROM channel_history WHERE created_at <= datetime('now', '-30 days')");

            // Clean up old giveaway entries for ended giveaways - FIXED: Single quotes
            this.db.exec(`
                DELETE FROM giveaway_entries 
                WHERE giveaway_id IN (
                    SELECT id FROM giveaways WHERE ended = 1 AND created_at <= datetime('now', '-30 days')
                )
            `);

            console.log('✅ Database cleanup completed');
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }

    close() {
        this.db.close();
    }
}

// Export a single instance
module.exports = new BotDatabase();
