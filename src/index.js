require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { initDb, saveJoin, markLeft, getInviteStats, getLeaderboard, resetUserInvites, pool } = require('./db');

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing. Add it to Railway Variables.');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites],
  partials: [Partials.GuildMember]
});

// Cache invite use counts so we can identify which invite was used on a join.
const inviteCache = new Map();
const cacheKey = guildId => guildId;

async function refreshGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(cacheKey(guild.id), new Map(invites.map(invite => [invite.code, invite.uses ?? 0])));
  } catch (error) {
    console.warn(`[invites] Cannot fetch invites for ${guild.name}. Give the bot Manage Server permission.`, error.message);
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`[ready] ${process.env.BOT_NAME || 'Invite Tracker'} logged in as ${readyClient.user.tag}`);
  await initDb();
  for (const guild of readyClient.guilds.cache.values()) await refreshGuildInvites(guild);
  console.log(`[ready] Tracking invites in ${readyClient.guilds.cache.size} server(s).`);
});

client.on(Events.GuildCreate, async guild => {
  await refreshGuildInvites(guild);
});

client.on(Events.InviteCreate, async invite => {
  if (!invite.guild) return;
  const key = cacheKey(invite.guild.id);
  if (!inviteCache.has(key)) inviteCache.set(key, new Map());
  inviteCache.get(key).set(invite.code, invite.uses ?? 0);
});

client.on(Events.InviteDelete, invite => {
  if (!invite.guild) return;
  inviteCache.get(cacheKey(invite.guild.id))?.delete(invite.code);
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const guild = member.guild;
    const oldUses = inviteCache.get(cacheKey(guild.id)) || new Map();
    const freshInvites = await guild.invites.fetch();
    let usedInvite = null;

    for (const invite of freshInvites.values()) {
      const previousUses = oldUses.get(invite.code) ?? 0;
      if ((invite.uses ?? 0) > previousUses) {
        usedInvite = invite;
        break;
      }
    }

    inviteCache.set(cacheKey(guild.id), new Map(freshInvites.map(invite => [invite.code, invite.uses ?? 0])));

    let inviterId = usedInvite?.inviter?.id || null;
    let source = usedInvite ? 'invite' : 'unknown';
    let inviteCode = usedInvite?.code || null;

    // Vanity URL use counts are not available through the normal invite collection.
    if (!usedInvite && guild.features.includes('VANITY_URL')) {
      try {
        const vanity = await guild.fetchVanityData();
        if (vanity?.code) {
          inviteCode = vanity.code;
          source = 'vanity';
        }
      } catch { /* Vanity tracking is optional. */ }
    }

    await saveJoin({ guildId: guild.id, memberId: member.id, inviterId, inviteCode, source });

    const who = inviterId ? `<@${inviterId}>` : source === 'vanity' ? 'the server vanity URL' : 'an unknown invite';
    console.log(`[join] ${member.user.tag} joined ${guild.name} via ${who}`);
  } catch (error) {
    console.error('[join] Failed to process member join:', error);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  try {
    await markLeft(member.guild.id, member.id);
  } catch (error) {
    console.error('[leave] Failed to update member record:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  try {
    if (interaction.commandName === 'invites') {
      const target = interaction.options.getUser('user') || interaction.user;
      const stats = await getInviteStats(interaction.guildId, target.id);
      const embed = new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle(`Invite stats — ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: '👥 Current members', value: String(stats.current_members), inline: true },
          { name: '📨 Total joins', value: String(stats.total_joins), inline: true },
          { name: '🚪 Left server', value: String(stats.left_members), inline: true }
        )
        .setFooter({ text: 'Invite Tracker • Stats are recorded after the bot starts tracking.' });
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === 'invite-leaderboard') {
      const rows = await getLeaderboard(interaction.guildId, 10);
      const description = rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.inviter_id}> — **${row.current_members}** current · ${row.total_joins} total`).join('\n')
        : 'No tracked invites yet. Invite tracking begins when the bot is online and can read server invites.';
      const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle('🏆 Invite Leaderboard').setDescription(description).setTimestamp();
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === 'invite-reset') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'You need **Manage Server** permission to reset invite stats.', ephemeral: true });
      }
      const target = interaction.options.getUser('user', true);
      const deleted = await resetUserInvites(interaction.guildId, target.id);
      return interaction.reply({ content: `Reset ${deleted} stored invite record(s) for <@${target.id}>.`, allowedMentions: { users: [] }, ephemeral: true });
    }
  } catch (error) {
    console.error(`[command:${interaction.commandName}]`, error);
    const reply = { content: 'Something went wrong while processing that command. Check the bot logs and database connection.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

process.on('SIGTERM', async () => {
  console.log('[shutdown] Closing database pool.');
  await pool.end().catch(() => {});
  client.destroy();
  process.exit(0);
});

client.login(token).catch(error => {
  console.error('[login] Discord login failed. Check DISCORD_TOKEN.', error);
  process.exit(1);
});
