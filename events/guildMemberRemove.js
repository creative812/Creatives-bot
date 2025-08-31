const EmbedManager = require('../utils/embeds.js');
const PermissionManager = require('../utils/permissions.js');

module.exports = {
    name: 'guildMemberRemove',
    execute(member, client) {
        // Get guild settings
        const settings = client.db.getGuildSettings(member.guild.id);

        // Send leave message
        if (settings?.welcome_channel_id) {
            sendLeaveMessage(member, client, settings);
        }

        // Log member leave with additional context
        logMemberLeave(member, client, settings);

        // Clean up user data (optional - some servers prefer to keep this)
        // cleanupUserData(member, client);
    }
};

/**
 * Send leave message
 * @param {GuildMember} member - Member who left
 * @param {Client} client - Discord client
 * @param {Object} settings - Guild settings
 */
async function sendLeaveMessage(member, client, settings) {
    try {
        const leaveChannel = member.guild.channels.cache.get(settings.welcome_channel_id);
        
        if (!leaveChannel) {
            client.logger.warn(`Leave channel not found: ${settings.welcome_channel_id} in ${member.guild.name}`);
            return;
        }

        // Check if bot has permissions to send messages
        if (!PermissionManager.botHasPermissions(leaveChannel, ['SendMessages', 'EmbedLinks'])) {
            client.logger.warn(`Missing permissions in leave channel: ${leaveChannel.name} in ${member.guild.name}`);
            return;
        }

        // Create leave embed
        const embed = EmbedManager.createLeaveEmbed(member.user, member.guild, settings.leave_message);

        await leaveChannel.send({ embeds: [embed] });

        client.logger.info(`Leave message sent for ${member.user.tag} in ${member.guild.name}`);

    } catch (error) {
        client.logger.error(`Error sending leave message for ${member.user.tag}:`, error);
    }
}

/**
 * Log member leave with additional context
 * @param {GuildMember} member - Member who left
 * @param {Client} client - Discord client
 * @param {Object} settings - Guild settings
 */
async function logMemberLeave(member, client, settings) {
    try {
        // Basic leave log
        client.logger.info(`User left: ${member.user.tag} (${member.user.id}) from ${member.guild.name} (${member.guild.id})`);

        // Enhanced logging to log channel if available
        if (settings?.log_channel_id) {
            const logChannel = member.guild.channels.cache.get(settings.log_channel_id);
            
            if (logChannel && PermissionManager.botHasPermissions(logChannel, ['SendMessages', 'EmbedLinks'])) {
                
                // Check audit logs to see if user was kicked/banned
                let reason = 'Left voluntarily';
                let moderator = null;
                
                try {
                    // Fetch recent audit log entries
                    const auditLogs = await member.guild.fetchAuditLogs({ limit: 5 });
                    
                    // Look for recent kick or ban
                    const kickEntry = auditLogs.entries.find(entry => 
                        entry.action === 20 && // Kick
                        entry.target?.id === member.user.id &&
                        Date.now() - entry.createdTimestamp < 5000 // Within last 5 seconds
                    );
                    
                    const banEntry = auditLogs.entries.find(entry => 
                        entry.action === 22 && // Ban
                        entry.target?.id === member.user.id &&
                        Date.now() - entry.createdTimestamp < 5000 // Within last 5 seconds
                    );

                    if (kickEntry) {
                        reason = `Kicked: ${kickEntry.reason || 'No reason provided'}`;
                        moderator = kickEntry.executor;
                    } else if (banEntry) {
                        reason = `Banned: ${banEntry.reason || 'No reason provided'}`;
                        moderator = banEntry.executor;
                    }
                } catch (auditError) {
                    // Ignore audit log errors (missing permissions, etc.)
                    client.logger.debug('Could not fetch audit logs for member leave:', auditError);
                }

                // Calculate member statistics
                const joinedAt = member.joinedAt;
                const timeInServer = joinedAt ? Date.now() - joinedAt.getTime() : 0;
                const timeInServerString = timeInServer > 0 ? 
                    `${Math.floor(timeInServer / (24 * 60 * 60 * 1000))} days` : 
                    'Unknown';

                // Get user's highest role
                const highestRole = member.roles.highest.id !== member.guild.id ? 
                    member.roles.highest.name : 'None';

                // Create detailed leave log embed
                const embed = EmbedManager.createEmbed('📤 Member Left', null, '#FF6B6B')
                    .addFields([
                        { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
                        { name: 'Reason', value: reason, inline: true },
                        { name: 'Time in Server', value: timeInServerString, inline: true },
                        { name: 'Joined', value: joinedAt ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:F>` : 'Unknown', inline: true },
                        { name: 'Left', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: 'Highest Role', value: highestRole, inline: true },
                        { name: 'Member Count', value: member.guild.memberCount.toString(), inline: true }
                    ])
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                if (moderator) {
                    embed.addFields([{ name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true }]);
                }

                // Add warning count if user had any
                try {
                    const warnings = client.db.getWarnings(member.guild.id, member.user.id);
                    if (warnings.length > 0) {
                        embed.addFields([{ name: 'Warnings', value: warnings.length.toString(), inline: true }]);
                    }
                } catch (dbError) {
                    // Ignore database errors
                }

                await logChannel.send({ embeds: [embed] });
            }
        }

        // Log moderation action if it was a kick/ban
        if (reason !== 'Left voluntarily') {
            client.db.addModLog(member.guild.id, 'Member Left', member.user.id, 'System', reason);
        }

    } catch (error) {
        client.logger.error(`Error logging member leave for ${member.user.tag}:`, error);
    }
}

/**
 * Clean up user data when they leave (optional)
 * @param {GuildMember} member - Member who left
 * @param {Client} client - Discord client
 */
function cleanupUserData(member, client) {
    try {
        // Remove any pending mutes
        client.db.removeMute(member.guild.id, member.user.id);
        
        // Remove from any active giveaways
        // Note: You might want to keep giveaway entries for fairness
        
        client.logger.debug(`Cleaned up data for ${member.user.tag} in ${member.guild.name}`);

    } catch (error) {
        client.logger.error(`Error cleaning up data for ${member.user.tag}:`, error);
    }
}
