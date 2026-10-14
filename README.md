# Joraba Invite Tracker Bot

Discord.js v14 + PostgreSQL, ready for Railway. Includes `/setup`, `/invite add`, `/invite remove`, `/invites`, and `/invite-leaderboard`.

## 1. Discord Developer Portal
1. Open https://discord.com/developers/applications and select your bot application.
2. Under **Bot**, enable **Server Members Intent**. This is required to track member joins.
3. Invite the bot to your server with the `bot` and `applications.commands` scopes. Grant **View Channels**, **Send Messages**, and **Manage Server** (Manage Guild) so invite codes can be fetched. Do not share your bot token.

## 2. Railway
1. Push these files to your GitHub repository.
2. In Railway, add a PostgreSQL database and make its `DATABASE_URL` available to the bot service.
3. Add service variables: `DISCORD_TOKEN`, `CLIENT_ID`, `DATABASE_URL`, and optionally `GUILD_ID` and `PGSSL`.
4. `CLIENT_ID` is the Application ID in Developer Portal. `GUILD_ID` is your Discord server ID; using it registers commands quickly to that server.
5. Start command: `npm start`. The `prestart` script registers slash commands before starting the bot.

If your PostgreSQL service provides SSL, leave `PGSSL=true` (default). If your database explicitly requires no SSL, set `PGSSL=false`.

## 3. Commands
- `/setup welcome_channel:#welcome invite_logs_channel:#invite-logs` — administrator only; saves channel IDs in PostgreSQL.
- `/invite add member:@user amount:3 reason:...` — administrator only.
- `/invite remove member:@user amount:1 reason:...` — administrator only; cannot make a count negative.
- `/invites [member]` — view tracked count.
- `/invite-leaderboard` — show top 10 tracked inviters.

## Notes
- The bot must have permission to view/send messages in both configured channels.
- Invite attribution can be unavailable for vanity URLs, expired/deleted invites, or if Discord does not return invite usage data.
- The bot uses the `GuildMembers` and `GuildInvites` gateway intents. `GuildMembers` must be enabled in the Developer Portal.
- If command registration returns `Missing Access`, verify `CLIENT_ID`, `GUILD_ID`, and that this exact application/bot is invited to that server with `applications.commands` scope.
