const { SlashCommandBuilder } = require('discord.js');

const testCommand = {
  name: 'testcmd',
  data: new SlashCommandBuilder()
    .setName('testcmd')
    .setDescription('Test command'),
  async execute(interaction) {
    await interaction.reply('Test command works!');
  }
};

module.exports = {
  commands: [testCommand]
};
