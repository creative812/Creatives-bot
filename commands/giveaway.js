const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const PermissionManager = require('../utils/permissions.js');
const EmbedManager = require('../utils/embeds.js');
const TimeParser = require('../utils/timeParser.js');
const config = require('../config.json');

const commands = [
    {
        name: 'giveaway',
        description: 'Start a new giveaway',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Start a new giveaway')
            .addStringOption(option =>
                option.setName('duration')
                    .setDescription('Duration of the giveaway (e.g., 1h, 30m, 1d)')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('prize')
                    .setDescription('The prize to give away')
                    .setMaxLength(256)
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('winners')
                    .setDescription('Number of winners')
                    .setMinValue(1)
                    .setMaxValue(20)
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('description')
                    .setDescription('Additional description for the giveaway')
                    .setMaxLength(1000)
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('requirements')
                    .setDescription('Requirements to enter the giveaway')
                    .setMaxLength(500)
                    .setRequired(false)),
        async execute(interaction, client) {
            const duration = interaction.options.getString('duration');
            const prize = interaction.options.getString('prize');
            const winners = interaction.options.getInteger('winners') || 1;
            const description = interaction.options.getString('description');
            const requirements = interaction.options.getString('requirements');

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            const durationMs = TimeParser.parseTime(duration);
            if (!durationMs) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Invalid Duration', 'Please provide a valid duration (e.g., 1h, 30m, 1d).')], 
                    ephemeral: true 
                });
            }

            // Minimum duration of 1 minute
            if (durationMs < 60000) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Duration Too Short', 'Giveaway duration must be at least 1 minute.')], 
                    ephemeral: true 
                });
            }

            // Maximum duration of 30 days
            const maxDuration = 30 * 24 * 60 * 60 * 1000;
            if (durationMs > maxDuration) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Duration Too Long', 'Maximum giveaway duration is 30 days.')], 
                    ephemeral: true 
                });
            }

            try {
                const endsAt = new Date(Date.now() + durationMs);

                // Create giveaway object
                const giveaway = {
                    title: prize,
                    description: description,
                    winner_count: winners,
                    requirements: requirements,
                    ends_at: endsAt.toISOString(),
                    host_id: interaction.user.id
                };

                // Create embed
                const embed = EmbedManager.createGiveawayEmbed(giveaway, 0);

                // Create button
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('giveaway_enter')
                            .setLabel('🎉 Enter Giveaway')
                            .setStyle(ButtonStyle.Primary)
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
                const message = await interaction.fetchReply();

                // Store giveaway in database
                client.db.createGiveaway(
                    interaction.guild.id,
                    interaction.channel.id,
                    message.id,
                    interaction.user.id,
                    prize,
                    description,
                    winners,
                    requirements,
                    endsAt.toISOString()
                );

                client.logger.info(`Giveaway started: ${prize} - Duration: ${TimeParser.formatTime(durationMs)} - Host: ${interaction.user.tag} - Guild: ${interaction.guild.name}`);

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Giveaway Started', 'N/A', interaction.user.id, 
                    `Prize: ${prize}, Duration: ${TimeParser.formatTime(durationMs)}, Winners: ${winners}`);

            } catch (error) {
                client.logger.error('Error in giveaway command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while starting the giveaway.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'giveaway-end',
        description: 'End a giveaway early',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('giveaway-end')
            .setDescription('End a giveaway early')
            .addStringOption(option =>
                option.setName('message_id')
                    .setDescription('Message ID of the giveaway to end')
                    .setRequired(true)),
        async execute(interaction, client) {
            const messageId = interaction.options.getString('message_id');

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            try {
                const giveaway = client.db.getGiveaway(messageId);
                
                if (!giveaway) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Giveaway Not Found', 'No active giveaway found with that message ID.')], 
                        ephemeral: true 
                    });
                }

                if (giveaway.guild_id !== interaction.guild.id) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'That giveaway is not in this server.')], 
                        ephemeral: true 
                    });
                }

                if (giveaway.ended) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'That giveaway has already ended.')], 
                        ephemeral: true 
                    });
                }

                // End the giveaway
                await endGiveaway(client, giveaway);

                const embed = EmbedManager.createSuccessEmbed('Giveaway Ended', 
                    `The giveaway "${giveaway.title}" has been ended early.`);

                await interaction.reply({ embeds: [embed] });

                client.db.addModLog(interaction.guild.id, 'Giveaway Ended Early', 'N/A', interaction.user.id, 
                    `Prize: ${giveaway.title}`);

            } catch (error) {
                client.logger.error('Error in giveaway-end command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while ending the giveaway.')], 
                    ephemeral: true 
                });
            }
        }
    },

    {
        name: 'giveaway-reroll',
        description: 'Reroll winners for a giveaway',
        permissions: ['moderator'],
        data: new SlashCommandBuilder()
            .setName('giveaway-reroll')
            .setDescription('Reroll winners for a giveaway')
            .addStringOption(option =>
                option.setName('message_id')
                    .setDescription('Message ID of the giveaway to reroll')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('winner_count')
                    .setDescription('Number of new winners to select')
                    .setMinValue(1)
                    .setMaxValue(20)
                    .setRequired(false)),
        async execute(interaction, client) {
            const messageId = interaction.options.getString('message_id');
            const newWinnerCount = interaction.options.getInteger('winner_count');

            if (!PermissionManager.isModerator(interaction.member)) {
                return interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need moderator permissions to use this command.')], 
                    ephemeral: true 
                });
            }

            try {
                const giveaway = client.db.getGiveaway(messageId);
                
                if (!giveaway) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Giveaway Not Found', 'No giveaway found with that message ID.')], 
                        ephemeral: true 
                    });
                }

                if (giveaway.guild_id !== interaction.guild.id) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'That giveaway is not in this server.')], 
                        ephemeral: true 
                    });
                }

                if (!giveaway.ended) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('Error', 'That giveaway is still active. End it first before rerolling.')], 
                        ephemeral: true 
                    });
                }

                // Get entries
                const entries = client.db.getGiveawayEntries(giveaway.id);
                
                if (entries.length === 0) {
                    return interaction.reply({ 
                        embeds: [EmbedManager.createErrorEmbed('No Entries', 'No one entered this giveaway.')], 
                        ephemeral: true 
                    });
                }

                // Select new winners
                const winnerCount = newWinnerCount || giveaway.winner_count;
                const winners = selectRandomWinners(entries, winnerCount);

                // Fetch winner users
                const winnerUsers = [];
                for (const winner of winners) {
                    try {
                        const user = await client.users.fetch(winner.user_id);
                        winnerUsers.push({ user_id: winner.user_id, user });
                    } catch (error) {
                        client.logger.warn(`Failed to fetch winner user ${winner.user_id}:`, error);
                    }
                }

                // Create reroll announcement
                const embed = EmbedManager.createEmbed('🎉 Giveaway Reroll!', 
                    `**Prize:** ${giveaway.title}\n**New Winner(s):** ${winnerUsers.length > 0 ? winnerUsers.map(w => `<@${w.user_id}>`).join(', ') : 'No valid winners'}`, 
                    config.giveawayColor);
                embed.addFields([
                    { name: 'Original Host', value: `<@${giveaway.host_id}>`, inline: true },
                    { name: 'Rerolled By', value: `<@${interaction.user.id}>`, inline: true }
                ]);

                await interaction.reply({ embeds: [embed] });

                // Try to update original message
                try {
                    const channel = await client.channels.fetch(giveaway.channel_id);
                    const message = await channel.messages.fetch(giveaway.message_id);
                    
                    const endedEmbed = EmbedManager.createGiveawayEndedEmbed(giveaway, winnerUsers);
                    endedEmbed.addFields([{ name: 'Rerolled', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }]);
                    
                    await message.edit({ embeds: [endedEmbed], components: [] });
                } catch (error) {
                    client.logger.warn('Failed to update original giveaway message:', error);
                }

                client.db.addModLog(interaction.guild.id, 'Giveaway Reroll', 'N/A', interaction.user.id, 
                    `Prize: ${giveaway.title}, New Winners: ${winnerUsers.length}`);

            } catch (error) {
                client.logger.error('Error in giveaway-reroll command:', error);
                await interaction.reply({ 
                    embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while rerolling the giveaway.')], 
                    ephemeral: true 
                });
            }
        }
    }
];

/**
 * End a giveaway and select winners
 * @param {Client} client - Discord client
 * @param {Object} giveaway - Giveaway data
 */
async function endGiveaway(client, giveaway) {
    try {
        // Mark as ended
        client.db.endGiveaway(giveaway.id);

        // Get entries
        const entries = client.db.getGiveawayEntries(giveaway.id);
        
        // Select winners
        const winners = selectRandomWinners(entries, giveaway.winner_count);

        // Fetch winner users
        const winnerUsers = [];
        for (const winner of winners) {
            try {
                const user = await client.users.fetch(winner.user_id);
                winnerUsers.push({ user_id: winner.user_id, user });
            } catch (error) {
                client.logger.warn(`Failed to fetch winner user ${winner.user_id}:`, error);
            }
        }

        // Update the giveaway message
        try {
            const channel = await client.channels.fetch(giveaway.channel_id);
            const message = await channel.messages.fetch(giveaway.message_id);
            
            const embed = EmbedManager.createGiveawayEndedEmbed(giveaway, winnerUsers);
            await message.edit({ embeds: [embed], components: [] });

            // Announce winners in the channel
            if (winnerUsers.length > 0) {
                const announcement = `🎉 **Giveaway Ended!**\n\n**Winner(s):** ${winnerUsers.map(w => `<@${w.user_id}>`).join(', ')}\n**Prize:** ${giveaway.title}`;
                await channel.send(announcement);

                // Send DMs to winners
                for (const winnerUser of winnerUsers) {
                    try {
                        const dmEmbed = EmbedManager.createEmbed('🎉 You Won!', 
                            `Congratulations! You won the giveaway in **${channel.guild.name}**!\n\n**Prize:** ${giveaway.title}`, 
                            config.giveawayColor);
                        await winnerUser.user.send({ embeds: [dmEmbed] });
                    } catch (error) {
                        client.logger.warn(`Failed to send DM to winner ${winnerUser.user.tag}:`, error);
                    }
                }
            } else {
                await channel.send(`🎉 **Giveaway Ended!**\n\n**Prize:** ${giveaway.title}\n\nNo valid winners could be determined.`);
            }
        } catch (error) {
            client.logger.error('Failed to update giveaway message:', error);
        }

        client.logger.info(`Giveaway ended: ${giveaway.title} - Winners: ${winnerUsers.length}`);

    } catch (error) {
        client.logger.error('Error ending giveaway:', error);
        throw error;
    }
}

/**
 * Select random winners from entries
 * @param {Array} entries - Array of giveaway entries
 * @param {number} count - Number of winners to select
 * @returns {Array} - Array of selected winners
 */
function selectRandomWinners(entries, count) {
    if (entries.length === 0) return [];
    
    const shuffled = [...entries].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, entries.length));
}

// Export both commands and the endGiveaway function for use in scheduled tasks
module.exports = { commands, endGiveaway };
