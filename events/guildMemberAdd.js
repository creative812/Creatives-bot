const EmbedManager = require('../utils/embeds.js');
const PermissionManager = require('../utils/permissions.js');

module.exports = {
    name: 'guildMemberAdd',
    execute(member, client) {
        // Get guild settings
        const settings = client.db.getGuildSettings(member.guild.id);

        // Send welcome message
        if (settings?.welcome_channel_id) {
            sendWelcomeMessage(member, client, settings);
        }

        // Assign auto-role
        if (settings?.auto_role_id) {
            assignAutoRole(member, client, settings);
        }

        // Log member join
        client.logger.info(`User joined: ${member.user.tag} (${member.user.id}) in ${member.guild.name} (${member.guild.id})`);

        // Check for suspicious accounts (optional security feature)
        checkSuspiciousAccount(member, client, settings);
    }
};

/**
 * Send welcome message to new member
 * @param {GuildMember} member - New guild member
 * @param {Client} client - Discord client
 * @param {Object} settings - Guild settings
 */
async function sendWelcomeMessage(member, client, settings) {
    try {
        const welcomeChannel = member.guild.channels.cache.get(settings.welcome_channel_id);
        
        if (!welcomeChannel) {
            client.logger.warn(`Welcome channel not found: ${settings.welcome_channel_id} in ${member.guild.name}`);
            return;
        }

        // Check if bot has permissions to send messages
        if (!PermissionManager.botHasPermissions(welcomeChannel, ['SendMessages', 'EmbedLinks'])) {
            client.logger.warn(`Missing permissions in welcome channel: ${welcomeChannel.name} in ${member.guild.name}`);
            return;
        }

        // Create welcome embed
        const embed = EmbedManager.createWelcomeEmbed(member, settings.welcome_message);

        await welcomeChannel.send({ embeds: [embed] });

        client.logger.info(`Welcome message sent for ${member.user.tag} in ${member.guild.name}`);

    } catch (error) {
        client.logger.error(`Error sending welcome message for ${member.user.tag}:`, error);
    }
}

/**
 * Assign auto-role to new member
 * @param {GuildMember} member - New guild member
 * @param {Client} client - Discord client
 * @param {Object} settings - Guild settings
 */
async function assignAutoRole(member, client, settings) {
    try {
        const autoRole = member.guild.roles.cache.get(settings.auto_role_id);
        
        if (!autoRole) {
            client.logger.warn(`Auto-role not found: ${settings.auto_role_id} in ${member.guild.name}`);
            return;
        }

        // Check if bot can assign the role
        if (autoRole.position >= member.guild.members.me.roles.highest.position) {
            client.logger.warn(`Cannot assign auto-role ${autoRole.name} in ${member.guild.name} - role too high`);
            return;
        }

        // Check if role is managed by integration
        if (autoRole.managed) {
            client.logger.warn(`Cannot assign auto-role ${autoRole.name} in ${member.guild.name} - role is managed`);
            return;
        }

        // Check if bot has permission to manage roles
        if (!member.guild.members.me.permissions.has('ManageRoles')) {
            client.logger.warn(`Missing Manage Roles permission in ${member.guild.name}`);
            return;
        }

        await member.roles.add(autoRole, 'Auto-role assignment');

        client.logger.info(`Auto-role ${autoRole.name} assigned to ${member.user.tag} in ${member.guild.name}`);

        // Log the action
        client.db.addModLog(member.guild.id, 'Auto-Role Assigned', member.user.id, client.user.id, 
            `Auto-assigned role: ${autoRole.name}`);

    } catch (error) {
        client.logger.error(`Error assigning auto-role to ${member.user.tag}:`, error);
    }
}

/**
 * Check for suspicious account patterns
 * @param {GuildMember} member - New guild member
 * @param {Client} client - Discord client
 * @param {Object} settings - Guild settings
 */
async function checkSuspiciousAccount(member, client, settings) {
    try {
        const suspiciousReasons = [];
        const user = member.user;
        const now = new Date();
        const accountAge = now - user.createdAt;
        
        // Very new account (less than 7 days)
        if (accountAge < 7 * 24 * 60 * 60 * 1000) {
            suspiciousReasons.push(`Account created ${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days ago`);
        }

        // Default avatar
        if (user.avatar === null) {
            suspiciousReasons.push('Using default avatar');
        }

        // Suspicious username patterns
        if (/(.)\1{3,}/.test(user.username) || // Repeated characters
            /^\w+\d{4,}$/.test(user.username) || // Username followed by many numbers
            user.username.length < 3) { // Very short username
            suspiciousReasons.push('Suspicious username pattern');
        }

        // No custom status or activity
        if (!member.presence?.activities || member.presence.activities.length === 0) {
            suspiciousReasons.push('No Discord activity');
        }

        // If suspicious and logging is enabled
        if (suspiciousReasons.length >= 2 && settings?.log_channel_id) {
            const logChannel = member.guild.channels.cache.get(settings.log_channel_id);
            
            if (logChannel && PermissionManager.botHasPermissions(logChannel, ['SendMessages', 'EmbedLinks'])) {
                const embed = EmbedManager.createWarningEmbed('🚨 Suspicious Account Joined', 
                    `${user.tag} (${user.id}) joined the server with potentially suspicious characteristics.`)
                    .addFields([
                        { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
                        { name: 'Account Age', value: `${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days`, inline: true },
                        { name: 'Suspicious Indicators', value: suspiciousReasons.join('\n'), inline: false },
                        { name: 'Recommendation', value: 'Consider monitoring this user closely or implementing verification requirements.', inline: false }
                    ])
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }));

                await logChannel.send({ embeds: [embed] });

                client.logger.warn(`Suspicious account detected: ${user.tag} in ${member.guild.name} - ${suspiciousReasons.join(', ')}`);
            }
        }

    } catch (error) {
        client.logger.error(`Error checking suspicious account for ${member.user.tag}:`, error);
    }
}
