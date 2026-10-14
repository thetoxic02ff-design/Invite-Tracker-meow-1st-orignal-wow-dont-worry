require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Show how many members you have invited.')
    .addUserOption(option => option.setName('user').setDescription('Check another member').setRequired(false)),
  new SlashCommandBuilder()
    .setName('invite-leaderboard')
    .setDescription('Show the top inviters in this server.'),
  new SlashCommandBuilder()
    .setName('invite-reset')
    .setDescription('Reset a member’s stored invite stats (server managers only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option => option.setName('user').setDescription('Member whose stats will be reset').setRequired(true))
].map(command => command.toJSON());

async function main() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    throw new Error('DISCORD_TOKEN and CLIENT_ID must be set before deploying slash commands.');
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands ${GUILD_ID ? `to guild ${GUILD_ID}` : 'globally'}.`);
}

main().catch(error => {
  console.error('Could not register slash commands:', error);
  process.exitCode = 1;
});
