import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { app } from '@bot/app'
import '@bot/commands/index'
import { db } from '@db/client'
import { DB_SCHEMA } from '@db/schema'
import { runDigestJob } from '@jobs/digest'
import { runPollJob } from '@jobs/poll'
import { CRON_TZ } from '@jobs/schedule'

await migrate(db, {
  migrationsFolder: './drizzle',
  migrationsSchema: DB_SCHEMA,
})
console.log('Migrations applied')

const POLL_CRON = process.env.POLL_CRON ?? '0 * * * *' // every hour
const DIGEST_CRON = process.env.DIGEST_CRON ?? '30 7 * * *' // 07:30 in CRON_TZ

const pollCron = Bun.cron(
  POLL_CRON,
  async () => {
    console.log('Poll job - started')
    await runPollJob().catch((err: unknown) => {
      console.error('Poll job - error:', err)
    })
    console.log('Poll job - finished')
  },
  { tz: CRON_TZ },
)

const digestCron = Bun.cron(
  DIGEST_CRON,
  async () => {
    console.log('Digest job - started')
    await runDigestJob().catch((err: unknown) => {
      console.error('Digest job - error:', err)
    })
    console.log('Digest job - finished')
  },
  { tz: CRON_TZ },
)

await app.start()
console.log('Bolt app started (socket mode)')

pollCron.ref()
digestCron.ref()
console.log(
  `Poll cron: ${POLL_CRON} - Digest cron: ${DIGEST_CRON} - Time zone: ${CRON_TZ}`,
)

process.on('SIGTERM', () => {
  void shutdown()
})
process.on('SIGINT', () => {
  void shutdown()
})

async function shutdown() {
  console.log('Shutting down...')
  pollCron.unref()
  digestCron.unref()
  await app.stop()
  process.exit(0)
}
