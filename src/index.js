require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Pool } = require('pg');

const { DISCORD_TOKEN, DATABASE_URL, PGSSL } = process.env;
if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN environment variable.');
if (!DATABASE_URL) throw new Error('Missing DATABASE_URL. Add a Railway PostgreSQL database and its DATABASE_URL variable.');

const pool = new Pool({ connectionString: DATABASE_URL, ssl: PGSSL === 'false' ? false : { rejectUnauthorized: false } });
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites] });
const inviteCache = new Map();

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY, welcome_channel_id TEXT, invite_logs_channel_id TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS invite_counts (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, count BIGINT NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (guild_id, user_id)
  )`);
}
async function getSettings(guildId) {
  const r = await pool.query('SELECT * FROM guild_settings WHERE guild_id=$1', [guildId]);
  return r.rows[0] || null;
}
async function getCount(guildId, userId) {
  const r = await pool.query('SELECT count FROM invite_counts WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  return Number(r.rows[0]?.count || 0);
}
async function setCount(guildId, userId, count) {
  await pool.query(`INSERT INTO invite_counts (guild_id,user_id,count) VALUES ($1,$2,$3)
    ON CONFLICT (guild_id,user_id) DO UPDATE SET count=EXCLUDED.count`, [guildId, userId, count]);
}
async function addCount(guildId, userId, amount) {
  await pool.query(`INSERT INTO invite_counts (guild_id,user_id,count) VALUES ($1,$2,$3)
    ON CONFLICT (guild_id,user_id) DO UPDATE SET count=invite_counts.count + EXCLUDED.count`, [guildId, userId, amount]);
}
async function sendToChannel(guild, channelId, payload) {
  if (!channelId) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) return false;
  const me = guild.members.me;
  if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) return false;
  await channel.send(payload).catch(err => console.error(`Could not send message to channel ${channelId}:`, err.message));
  return true;
}
async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses ?? 0])));
  } catch (e) {
    console.warn(`Could not fetch invites in ${guild.name}. Ensure the bot has Manage Guild permission.`, e.message);
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  await initDb();
  for (const guild of readyClient.guilds.cache.values()) await cacheGuildInvites(guild);
});
client.on(Events.GuildCreate, guild => cacheGuildInvites(guild));
client.on(Events.InviteCreate, invite => {
  const current = inviteCache.get(invite.guild.id) || new Map();
  current.set(invite.code, invite.uses ?? 0);
  inviteCache.set(invite.guild.id, current);
});
client.on(Events.InviteDelete, invite => {
  const current = inviteCache.get(invite.guild.id);
  if (current) current.delete(invite.code);
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const settings = await getSettings(member.guild.id);
    const oldInvites = inviteCache.get(member.guild.id) || new Map();
    let usedInvite = null;
    try {
      const freshInvites = await member.guild.invites.fetch();
      for (const invite of freshInvites.values()) {
        const oldUses = oldInvites.get(invite.code) ?? 0;
        if ((invite.uses ?? 0) > oldUses) { usedInvite = invite; break; }
      }
      inviteCache.set(member.guild.id, new Map(freshInvites.map(inv => [inv.code, inv.uses ?? 0])));
    } catch (e) { console.warn('Invite attribution unavailable:', e.message); }

    if (usedInvite?.inviter && !usedInvite.inviter.bot) await addCount(member.guild.id, usedInvite.inviter.id, 1);
    const welcomeText = `Welcome ${member} to **${member.guild.name}**! You are member **#${member.guild.memberCount}**. 🎉`;
    if (settings?.welcome_channel_id) await sendToChannel(member.guild, settings.welcome_channel_id, { content: welcomeText });
    if (settings?.invite_logs_channel_id) {
      const who = usedInvite?.inviter ? `${usedInvite.inviter.tag} (${usedInvite.inviter.id})` : 'Unknown (vanity, expired, or invite cache unavailable)';
      await sendToChannel(member.guild, settings.invite_logs_channel_id, { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Member Joined').setDescription(`${member.user.tag} joined the server.\nInvited by: ${who}\nInvite code: ${usedInvite?.code || 'Unknown'}`).setTimestamp()] });
    }
  } catch (e) { console.error('Join tracking error:', e); }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Use this command inside a server.', ephemeral: true });
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (['setup', 'invite'].includes(interaction.commandName) && !isAdmin) {
      return interaction.reply({ content: '❌ Only server administrators can use this command.', ephemeral: true });
    }
    if (interaction.commandName === 'setup') {
      const welcome = interaction.options.getChannel('welcome_channel', true);
      const logs = interaction.options.getChannel('invite_logs_channel', true);
      const me = interaction.guild.members.me;
      for (const ch of [welcome, logs]) {
        if (!ch.isTextBased() || !ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) {
          return interaction.reply({ content: `I need **View Channel** and **Send Messages** permissions in ${ch}.`, ephemeral: true });
        }
      }
      await pool.query(`INSERT INTO guild_settings (guild_id,welcome_channel_id,invite_logs_channel_id) VALUES ($1,$2,$3)
        ON CONFLICT (guild_id) DO UPDATE SET welcome_channel_id=EXCLUDED.welcome_channel_id, invite_logs_channel_id=EXCLUDED.invite_logs_channel_id`, [interaction.guildId, welcome.id, logs.id]);
      return interaction.reply({ content: `✅ Setup saved!\nWelcome channel: ${welcome}\nInvite logs: ${logs}`, ephemeral: true });
    }
    if (interaction.commandName === 'invite') {
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser('member', true);
      const amount = interaction.options.getInteger('amount', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const current = await getCount(interaction.guildId, user.id);
      if (sub === 'add') await setCount(interaction.guildId, user.id, current + amount);
      else if (sub === 'remove') {
        if (amount > current) return interaction.reply({ content: `❌ ${user.tag} has only ${current} tracked invite(s); cannot remove ${amount}.`, ephemeral: true });
        await setCount(interaction.guildId, user.id, current - amount);
      }
      const updated = await getCount(interaction.guildId, user.id);
      const settings = await getSettings(interaction.guildId);
      const action = sub === 'add' ? 'Added' : 'Removed';
      const embed = new EmbedBuilder().setColor(sub === 'add' ? 0x57F287 : 0xED4245).setTitle(`Invite Count ${action}`).addFields(
        { name: 'Member', value: `${user.tag} (${user.id})` }, { name: 'Change', value: `${sub === 'add' ? '+' : '-'}${amount}`, inline: true },
        { name: 'New total', value: String(updated), inline: true }, { name: 'Moderator', value: `${interaction.user.tag}` }, { name: 'Reason', value: reason }
      ).setTimestamp();
      if (settings?.invite_logs_channel_id) await sendToChannel(interaction.guild, settings.invite_logs_channel_id, { embeds: [embed] });
      return interaction.reply({ content: `✅ ${action} ${amount} invite(s) for ${user}. New total: **${updated}**.`, ephemeral: true });
    }
    if (interaction.commandName === 'invites') {
      const user = interaction.options.getUser('member') || interaction.user;
      const count = await getCount(interaction.guildId, user.id);
      return interaction.reply({ content: `🎟️ **${user.tag}** has **${count}** tracked invite(s).`, ephemeral: true });
    }
    if (interaction.commandName === 'invite-leaderboard') {
      const r = await pool.query('SELECT user_id,count FROM invite_counts WHERE guild_id=$1 AND count>0 ORDER BY count DESC LIMIT 10', [interaction.guildId]);
      const lines = r.rows.map((row, i) => `**${i + 1}.** <@${row.user_id}> — **${row.count}** invite(s)`);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏆 Invite Leaderboard').setDescription(lines.join('\n') || 'No tracked invites yet.').setTimestamp()], ephemeral: false });
    }
  } catch (e) {
    console.error('Command error:', e);
    const message = { content: 'Something went wrong. Check Railway logs and ensure database/channel permissions are configured.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(message).catch(() => {});
    else await interaction.reply(message).catch(() => {});
  }
});

client.on('error', e => console.error('Discord client error:', e));
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));
(async () => {
  await initDb();
  await client.login(DISCORD_TOKEN).catch(err => {
    console.error('[login] Discord login failed. Check DISCORD_TOKEN and enable required intents in Developer Portal > Bot. Error:', err.message);
    process.exit(1);
  });
})();
