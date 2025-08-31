const ms = require('ms');

class TimeParser {
    /**
     * Parse time string to milliseconds
     * @param {string} timeString - Time string (e.g., "1h", "30m", "5d")
     * @returns {number|null} - Milliseconds or null if invalid
     */
    static parseTime(timeString) {
        if (!timeString || typeof timeString !== 'string') return null;

        try {
            const parsed = ms(timeString);
            return parsed || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Convert milliseconds to human readable format
     * @param {number} milliseconds - Milliseconds
     * @returns {string} - Human readable time
     */
    static formatTime(milliseconds) {
        if (!milliseconds || milliseconds <= 0) return 'Never';

        try {
            return ms(milliseconds, { long: true });
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Get future timestamp from time string
     * @param {string} timeString - Time string
     * @returns {Date|null} - Future date or null
     */
    static getFutureTimestamp(timeString) {
        const parsed = this.parseTime(timeString);
        if (!parsed) return null;

        return new Date(Date.now() + parsed);
    }

    /**
     * Get remaining time until timestamp
     * @param {Date|string} timestamp - Target timestamp
     * @returns {string} - Remaining time string
     */
    static getRemainingTime(timestamp) {
        const target = new Date(timestamp);
        const now = new Date();
        const diff = target.getTime() - now.getTime();

        if (diff <= 0) return 'Expired';

        return this.formatTime(diff);
    }

    /**
     * Check if timestamp has expired
     * @param {Date|string} timestamp - Target timestamp
     * @returns {boolean} - True if expired
     */
    static hasExpired(timestamp) {
        const target = new Date(timestamp);
        return target.getTime() <= Date.now();
    }

    /**
     * Validate time string format
     * @param {string} timeString - Time string to validate
     * @returns {boolean} - True if valid
     */
    static isValidTimeString(timeString) {
        return this.parseTime(timeString) !== null;
    }

    /**
     * Get common time suggestions
     * @returns {Array} - Array of time suggestions
     */
    static getTimeSuggestions() {
        return [
            { value: '5m', label: '5 minutes' },
            { value: '10m', label: '10 minutes' },
            { value: '30m', label: '30 minutes' },
            { value: '1h', label: '1 hour' },
            { value: '2h', label: '2 hours' },
            { value: '6h', label: '6 hours' },
            { value: '12h', label: '12 hours' },
            { value: '1d', label: '1 day' },
            { value: '3d', label: '3 days' },
            { value: '1w', label: '1 week' },
            { value: '1M', label: '1 month' }
        ];
    }

    /**
     * Parse duration string with maximum limits
     * @param {string} timeString - Time string
     * @param {number} maxMs - Maximum milliseconds allowed
     * @returns {number|null} - Parsed time or null if invalid/too long
     */
    static parseTimeWithLimit(timeString, maxMs) {
        const parsed = this.parseTime(timeString);
        if (!parsed || parsed > maxMs) return null;
        return parsed;
    }

    /**
     * Get ISO string for database storage
     * @param {Date} date - Date object
     * @returns {string} - ISO string
     */
    static toISOString(date) {
        return date.toISOString();
    }

    /**
     * Parse ISO string from database
     * @param {string} isoString - ISO date string
     * @returns {Date} - Date object
     */
    static fromISOString(isoString) {
        return new Date(isoString);
    }

    /**
     * Get relative time string for Discord timestamps
     * @param {Date|string} timestamp - Target timestamp
     * @returns {string} - Discord timestamp format
     */
    static getDiscordTimestamp(timestamp, format = 'R') {
        const date = new Date(timestamp);
        const unixTimestamp = Math.floor(date.getTime() / 1000);
        return `<t:${unixTimestamp}:${format}>`;
    }

    /**
     * Get common mute durations
     * @returns {Array} - Array of mute duration options
     */
    static getMuteDurations() {
        return [
            { value: '5m', label: '5 minutes', ms: 5 * 60 * 1000 },
            { value: '10m', label: '10 minutes', ms: 10 * 60 * 1000 },
            { value: '30m', label: '30 minutes', ms: 30 * 60 * 1000 },
            { value: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
            { value: '2h', label: '2 hours', ms: 2 * 60 * 60 * 1000 },
            { value: '6h', label: '6 hours', ms: 6 * 60 * 60 * 1000 },
            { value: '12h', label: '12 hours', ms: 12 * 60 * 60 * 1000 },
            { value: '1d', label: '1 day', ms: 24 * 60 * 60 * 1000 },
            { value: '3d', label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
            { value: '1w', label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 }
        ];
    }
}

module.exports = TimeParser;
