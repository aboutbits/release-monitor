# Installation

This guide covers self-hosting the Release Monitor Slack app. The app runs as a single process using Socket Mode (no public URL required) and persists state in a PostgreSQL database.

---

## Requirements

### Runtime

- [Docker](https://docs.docker.com/get-docker/) (any recent version)
- A PostgreSQL database (v16+)

### Slack app

You need to create a Slack app in your workspace:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App -> From an app manifest**.
2. Paste the contents of [`manifest.json`](./manifest.json) from this repository.
3. Install the app to your workspace.
4. Under **OAuth & Permissions**, copy the **Bot User OAuth Token** (`xoxb-…`).
5. Under **Basic Information -> App-Level Tokens**, create a token with the `connections:write` scope and copy it (`xapp-…`).

### Forges

#### GitHub

- Create a [fine-grained personal access token](https://github.com/settings/tokens?type=beta) (or a classic token with `repo` scope for private repos, `public_repo` for public-only).
- Required permission: **Contents: Read** (for private repos). Public-only repos work with no permissions set, the token is still recommended to avoid rate limits.
- Using a dedicated machine/bot account is recommended for organisations.
- Organisations can cap the maximum lifetime of fine-grained tokens. Keep the token's lifetime within the limit of every organisation you subscribe to, otherwise GitHub rejects it for all of that organisation's repos (public ones included). `/releases add` shows GitHub's reason when this happens.

---

## Setup

### 1. Configure environment variables

Copy [`.env.example`](./.env.example) to `.env` and fill in your values:

```sh
SLACK_BOT_TOKEN=xoxb-        # Bot token from Slack
SLACK_APP_TOKEN=xapp-        # App-level token for Socket Mode
GITHUB_TOKEN=github_pat_     # GitHub PAT with read access
DATABASE_URL=postgres://user:password@localhost/releases_db

# Optional
# POLL_CRON=0 * * * *        # How often to check releases (default: every hour)
# DIGEST_CRON=30 7 * * *     # When to send the periodic digest in UTC (default: 07:30 UTC)
# DATABASE_POOL_MAX=10       # Max connections in the DB connection pool (default: 10)
```

All tables are created in the `main` PostgreSQL schema. To use a different schema, change the hardcoded value in `src/db/schema.ts` and `drizzle.config.ts`, then regenerate and re-apply migrations.

### 2. Start the app

**docker run:**

```sh
docker run -d \
  --restart unless-stopped \
  --env-file .env \
  --name release-monitor-app \
  yourdockerhubuser/release-monitor-app:latest
```

Once running, invite the bot to a Slack channel with `/invite @Release Monitor` and use `/releases` to get started.

---

## Tips

**Socket Mode means no ingress rules.** The app connects outbound to Slack, you do not need to expose any port or configure a reverse proxy.

**Rate limits.** The GitHub token is used for polling; keep `POLL_CRON` at one hour or longer to stay well within GitHub's REST API rate limits (5 000 requests/hour for authenticated requests). With many subscribed repos you may need to increase the interval.
