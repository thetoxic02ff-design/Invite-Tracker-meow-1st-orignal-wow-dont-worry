# Joraba Invite Tracker

A Discord invite-tracking bot built with Discord.js v14 and PostgreSQL. The repository is designed for GitHub + Railway.

## Features

- `/invites` — show your tracked current members, total joins, and members who later left.
- `/invites user:@member` — view another member's stats.
- `/invite-leaderboard` — top 10 inviters by current tracked members.
- `/invite-reset user:@member` — delete that member's tracked invite records (Manage Server permission required).
- PostgreSQL storage survives redeploys/restarts.
- Tracks regular invite codes when the bot can compare invite use counts.
- Attempts to record vanity URL joins as `vanity` source, but cannot attribute them to a person.

## 1. Create the Discord bot

1. Open the Discord Developer Portal and create an application.
2. Open **Bot** and create/reset the bot token. Keep it private.
3. In **Bot → Privileged Gateway Intents**, enable **Server Members Intent**.
4. Invite the bot to your server with `bot` and `applications.commands` scopes. Give it **View Channels**, **Send Messages**, **Embed Links**, and **Manage Server** permission so it can fetch invite usage. Only grant permissions it actually needs.
5. Copy the Application ID from **General Information**.

## 2. Upload to GitHub

1. Create a new GitHub repository.
2. Upload the files in this folder (do not upload a real `.env` file or bot token).
3. Keep `.env.example` as the safe template.

## 3. Deploy on Railway

1. In Railway, create a project and add a **PostgreSQL** database service.
2. Add a new service from your GitHub repository.
3. In the bot service's **Variables**, add:
   - `DISCORD_TOKEN` — your bot token
   - `CLIENT_ID` — your Discord Application ID
   - `DATABASE_URL` — use Railway's variable reference: `${{Postgres.DATABASE_URL}}` (replace `Postgres` with the exact name of your database service if different)
   - `PGSSL` — `false` for the normal private Railway connection
   - Optional `GUILD_ID` — your test server ID to register commands quickly
   - Optional `BOT_NAME` — e.g. `Joraba Invite Tracker`
4. Railway should detect Node.js and run `npm start` from `package.json`. The `prestart` script automatically registers the slash commands before the bot starts.
5. Ensure the database and bot service are in the same Railway project/environment so the private database reference works.

## 4. Slash command registration

The `prestart` script automatically runs `npm run deploy-commands` before `npm start`, so Railway registers the slash commands during startup. If you want to register them manually, run `npm run deploy-commands` after setting `DISCORD_TOKEN`, `CLIENT_ID`, and optionally `GUILD_ID`.

If `GUILD_ID` is set, commands register to that server quickly. If it is blank, commands register globally and may take longer to appear.

## 5. Discord server permissions / limitations

- The bot must be online to observe joins and compare invite-use counts. It cannot reconstruct reliable historical invite attribution for joins that happened before tracking began.
- Enable **Server Members Intent** in the Developer Portal and in the code (already enabled here).
- Discord invite fetching can fail if the bot lacks **Manage Server** permission. If this permission is not granted, joins may be recorded as `unknown` rather than attributed to an inviter.
- If multiple people join at almost exactly the same time, Discord's invite-use counters may make attribution ambiguous. Check logs if counts look unexpected.
- Vanity URL joins cannot be assigned to a specific inviter; they are recorded without an inviter ID.
- This bot records invite attribution and member join/leave status only. It does not scrape private messages or collect message content.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `DISCORD_TOKEN` | Yes | Bot token (secret) |
| `CLIENT_ID` | Yes | Discord application ID |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GUILD_ID` | No | Test server for fast command registration |
| `PGSSL` | No | Set `true` only if your DB endpoint requires TLS |
| `BOT_NAME` | No | Friendly name in logs |

## Local development

```bash
npm install
cp .env.example .env
# Fill in .env with your own credentials
npm run deploy-commands
npm start
```

Never commit `.env`, Discord tokens, or database credentials to GitHub. If a token is exposed, reset it in the Discord Developer Portal immediately.
