require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

async function main() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('Missing DISCORD_TOKEN or CLIENT_ID environment variable; slash commands were not registered.');
    process.exitCode = 1;
    return;
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`Registered ${commands.length} slash commands to guild ${GUILD_ID}.`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`Registered ${commands.length} global slash commands. Global commands can take time to appear.`);
    }
  } catch (err) {
    console.error('Could not register slash commands:', err?.rawError?.message || err.message);
    console.error('Check CLIENT_ID, DISCORD_TOKEN, GUILD_ID, and confirm the bot is invited to that server with applications.commands scope.');
    process.exitCode = 1;
  }
}
main();
