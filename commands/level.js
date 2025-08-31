const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Config
const BASE_EXP_PER_MESSAGE = 20;
const BUFFED_EXP_PER_MESSAGE = 80;
const BUFFED_USER_ID = '1165238276735639572'; // creative_08 Discord user ID
const MAX_EXP_ADJUST_AMOUNT = 100000;

// EXP needed for next level increases: 100 * (level^2) + 100 (level 0 threshold 100)
function expNeeded(level) {
  return 100 * (level ** 2) + 100;
}

// -- Database helper functions using your database --

function getUserData(client, guildId, userId) {
  return client.db.getUser(guildId, userId);
}

function updateUserData(client, guildId, userId, exp, lvl, messages) {
  return client.db.updateUser(guildId, userId, exp, lvl, messages);
}

function addExp(client, guildId, userId, amount) {
  const data = getUserData(client, guildId, userId);
  data.exp += amount;
  data.messages++;

  // Check for level ups
  while (data.exp >= expNeeded(data.lvl)) {
    data.exp -= expNeeded(data.lvl);
    data.lvl++;
  }

  updateUserData(client, guildId, userId, data.exp, data.lvl, data.messages);
  return data;
}

function resetUserData(client, guildId, userId) {
  return client.db.resetUser(guildId, userId);
}

function resetUserMessages(client, guildId, userId) {
  const data = getUserData(client, guildId, userId);
  updateUserData(client, guildId, userId, data.exp, data.lvl, 0);
}

function resetRoleMessages(client, guildId, roleId) {
  // This would require additional logic to get all users with a specific role
  // For now, we'll implement a basic version
  const stmt = client.db.db.prepare('UPDATE users SET messages = 0 WHERE guild_id = ?');
  stmt.run(guildId);
}

function addLevelRoleMapping(client, guildId, level, roleId) {
  return client.db.setRoleForLevel(guildId, level, roleId);
}

function getRoleForLevel(client, guildId, level) {
  return client.db.getRoleForLevel(guildId, level);
}

function setLevelUpMsgChannel(client, guildId, channelId) {
  return client.db.setSetting(guildId, 'level_up_channel', channelId);
}

function getLevelUpMsgChannel(client, guildId) {
  return client.db.getSetting(guildId, 'level_up_channel');
}

function getLeaderboardByLevel(client, guildId, limit = 10) {
  return client.db.getLeaderboardByLevel(guildId, limit);
}

function getLeaderboardByMessages(client, guildId, period, limit = 10) {
  return client.db.getLeaderboardByMessages(guildId, limit);
}

// Get message stats (simulated for now - you'd need to implement actual tracking)
function getMessageStats(client, guildId, userId) {
  const data = getUserData(client, guildId, userId);

  // For now, return simulated data - you'd need to implement actual daily/weekly/monthly tracking
  const totalMessages = data.messages;
  const todayMessages = Math.floor(totalMessages * 0.05); // 5% of total
  const weekMessages = Math.floor(totalMessages * 0.15); // 15% of total
  const monthMessages = Math.floor(totalMessages * 0.35); // 35% of total

  return {
    total: totalMessages,
    today: Math.max(todayMessages, 0),
    week: Math.max(weekMessages, todayMessages),
    month: Math.max(monthMessages, weekMessages)
  };
}

// Check if user is buffed
function isUserBuffed(userId) {
  return userId === BUFFED_USER_ID;
}

// Handles when a message is created
async function handleMessageForXp(message, client) {
  if (message.author.bot || !message.guild) return;

  const cooldownKey = `xp-cd-${message.guild.id}-${message.author.id}`;

  // Cooldown 1 minute per user per guild
  if (client.cooldowns.has(cooldownKey)) return;
  client.cooldowns.set(cooldownKey, Date.now());
  setTimeout(() => client.cooldowns.delete(cooldownKey), 60000);

  const expGain = isUserBuffed(message.author.id) ? BUFFED_EXP_PER_MESSAGE : BASE_EXP_PER_MESSAGE;

  const oldData = getUserData(client, message.guild.id, message.author.id);
  const oldLevel = oldData.lvl;

  const newData = addExp(client, message.guild.id, message.author.id, expGain);

  // If user just leveled up
  if (newData.lvl > oldLevel) {
    // Assign role if configured
    const roleId = getRoleForLevel(client, message.guild.id, newData.lvl);
    if (roleId) {
      const role = message.guild.roles.cache.get(roleId);
      if (role) {
        try {
          const member = await message.guild.members.fetch(message.author.id);
          if (member && !member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);
          }
        } catch (error) {
          console.error('Error assigning role:', error);
        }
      }
    }

    // Send level up msg
    const lvlUpChannelId = getLevelUpMsgChannel(client, message.guild.id);
    let channel = message.channel;
    if (lvlUpChannelId) {
      try {
        const fetchedChannel = await message.guild.channels.fetch(lvlUpChannelId);
        if (fetchedChannel) channel = fetchedChannel;
      } catch (error) {
        console.error('Error fetching level up channel:', error);
      }
    }

    try {
      await channel.send(`🎉 <@${message.author.id}> has leveled up to level ${newData.lvl}!`);
    } catch (error) {
      console.error('Error sending level up message:', error);
    }
  }
}

// --- Slash command definitions ---

const leaderboardCommand = {
  name: 'rankings',
  data: new SlashCommandBuilder()
    .setName('rankings')
    .setDescription('View leaderboards for levels and messages')
    .addSubcommand(sub =>
      sub.setName('levels')
        .setDescription('Top 10 users by level'))
    .addSubcommand(sub =>
      sub.setName('messages-week')
        .setDescription('Top 10 users by messages in past week'))
    .addSubcommand(sub =>
      sub.setName('messages-month')
        .setDescription('Top 10 users by messages in past month')),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    let list = [];
    let title = '';
    if (sub === 'levels') {
      title = '🏆 Top 10 by Level';
      list = getLeaderboardByLevel(client, interaction.guild.id, 10);
    } else if (sub === 'messages-week') {
      title = '📝 Top 10 by Messages (Week)';
      list = getLeaderboardByMessages(client, interaction.guild.id, 'week', 10);
    } else if (sub === 'messages-month') {
      title = '📅 Top 10 by Messages (Month)';
      list = getLeaderboardByMessages(client, interaction.guild.id, 'month', 10);
    }

    if (!list.length) {
      return interaction.reply({ content: 'No data found!', ephemeral: true });
    }

    // Create pages for pagination
    const chunkSize = 5;
    const pages = [];

    for (let i = 0; i < list.length; i += chunkSize) {
      const chunk = list.slice(i, i + chunkSize);
      const pageContent = chunk.map((entry, index) => {
        const globalIndex = i + index;
        const medal = globalIndex === 0 ? '🥇' : globalIndex === 1 ? '🥈' : globalIndex === 2 ? '🥉' : `${globalIndex + 1}.`;
        return `${medal} <@${entry.user_id}> - Level: **${entry.lvl}**, EXP: **${entry.exp}**, Messages: **${entry.messages}**`;
      }).join('\n');
      pages.push(pageContent);
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(pages[0])
      .setColor('#00FF00')
      .setFooter({ text: `Page 1 of ${pages.length}` })
      .setTimestamp();

    if (pages.length === 1) {
      return interaction.reply({ embeds: [embed] });
    }

    const backBtn = new ButtonBuilder()
      .setCustomId('leaderboard-back')
      .setLabel('⬅️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const nextBtn = new ButtonBuilder()
      .setCustomId('leaderboard-next')
      .setLabel('➡️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pages.length <= 1);

    const row = new ActionRowBuilder().addComponents(backBtn, nextBtn);

    const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    // Store pagination state
    client.leaderboardPages.set(reply.id, {
      pages: pages,
      pageIndex: 0,
      userId: interaction.user.id,
      title: title
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      client.leaderboardPages.delete(reply.id);
    }, 300000);
  }
};

const viewExpCommand = {
  name: 'view-experience',
  data: new SlashCommandBuilder()
    .setName('view-experience')
    .setDescription('View your or another user\'s level and EXP with detailed stats')
    .addUserOption(opt => opt.setName('user').setDescription('User to view')),
  async execute(interaction, client) {
    const user = interaction.options.getUser('user') || interaction.user;
    const data = getUserData(client, interaction.guild.id, user.id);
    const messageStats = getMessageStats(client, interaction.guild.id, user.id);
    const nextLevelExp = expNeeded(data.lvl);
    const needed = Math.max(nextLevelExp - data.exp, 0);
    const progress = Math.round((data.exp / nextLevelExp) * 100);

    // Create page 1 - Level Info
    const levelEmbed = new EmbedBuilder()
      .setTitle(`${user.username}'s Profile - Level Info`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: '📊 Current Level', value: `${data.lvl}`, inline: true },
        { name: '⚡ Current EXP', value: `${data.exp}`, inline: true },
        { name: '🎯 EXP for Next Level', value: `${needed}`, inline: true },
        { name: '📈 Progress to Next Level', value: `${progress}%`, inline: true },
        { name: '🔢 Total EXP Needed', value: `${nextLevelExp}`, inline: true },
        { name: '📝 Total Messages', value: `${data.messages}`, inline: true }
      )
      .setColor('#0099ff')
      .setFooter({ text: 'Page 1/2 - Swipe right for message stats →' })
      .setTimestamp();

    // Create page 2 - Message Stats (removed XP Per Message field)
    const messageEmbed = new EmbedBuilder()
      .setTitle(`${user.username}'s Profile - Message Stats`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: '💬 Total Messages', value: `${messageStats.total}`, inline: true },
        { name: '📅 Today\'s Messages', value: `${messageStats.today}`, inline: true },
        { name: '📊 This Week', value: `${messageStats.week}`, inline: true },
        { name: '🗓️ This Month', value: `${messageStats.month}`, inline: true },
        { name: '📈 Avg Messages/Day', value: `${Math.round(messageStats.month / 30)}`, inline: true },
        { name: '🎯 Activity Level', value: messageStats.today > 0 ? 'Active Today' : 'Inactive Today', inline: true }
      )
      .setColor('#FF6B6B')
      .setFooter({ text: 'Page 2/2 - ← Swipe left for level info' })
      .setTimestamp();

    const leftBtn = new ButtonBuilder()
      .setCustomId(`user-profile-left-${user.id}`)
      .setLabel('⬅️ Level Info')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const rightBtn = new ButtonBuilder()
      .setCustomId(`user-profile-right-${user.id}`)
      .setLabel('Message Stats ➡️')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(leftBtn, rightBtn);

    const reply = await interaction.reply({ 
      embeds: [levelEmbed], 
      components: [row], 
      fetchReply: true 
    });

    // Store profile state
    if (!client.userProfiles) client.userProfiles = new Map();
    client.userProfiles.set(reply.id, {
      userId: interaction.user.id,
      targetUser: user,
      currentPage: 0,
      embeds: [levelEmbed, messageEmbed],
      guildId: interaction.guild.id
    });

    // Clean up after 10 minutes
    setTimeout(() => {
      client.userProfiles.delete(reply.id);
    }, 600000);
  }
};

const addExpCommand = {
  name: 'add-experience',
  data: new SlashCommandBuilder()
    .setName('add-experience')
    .setDescription('Add experience points to a user (max 100,000)')
    .addUserOption(opt => opt.setName('user').setDescription('User to add EXP').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of EXP to add').setRequired(true).setMaxValue(MAX_EXP_ADJUST_AMOUNT).setMinValue(1)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    const data = getUserData(client, interaction.guild.id, user.id);
    const oldLevel = data.lvl;

    data.exp += amount;

    // Check for level ups
    while (data.exp >= expNeeded(data.lvl)) {
      data.exp -= expNeeded(data.lvl);
      data.lvl++;
    }

    updateUserData(client, interaction.guild.id, user.id, data.exp, data.lvl, data.messages);

    const embed = new EmbedBuilder()
      .setTitle('✅ Experience Added')
      .setDescription(`Added **${amount}** EXP to ${user}`)
      .addFields(
        { name: 'Previous Level', value: `${oldLevel}`, inline: true },
        { name: 'New Level', value: `${data.lvl}`, inline: true },
        { name: 'Current EXP', value: `${data.exp}`, inline: true }
      )
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const removeExpCommand = {
  name: 'remove-experience',
  data: new SlashCommandBuilder()
    .setName('remove-experience')
    .setDescription('Remove experience points from a user (max 100,000)')
    .addUserOption(opt => opt.setName('user').setDescription('User to remove EXP').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of EXP to remove').setRequired(true).setMaxValue(MAX_EXP_ADJUST_AMOUNT).setMinValue(1)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    const data = getUserData(client, interaction.guild.id, user.id);
    const oldLevel = data.lvl;

    data.exp = Math.max(0, data.exp - amount);

    // Recalculate level based on remaining EXP
    data.lvl = 0;
    let totalExp = data.exp;
    while (totalExp >= expNeeded(data.lvl)) {
      totalExp -= expNeeded(data.lvl);
      data.lvl++;
    }
    data.exp = totalExp;

    updateUserData(client, interaction.guild.id, user.id, data.exp, data.lvl, data.messages);

    const embed = new EmbedBuilder()
      .setTitle('✅ Experience Removed')
      .setDescription(`Removed **${amount}** EXP from ${user}`)
      .addFields(
        { name: 'Previous Level', value: `${oldLevel}`, inline: true },
        { name: 'New Level', value: `${data.lvl}`, inline: true },
        { name: 'Current EXP', value: `${data.exp}`, inline: true }
      )
      .setColor('#FF9900')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const resetExpCommand = {
  name: 'reset-experience',
  data: new SlashCommandBuilder()
    .setName('reset-experience')
    .setDescription('Reset experience of a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to reset').setRequired(true)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    resetUserData(client, interaction.guild.id, user.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Experience Reset')
      .setDescription(`Reset experience and level for ${user}`)
      .setColor('#FF0000')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const resetUserMessagesCommand = {
  name: 'reset-user-messages',
  data: new SlashCommandBuilder()
    .setName('reset-user-messages')
    .setDescription('Reset message count for a specific user')
    .addUserOption(opt => opt.setName('user').setDescription('User to reset messages for').setRequired(true)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    resetUserMessages(client, interaction.guild.id, user.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ User Messages Reset')
      .setDescription(`Reset message count for ${user} to 0`)
      .setColor('#FF9900')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const resetRoleMessagesCommand = {
  name: 'reset-role-messages',
  data: new SlashCommandBuilder()
    .setName('reset-role-messages')
    .setDescription('Reset message count for all users with a specific role')
    .addRoleOption(opt => opt.setName('role').setDescription('Role to reset messages for').setRequired(true)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const role = interaction.options.getRole('role');

    await interaction.deferReply();

    try {
      // Get all members with the specified role
      const members = role.members;
      let resetCount = 0;

      for (const [userId, member] of members) {
        resetUserMessages(client, interaction.guild.id, userId);
        resetCount++;
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Role Messages Reset')
        .setDescription(`Reset message count for **${resetCount}** users with the ${role} role`)
        .setColor('#FF9900')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error resetting role messages:', error);
      await interaction.editReply({ content: '❌ An error occurred while resetting role messages.' });
    }
  }
};

const setLevelUpChannelCommand = {
  name: 'set-levelup-channel',
  data: new SlashCommandBuilder()
    .setName('set-levelup-channel')
    .setDescription('Set channel to send level-up notifications')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send level-up messages').setRequired(true)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    setLevelUpMsgChannel(client, interaction.guild.id, channel.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Level-Up Channel Set')
      .setDescription(`Level-up notifications will be sent in ${channel}`)
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const autoAssignCommand = {
  name: 'auto-assign-roles',
  data: new SlashCommandBuilder()
    .setName('auto-assign-roles')
    .setDescription('Assign roles automatically by level or change existing assignments')
    .addIntegerOption(opt => opt.setName('level').setDescription('Level number').setRequired(true).setMinValue(1))
    .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true)),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    const level = interaction.options.getInteger('level');
    const role = interaction.options.getRole('role');

    addLevelRoleMapping(client, interaction.guild.id, level, role.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Auto-Role Assignment Set')
      .setDescription(`Users reaching **Level ${level}** will automatically get the ${role} role.`)
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const resetServerExpCommand = {
  name: 'reset-server-experience',
  data: new SlashCommandBuilder()
    .setName('reset-server-experience')
    .setDescription('Reset experience of all users in the server'),
  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      client.db.resetAllUsers(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Server Experience Reset')
        .setDescription('Reset experience for all users in this server.')
        .setColor('#FF0000')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error resetting server experience:', error);
      await interaction.editReply({ content: '❌ An error occurred while resetting server experience.' });
    }
  }
};

module.exports = {
  commands: [
    leaderboardCommand,
    addExpCommand,
    removeExpCommand,
    resetExpCommand,
    resetUserMessagesCommand,
    resetRoleMessagesCommand,
    setLevelUpChannelCommand,
    viewExpCommand,
    autoAssignCommand,
    resetServerExpCommand
  ],
  handleMessageForXp
};
