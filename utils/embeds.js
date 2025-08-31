const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

class EmbedManager {
    /**
     * Create a basic embed with default styling
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {string} color - Embed color (hex)
     * @returns {EmbedBuilder}
     */
    static createEmbed(title, description, color = config.embedColor) {
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: 'Discord Moderation Bot' });
    }

    /**
     * Create a success embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @returns {EmbedBuilder}
     */
    static createSuccessEmbed(title, description) {
        return this.createEmbed(title, description, config.successColor);
    }

    /**
     * Create an error embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @returns {EmbedBuilder}
     */
    static createErrorEmbed(title, description) {
        return this.createEmbed(title, description, config.errorColor);
    }

    /**
     * Create a warning embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {string} color - Embed color (optional)
     * @returns {EmbedBuilder}
     */
    static createWarningEmbed(title, description, color = config.warningColor) {
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
    }

    /**
     * Create a giveaway embed
     * @param {Object} giveaway - Giveaway data
     * @param {number} entryCount - Number of entries
     * @returns {EmbedBuilder}
     */
    static createGiveawayEmbed(giveaway, entryCount) {
        const embed = new EmbedBuilder()
            .setTitle('🎉 Giveaway!')
            .setDescription(`**Prize:** ${giveaway.prize}\n**Entries:** ${entryCount}\n**Ends:** <t:${Math.floor(new Date(giveaway.ends_at).getTime() / 1000)}:R>`)
            .setColor(config.giveawayColor)
            .setTimestamp(new Date(giveaway.ends_at));

        if (giveaway.description) {
            embed.addFields([{ name: 'Description', value: giveaway.description, inline: false }]);
        }

        return embed;
    }

    /**
     * Create a giveaway ended embed
     * @param {Object} giveaway - Giveaway data
     * @param {Array} winners - Array of winner user objects
     * @returns {EmbedBuilder}
     */
    static createGiveawayEndedEmbed(giveaway, winners = []) {
        const winnersText = winners.length > 0
            ? winners.map(w => `<@${w.user_id}>`).join(', ')
            : 'No valid winners';

        return new EmbedBuilder()
            .setTitle('🎉 Giveaway Ended!')
            .setDescription(giveaway.title)
            .setColor('#FF6B6B')
            .addFields([
                { name: 'Prize', value: giveaway.description || 'No description provided', inline: false },
                { name: 'Winners', value: winnersText, inline: false },
                { name: 'Host', value: `<@${giveaway.host_id}>`, inline: true },
                { name: 'Ended', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: 'Giveaway Ended' });
    }

    /**
     * Create a moderation action embed
     * @param {string} action - Moderation action
     * @param {User} target - Target user
     * @param {User} moderator - Moderator
     * @param {string} reason - Reason for action
     * @param {string} duration - Duration (optional)
     * @returns {EmbedBuilder}
     */
    static createModerationEmbed(action, target, moderator, reason, duration = null) {
        const embed = new EmbedBuilder()
            .setTitle(`🔨 ${action}`)
            .setColor(config.warningColor)
            .addFields([
                { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
                { name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true },
                { name: 'Reason', value: reason || 'No reason provided', inline: false }
            ])
            .setTimestamp()
            .setThumbnail(target.displayAvatarURL())
            .setFooter({ text: 'Moderation Log' });

        if (duration) {
            embed.addFields([{ name: 'Duration', value: duration, inline: true }]);
        }

        return embed;
    }

    /**
     * Create a user info embed
     * @param {GuildMember} member - Guild member
     * @param {Array} warnings - User warnings
     * @returns {EmbedBuilder}
     */
    static createUserInfoEmbed(member, warnings = []) {
        const user = member.user;
        const embed = new EmbedBuilder()
            .setTitle(`User Information - ${user.tag}`)
            .setColor(config.embedColor)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields([
                { name: 'User ID', value: user.id, inline: true },
                { name: 'Username', value: user.tag, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
                { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
                { name: 'Roles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.toString()).join(', ') || 'None', inline: false },
                { name: 'Warnings', value: warnings.length.toString(), inline: true },
                { name: 'Status', value: member.presence?.status || 'offline', inline: true },
                { name: 'Boost Status', value: member.premiumSince ? `Boosting since <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:F>` : 'Not boosting', inline: false }
            ])
            .setTimestamp()
            .setFooter({ text: 'User Information' });

        return embed;
    }

    /**
     * Create a server info embed
     * @param {Guild} guild - Discord guild
     * @returns {EmbedBuilder}
     */
    static createServerInfoEmbed(guild) {
        const embed = new EmbedBuilder()
            .setTitle(`Server Information - ${guild.name}`)
            .setColor(config.embedColor)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .addFields([
                { name: 'Server ID', value: guild.id, inline: true },
                { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
                { name: 'Members', value: guild.memberCount.toString(), inline: true },
                { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
                { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
                { name: 'Boost Level', value: `Level ${guild.premiumTier}`, inline: true },
                { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
                { name: 'Verification Level', value: guild.verificationLevel.toString(), inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: 'Server Information' });

        if (guild.description) {
            embed.addFields([{ name: 'Description', value: guild.description, inline: false }]);
        }

        return embed;
    }

    /**
     * Create a welcome embed
     * @param {GuildMember} member - New guild member
     * @param {string} customMessage - Custom welcome message
     * @returns {EmbedBuilder}
     */
    static createWelcomeEmbed(member, customMessage) {
        const defaultMessage = `Welcome to **${member.guild.name}**, ${member.user}! We're glad to have you here.`;
        const message = customMessage || defaultMessage;

        return new EmbedBuilder()
            .setTitle('👋 Welcome!')
            .setDescription(message.replace('{user}', member.user.toString()).replace('{server}', member.guild.name))
            .setColor(config.successColor)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields([
                { name: 'Member Count', value: member.guild.memberCount.toString(), inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() });
    }

    /**
     * Create a leave embed
     * @param {User} user - User who left
     * @param {Guild} guild - Guild they left
     * @param {string} customMessage - Custom leave message
     * @returns {EmbedBuilder}
     */
    static createLeaveEmbed(user, guild, customMessage) {
        const defaultMessage = `**${user.tag}** has left the server.`;
        const message = customMessage || defaultMessage;

        return new EmbedBuilder()
            .setTitle('👋 Goodbye!')
            .setDescription(message.replace('{user}', user.tag).replace('{server}', guild.name))
            .setColor(config.errorColor)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields([
                { name: 'Member Count', value: guild.memberCount.toString(), inline: true },
                { name: 'Account Age', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });
    }

    /**
     * Create a help embed for commands
     * @param {Array} commands - Array of command objects
     * @param {string} category - Command category
     * @returns {EmbedBuilder}
     */
    static createHelpEmbed(commands, category = 'Commands') {
        const embed = new EmbedBuilder()
            .setTitle(`📚 ${category} Help`)
            .setColor(config.embedColor)
            .setTimestamp()
            .setFooter({ text: 'Use /help <command> for detailed information about a specific command' });

        commands.forEach(cmd => {
            embed.addFields([{
                name: `${config.prefix}${cmd.name}`,
                value: cmd.description || 'No description available',
                inline: true
            }]);
        });

        return embed;
    }
}

module.exports = EmbedManager;