# Release Monitor

A Slack bot that monitors repositories for new releases and posts updates to your channels.

- **Periodic digest** - one message per channel per configured interval, grouped by repo
- **Immediate notifications** - get notified right away for every new stable release
- **Instant security alerts** - security releases are posted immediately to all subscribers regardless of their notification mode, also when the security notes are added to a release after it was published
- **Per-channel subscriptions** - each channel manages its own list independently

## Commands

| Command | Description |
|---|---|
| `/releases add github owner/repo [mode]` | Subscribe this channel to a repository |
| `/releases remove github owner/repo` | Unsubscribe this channel |
| `/releases modify mode github owner/repo <mode>` | Change the notification mode of an existing subscription |
| `/releases list` | Show all subscriptions in this channel |

### Notification modes

| Mode | Behaviour |
|---|---|
| `digest` | Batched into the periodic digest _(default)_ |
| `immediately` | Posted as soon as a new stable release is discovered |
| `security-only` | Only security releases are posted immediately; others are skipped entirely |

## Installation

See [installation.md](./installation.md) for a full setup guide.

## Development

### Requirements

- [Bun](https://bun.sh/docs/installation) 1.4.x, the same minor version as the `oven/bun:1.4-alpine` Docker image. The app needs 1.4 or later for the native `Temporal` API.
- A PostgreSQL database (v16+), for example with `docker compose up -d` (see [`compose.yaml`](./compose.yaml)).

### Setup

Dev dependencies are hosted on GitHub Packages. Create an `.npmrc` with a [GitHub PAT](https://github.com/settings/tokens) that has the `read:packages` scope:

```
@aboutbits:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

```bash
bun install
bun run dev          # hot reload
bun test             # run tests
bun run db:generate  # generate migrations after schema changes
bun run db:migrate   # apply migrations manually
```

The tests of the poll job (`src/jobs/poll.test.ts`) need a PostgreSQL database and run only when `TEST_DATABASE_URL` is set. They delete all data in that database, so they refuse to run when the database name does not contain `test`:

```bash
docker compose up -d
docker compose exec db createdb -U root release_monitor_test
TEST_DATABASE_URL=postgres://root:password@localhost:5432/release_monitor_test bun test
```

Migrations are also applied automatically on startup, so `db:migrate` is only needed when running outside of the app (e.g. to inspect the schema before starting).

All tables live in the `main` PostgreSQL schema (hardcoded in [`src/db/schema.ts`](./src/db/schema.ts) and [`drizzle.config.ts`](./drizzle.config.ts)). The `public` schema is intentionally avoided: it is on every role's default search_path and has historically been a namespace-pollution and privilege-escalation vector. To use a different schema, change the string in both files and regenerate the migrations with `bun run db:generate`.

## Deployment

The app ships as a Docker image. Migrations run automatically on startup.

```bash
docker run -d \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/aboutbits/release-monitor:latest
```
