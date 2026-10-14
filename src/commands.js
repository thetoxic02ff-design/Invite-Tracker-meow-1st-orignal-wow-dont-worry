const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure welcome and invite log channels (Administrator only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('welcome_channel').setDescription('Channel for new-member welcome messages').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(o => o.setName('invite_logs_channel').setDescription('Channel for invite tracking logs').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Administrator invite management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('add').setDescription('Add invites to a member').addUserOption(o => o.setName('member').setDescription('Member to update').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Number of invites to add').setMinValue(1).setMaxValue(100000).setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Optional reason').setMaxLength(300)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove invites from a member').addUserOption(o => o.setName('member').setDescription('Member to update').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Number of invites to remove').setMinValue(1).setMaxValue(100000).setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Optional reason').setMaxLength(300))),
  new SlashCommandBuilder().setName('invites').setDescription('Show your invite count').addUserOption(o => o.setName('member').setDescription('Member to check')),
  new SlashCommandBuilder().setName('invite-leaderboard').setDescription('Show the top inviters')
];
module.exports = commands.map(c => c.toJSON());
