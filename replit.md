# Overview

This is a comprehensive Discord moderation bot built with Node.js and Discord.js v14. The bot provides full-featured moderation capabilities including user warnings, mutes, bans, automated moderation, giveaway management, role assignment, and detailed logging. It features a SQLite database for persistent data storage and supports both slash commands and traditional prefix commands.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Framework
- **Discord.js v14**: Modern Discord API wrapper with full gateway intents support
- **Node.js**: JavaScript runtime environment
- **Slash Commands**: Primary command interface with fallback to prefix commands

## Database Layer
- **Better-SQLite3**: Synchronous SQLite database for persistent storage
- **Database Schema**: Includes tables for guild settings, warnings, mutes, giveaways, moderation logs, and role menus
- **Data Retention**: Automatic cleanup of old logs and expired warnings
- **Write-Ahead Logging (WAL)**: Enabled for better concurrent access

## Permission System
- **Role-Based Access**: Three-tier permission system (admin, moderator, helper)
- **Discord Permissions**: Maps to native Discord permissions (Administrator, ManageGuild, etc.)
- **Owner Override**: Bot owner has unrestricted access
- **Hierarchy Respect**: Users cannot moderate members with equal or higher roles

## Command Architecture
- **Modular Design**: Commands organized by category (admin, moderation, utility, etc.)
- **Permission Validation**: Each command specifies required permission level
- **Rate Limiting**: Built-in cooldown system to prevent abuse
- **Error Handling**: Comprehensive error handling with user-friendly messages

## Event System
- **Event-Driven**: Responds to Discord events (member join/leave, message creation, etc.)
- **Auto-Moderation**: Real-time message filtering for spam, caps, and unwanted links
- **Welcome/Leave Messages**: Automated member greeting and farewell system

## Scheduled Tasks
- **Node-Cron**: Handles recurring tasks like giveaway endings and mute expirations
- **Database Cleanup**: Automatic removal of expired data
- **Status Updates**: Dynamic bot activity rotation

## Logging System
- **File-Based Logging**: Daily log files with timestamp and level categorization
- **Console Output**: Color-coded console logging for development
- **Structured Logging**: JSON format for complex data logging

## Utility Systems
- **Embed Manager**: Centralized embed creation with consistent styling
- **Time Parser**: Human-readable time parsing using the 'ms' library
- **Permission Utilities**: Helper functions for permission checking

# External Dependencies

## Core Libraries
- **discord.js**: Discord API interaction and gateway handling
- **better-sqlite3**: SQLite database operations
- **ms**: Time string parsing and formatting
- **node-cron**: Scheduled task execution

## Discord Integration
- **Gateway Intents**: Full access to guilds, messages, members, and moderation events
- **Slash Commands**: Modern Discord command interface
- **Button/Select Menu Interactions**: Interactive UI components
- **Webhook Support**: For advanced logging and notifications

## File System
- **Local SQLite Database**: Stored in ./data/bot.db
- **Log Files**: Daily rotation in ./logs directory
- **Configuration**: JSON-based configuration in config.json

## Environment Variables
- **DISCORD_TOKEN**: Bot authentication token
- **CLIENT_ID**: Discord application client ID
- **NODE_ENV**: Environment specification (development/production)