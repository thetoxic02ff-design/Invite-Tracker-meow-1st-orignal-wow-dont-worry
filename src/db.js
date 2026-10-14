const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add your PostgreSQL connection string to the environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', (err) => console.error('[database] Idle client error:', err.message));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invite_joins (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      inviter_id TEXT,
      invite_code TEXT,
      source TEXT NOT NULL DEFAULT 'unknown',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      UNIQUE (guild_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS invite_joins_guild_inviter_idx
      ON invite_joins (guild_id, inviter_id);
    CREATE INDEX IF NOT EXISTS invite_joins_guild_joined_idx
      ON invite_joins (guild_id, joined_at DESC);
  `);
  console.log('[database] PostgreSQL tables are ready.');
}

async function saveJoin({ guildId, memberId, inviterId, inviteCode, source }) {
  await pool.query(
    `INSERT INTO invite_joins (guild_id, member_id, inviter_id, invite_code, source, joined_at, left_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NULL)
     ON CONFLICT (guild_id, member_id) DO UPDATE SET
       inviter_id = EXCLUDED.inviter_id,
       invite_code = EXCLUDED.invite_code,
       source = EXCLUDED.source,
       joined_at = NOW(),
       left_at = NULL`,
    [guildId, memberId, inviterId || null, inviteCode || null, source || 'unknown']
  );
}

async function markLeft(guildId, memberId) {
  await pool.query(
    'UPDATE invite_joins SET left_at = NOW() WHERE guild_id = $1 AND member_id = $2 AND left_at IS NULL',
    [guildId, memberId]
  );
}

async function getInviteStats(guildId, userId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE left_at IS NULL)::int AS current_members,
       COUNT(*)::int AS total_joins,
       COUNT(*) FILTER (WHERE left_at IS NOT NULL)::int AS left_members
     FROM invite_joins
     WHERE guild_id = $1 AND inviter_id = $2`,
    [guildId, userId]
  );
  return rows[0] || { current_members: 0, total_joins: 0, left_members: 0 };
}

async function getLeaderboard(guildId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT inviter_id,
       COUNT(*) FILTER (WHERE left_at IS NULL)::int AS current_members,
       COUNT(*)::int AS total_joins,
       COUNT(*) FILTER (WHERE left_at IS NOT NULL)::int AS left_members
     FROM invite_joins
     WHERE guild_id = $1 AND inviter_id IS NOT NULL
     GROUP BY inviter_id
     ORDER BY COUNT(*) FILTER (WHERE left_at IS NULL) DESC, COUNT(*) DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return rows;
}

async function resetUserInvites(guildId, userId) {
  const result = await pool.query(
    'DELETE FROM invite_joins WHERE guild_id = $1 AND inviter_id = $2',
    [guildId, userId]
  );
  return result.rowCount;
}

module.exports = { pool, initDb, saveJoin, markLeft, getInviteStats, getLeaderboard, resetUserInvites };
