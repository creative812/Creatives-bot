const { PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');

class PermissionManager {
    /**
     * Check if user has required permissions
     * @param {GuildMember} member - Discord guild member
     * @param {string} permissionLevel - admin, moderator, or helper
     * @returns {boolean}
     */
    static hasPermission(member, permissionLevel) {
        if (!member || !member.guild) return false;

        // Bot owner always has all permissions
        if (member.user.id === config.ownerId) return true;

        // Guild owner always has all permissions
        if (member.guild.ownerId === member.user.id) return true;

        const requiredPerms = config.permissions[permissionLevel];
        if (!requiredPerms) return false;

        return requiredPerms.some(perm => {
            if (perm === 'Administrator') {
                return member.permissions.has(PermissionFlagsBits.Administrator);
            }
            if (perm === 'ManageGuild') {
                return member.permissions.has(PermissionFlagsBits.ManageGuild);
            }
            if (perm === 'ModerateMembers') {
                return member.permissions.has(PermissionFlagsBits.ModerateMembers);
            }
            if (perm === 'ManageMessages') {
                return member.permissions.has(PermissionFlagsBits.ManageMessages);
            }
            if (perm === 'KickMembers') {
                return member.permissions.has(PermissionFlagsBits.KickMembers);
            }
            if (perm === 'BanMembers') {
                return member.permissions.has(PermissionFlagsBits.BanMembers);
            }
            return false;
        });
    }

    /**
     * Check if user is admin
     * @param {GuildMember} member - Discord guild member
     * @returns {boolean}
     */
    static isAdmin(member) {
        return this.hasPermission(member, 'admin');
    }

    /**
     * Check if user is moderator or higher
     * @param {GuildMember} member - Discord guild member
     * @returns {boolean}
     */
    static isModerator(member) {
        return this.hasPermission(member, 'admin') || this.hasPermission(member, 'moderator');
    }

    /**
     * Check if user is helper or higher
     * @param {GuildMember} member - Discord guild member
     * @returns {boolean}
     */
    static isHelper(member) {
        return this.hasPermission(member, 'admin') || this.hasPermission(member, 'moderator') || this.hasPermission(member, 'helper');
    }

    /**
     * Check if user can target another user for moderation
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target user
     * @returns {boolean}
     */
    static canModerate(moderator, target) {
        if (!moderator || !target) return false;
        if (moderator.user.id === target.user.id) return false;
        if (target.user.id === moderator.guild.ownerId) return false;
        if (moderator.user.id === config.ownerId) return true;
        if (moderator.user.id === moderator.guild.ownerId) return true;

        // Check role hierarchy
        return moderator.roles.highest.position > target.roles.highest.position;
    }

    /**
     * Get permission level of a member
     * @param {GuildMember} member - Discord guild member
     * @returns {string}
     */
    static getPermissionLevel(member) {
        if (this.isAdmin(member)) return 'admin';
        if (this.isModerator(member)) return 'moderator';
        if (this.isHelper(member)) return 'helper';
        return 'user';
    }

    /**
     * Check if bot has required permissions in channel
     * @param {GuildChannel} channel - Discord channel
     * @param {Array<string>} permissions - Array of permission names
     * @returns {boolean}
     */
    static botHasPermissions(channel, permissions) {
        if (!channel || !channel.guild) return false;

        const botMember = channel.guild.members.me;
        if (!botMember) return false;

        const channelPerms = channel.permissionsFor(botMember);
        if (!channelPerms) return false;

        return permissions.every(perm => {
            const permBit = PermissionFlagsBits[perm];
            return permBit && channelPerms.has(permBit);
        });
    }

    /**
     * Get missing permissions for bot
     * @param {GuildChannel} channel - Discord channel
     * @param {Array<string>} permissions - Array of permission names
     * @returns {Array<string>}
     */
    static getMissingPermissions(channel, permissions) {
        if (!channel || !channel.guild) return permissions;

        const botMember = channel.guild.members.me;
        if (!botMember) return permissions;

        const channelPerms = channel.permissionsFor(botMember);
        if (!channelPerms) return permissions;

        return permissions.filter(perm => {
            const permBit = PermissionFlagsBits[perm];
            return !permBit || !channelPerms.has(permBit);
        });
    }
}

module.exports = PermissionManager;
