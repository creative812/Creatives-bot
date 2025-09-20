const { SlashCommandBuilder } = require('discord.js');
const EmbedManager = require('../utils/embeds.js');
const PermissionManager = require('../utils/permissions.js');

module.exports = {
    name: 'manage-command',
    description: 'Enable or disable bot commands',
    permissions: ['admin'],
    data: new SlashCommandBuilder()
        .setName('manage-command')
        .setDescription('Enable or disable bot commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to disable')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for disabling the command')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable a previously disabled command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to enable')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all disabled commands'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check if a command is enabled or disabled')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to check')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async execute(interaction, client) {
        if (!PermissionManager.isAdmin(interaction.member)) {
            return interaction.reply({
                embeds: [EmbedManager.createErrorEmbed('Permission Denied', 'You need admin permissions to manage commands.')],
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'disable') {
                const commandName = interaction.options.getString('command');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                // Prevent disabling critical commands
                const protectedCommands = ['manage-command', 'help', 'settings'];
                if (protectedCommands.includes(commandName)) {
                    return interaction.reply({
                        embeds: [EmbedManager.createErrorEmbed('Cannot Disable', `The command \`${commandName}\` is protected and cannot be disabled.`)],
                        ephemeral: true
                    });
                }

                // Check if command exists
                const command = client.commands.get(commandName);
                if (!command) {
                    return interaction.reply({
                        embeds: [EmbedManager.createErrorEmbed('Command Not Found', `No command found with the name \`${commandName}\`.`)],
                        ephemeral: true
                    });
                }

                // Check if already disabled
                const existing = client.db.getDisabledCommand(interaction.guild.id, commandName);
                if (existing) {
                    return interaction.reply({
                        embeds: [EmbedManager.createErrorEmbed('Already Disabled', `Command \`${commandName}\` is already disabled.`)],
                        ephemeral: true
                    });
                }

                // Disable the command
                client.db.disableCommand(interaction.guild.id, commandName, interaction.user.id, reason);

                const embed = EmbedManager.createSuccessEmbed('Command Disabled', `Successfully disabled the \`${commandName}\` command.`)
                    .addFields(
                        { name: '📝 Reason', value: reason, inline: false },
                        { name: '👤 Disabled By', value: interaction.user.tag, inline: true },
                        { name: '⏰ Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    );

                await interaction.reply({ embeds: [embed] });

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Command Disabled', 'N/A', interaction.user.id, `Disabled command: ${commandName} - ${reason}`);

            } else if (subcommand === 'enable') {
                const commandName = interaction.options.getString('command');

                // Check if command is disabled
                const disabled = client.db.getDisabledCommand(interaction.guild.id, commandName);
                if (!disabled) {
                    return interaction.reply({
                        embeds: [EmbedManager.createErrorEmbed('Not Disabled', `Command \`${commandName}\` is not currently disabled.`)],
                        ephemeral: true
                    });
                }

                // Enable the command
                client.db.enableCommand(interaction.guild.id, commandName);

                const embed = EmbedManager.createSuccessEmbed('Command Enabled', `Successfully enabled the \`${commandName}\` command.`)
                    .addFields(
                        { name: '👤 Previously Disabled By', value: `<@${disabled.disabledby}>`, inline: true },
                        { name: '📝 Original Reason', value: disabled.reason || 'No reason provided', inline: false },
                        { name: '✅ Enabled By', value: interaction.user.tag, inline: true },
                        { name: '⏰ Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    );

                await interaction.reply({ embeds: [embed] });

                // Log the action
                client.db.addModLog(interaction.guild.id, 'Command Enabled', 'N/A', interaction.user.id, `Enabled command: ${commandName}`);

            } else if (subcommand === 'list') {
                const disabledCommands = client.db.getDisabledCommands(interaction.guild.id);

                if (disabledCommands.length === 0) {
                    return interaction.reply({
                        embeds: [EmbedManager.createEmbed('📋 Disabled Commands', 'No commands are currently disabled.', null)],
                        ephemeral: true
                    });
                }

                const embed = EmbedManager.createEmbed('📋 Disabled Commands', `Found ${disabledCommands.length} disabled command(s).`, null)
                    .setColor('#FFA500'); // Orange color for warning

                // Group commands for better display
                const commandList = disabledCommands.map((cmd, index) => {
                    const disabledDate = new Date(cmd.createdat).getTime();
                    return `**${index + 1}.** \`${cmd.commandname}\`\n` +
                           `└ **Reason:** ${cmd.reason || 'No reason provided'}\n` +
                           `└ **By:** <@${cmd.disabledby}> • <t:${Math.floor(disabledDate / 1000)}:R>`;
                }).join('\n\n');

                // Split into multiple embeds if too long
                if (commandList.length > 4096) {
                    const chunks = [];
                    let currentChunk = '';

                    for (let i = 0; i < disabledCommands.length; i++) {
                        const cmd = disabledCommands[i];
                        const disabledDate = new Date(cmd.createdat).getTime();
                        const cmdString = `**${i + 1}.** \`${cmd.commandname}\`\n` +
                                        `└ **Reason:** ${cmd.reason || 'No reason provided'}\n` +
                                        `└ **By:** <@${cmd.disabledby}> • <t:${Math.floor(disabledDate / 1000)}:R>\n\n`;

                        if (currentChunk.length + cmdString.length > 4000) {
                            chunks.push(currentChunk);
                            currentChunk = cmdString;
                        } else {
                            currentChunk += cmdString;
                        }
                    }

                    if (currentChunk) chunks.push(currentChunk);

                    embed.setDescription(chunks[0]);
                    if (chunks.length > 1) {
                        embed.setFooter({ text: `Page 1 of ${chunks.length} • Use the command again to see all` });
                    }
                } else {
                    embed.setDescription(commandList);
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else if (subcommand === 'status') {
                const commandName = interaction.options.getString('command');

                // Check if command exists
                const command = client.commands.get(commandName);
                if (!command) {
                    return interaction.reply({
                        embeds: [EmbedManager.createErrorEmbed('Command Not Found', `No command found with the name \`${commandName}\`.`)],
                        ephemeral: true
                    });
                }

                const disabled = client.db.getDisabledCommand(interaction.guild.id, commandName);

                if (disabled) {
                    const disabledDate = new Date(disabled.createdat).getTime();
                    const embed = EmbedManager.createEmbed('🔴 Command Status', `Command \`${commandName}\` is **disabled**.`, null)
                        .setColor('#FF0000') // Red color for disabled
                        .addFields(
                            { name: '📝 Reason', value: disabled.reason || 'No reason provided', inline: false },
                            { name: '👤 Disabled By', value: `<@${disabled.disabledby}>`, inline: true },
                            { name: '⏰ Date', value: `<t:${Math.floor(disabledDate / 1000)}:F>`, inline: true },
                            { name: '📊 Duration', value: `<t:${Math.floor(disabledDate / 1000)}:R>`, inline: true }
                        );
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    const embed = EmbedManager.createEmbed('🟢 Command Status', `Command \`${commandName}\` is **enabled** and working normally.`, null)
                        .setColor('#00FF00') // Green color for enabled
                        .addFields(
                            { name: '📊 Permissions', value: command.permissions ? command.permissions.join(', ') : 'None required', inline: true },
                            { name: '📝 Description', value: command.description || 'No description available', inline: false }
                        );
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }

        } catch (error) {
            client.logger.error('Error in manage-command:', error);
            await interaction.reply({
                embeds: [EmbedManager.createErrorEmbed('Error', 'An error occurred while managing the command.')],
                ephemeral: true
            });
        }
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const subcommand = interaction.options.getSubcommand();

        if (focusedOption.name === 'command') {
            let choices = [];

            try {
                if (subcommand === 'disable' || subcommand === 'status') {
                    // Show all available commands except protected ones
                    const protectedCommands = ['manage-command', 'help', 'settings'];
                    choices = Array.from(interaction.client.commands.keys())
                        .filter(cmd => !protectedCommands.includes(cmd))
                        .filter(cmd => cmd.toLowerCase().includes(focusedOption.value.toLowerCase()))
                        .slice(0, 25)
                        .sort();
                } else if (subcommand === 'enable') {
                    // Show only disabled commands
                    const disabledCommands = interaction.client.db.getDisabledCommands(interaction.guild.id);
                    choices = disabledCommands
                        .map(cmd => cmd.commandname)
                        .filter(cmd => cmd.toLowerCase().includes(focusedOption.value.toLowerCase()))
                        .slice(0, 25)
                        .sort();
                }

                await interaction.respond(
                    choices.map(choice => ({ name: choice, value: choice }))
                );
            } catch (error) {
                console.error('Error in manage-command autocomplete:', error);
                // Return empty array if there's an error
                await interaction.respond([]);
            }
        }
    }
};