import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import type { ForgeRelease, PollResult } from '@forges/types'

// Integration tests against a real PostgreSQL database. They run only when
// TEST_DATABASE_URL is set, and they delete all data in that database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

type SentMessage = { channel: string; text: string; blocks: unknown[] }
const sent: SentMessage[] = []
void mock.module('@bot/send', () => ({
  sendBlocks: (channel: string, text: string, blocks: unknown[]) => {
    sent.push({ channel, text, blocks })
    return Promise.resolve(true)
  },
}))

let pollResult: PollResult
void mock.module('@forges/registry', () => ({
  getForge: () => ({ pollReleases: () => Promise.resolve(pollResult) }),
}))

const HOUR_MS = 60 * 60 * 1000
const CVE_BODY =
  '<h3>Security fixes</h3><li>[CVE-2026-16103] Incomplete fix</li>'

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString()
}

function forgeRelease(overrides: Partial<ForgeRelease> = {}): ForgeRelease {
  const publishedAt = overrides.publishedAt ?? hoursAgo(1)
  return {
    id: '100',
    tagName: 'v1.0.0',
    name: 'v1.0.0',
    url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    publishedAt,
    updatedAt: publishedAt,
    body: '',
    isDraft: false,
    isPrerelease: false,
    ...overrides,
  }
}

function pollWith(result: Partial<PollResult>): void {
  pollResult = {
    releases: [],
    knownReleases: [],
    pollToken: 'W/"etag"',
    notModified: false,
    maxKnownId: '100',
    ...result,
  }
}

describe.skipIf(!TEST_DATABASE_URL)('runPollJob (PostgreSQL)', () => {
  let db: typeof import('@db/client').db
  let schema: typeof import('@db/schema')
  let runPollJob: typeof import('@jobs/poll').runPollJob

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL ?? '')
    if (!url.pathname.includes('test')) {
      throw new Error(
        `TEST_DATABASE_URL must point to a test database, got "${url.pathname}"`,
      )
    }
    // @db/client reads DATABASE_URL when it is imported.
    process.env.DATABASE_URL = url.href
    ;({ db } = await import('@db/client'))
    schema = await import('@db/schema')
    ;({ runPollJob } = await import('@jobs/poll'))

    const { sql } = await import('drizzle-orm')
    const { migrate } = await import('drizzle-orm/bun-sql/migrator')
    await db.execute(
      sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schema.DB_SCHEMA}"`),
    )
    await migrate(db, {
      migrationsFolder: './drizzle',
      migrationsSchema: schema.DB_SCHEMA,
    })
  })

  beforeEach(async () => {
    const { sql } = await import('drizzle-orm')
    await db.execute(
      sql.raw(
        `TRUNCATE "${schema.DB_SCHEMA}".notifications, "${schema.DB_SCHEMA}".releases, "${schema.DB_SCHEMA}".subscriptions, "${schema.DB_SCHEMA}".repositories RESTART IDENTITY CASCADE`,
      ),
    )
    sent.length = 0
  })

  afterAll(async () => {
    await db.$client.close()
  })

  async function insertRepository(lastKnownReleaseId: string | null) {
    const [repo] = await db
      .insert(schema.repositories)
      .values({
        forge: 'github',
        owner: 'owner',
        repo: 'repo',
        lastKnownReleaseId,
      })
      .returning()
    if (!repo) {
      throw new Error('repository not inserted')
    }
    return repo
  }

  async function subscribe(
    repositoryId: bigint,
    channelId: string,
    notificationMode: string,
  ) {
    await db.insert(schema.subscriptions).values({
      repositoryId,
      channelId,
      notificationMode,
      subscribedBy: 'U1',
      subscribedAt: new Date(Date.now() - 100 * HOUR_MS),
    })
  }

  async function insertStoredRelease(
    repositoryId: bigint,
    release: ForgeRelease,
  ) {
    const [row] = await db
      .insert(schema.releases)
      .values({
        repositoryId,
        forgeReleaseId: release.id,
        tagName: release.tagName,
        name: release.name,
        url: release.url,
        publishedAt: new Date(release.publishedAt),
        updatedAt: release.updatedAt ? new Date(release.updatedAt) : null,
      })
      .returning()
    if (!row) {
      throw new Error('release not inserted')
    }
    return row
  }

  async function notificationsOf(releaseId: bigint) {
    const rows = await db.select().from(schema.notifications)
    return rows
      .filter((n) => n.releaseId === releaseId)
      .map((n) => `${n.channelId}:${n.kind}`)
      .sort()
  }

  test('a new release goes only to immediate-mode channels', async () => {
    const repo = await insertRepository(null)
    await subscribe(repo.id, 'C_DIGEST', 'digest')
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    pollWith({ releases: [forgeRelease()] })

    await runPollJob()

    expect(sent.map((m) => m.channel)).toEqual(['C_IMMEDIATE'])
    expect(sent[0]?.text).toContain(':package: New release')
    const [stored] = await db.select().from(schema.releases)
    expect(stored?.isSecurity).toBe(false)
    const [updatedRepo] = await db.select().from(schema.repositories)
    expect(updatedRepo?.lastKnownReleaseId).toBe('100')
    expect(updatedRepo?.pollToken).toBe('W/"etag"')
  })

  test('several new releases are posted oldest first', async () => {
    const repo = await insertRepository(null)
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    // The poller returns the releases newest first.
    pollWith({
      releases: [
        forgeRelease({
          id: '101',
          tagName: 'v1.2.1',
          publishedAt: hoursAgo(1),
        }),
        forgeRelease({
          id: '100',
          tagName: 'v1.2.0',
          publishedAt: hoursAgo(2),
        }),
      ],
      maxKnownId: '101',
    })

    await runPollJob()

    expect(sent.map((m) => m.text)).toEqual([
      ':package: New release: owner/repo v1.2.0',
      ':package: New release: owner/repo v1.2.1',
    ])
  })

  test('a new security release goes to every channel', async () => {
    const repo = await insertRepository(null)
    await subscribe(repo.id, 'C_DIGEST', 'digest')
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    await subscribe(repo.id, 'C_SECURITY', 'security-only')
    pollWith({ releases: [forgeRelease({ body: CVE_BODY })] })

    await runPollJob()

    expect(sent.map((m) => m.channel).sort()).toEqual([
      'C_DIGEST',
      'C_IMMEDIATE',
      'C_SECURITY',
    ])
    expect(sent.every((m) => m.text.includes(':lock: Security release'))).toBe(
      true,
    )
    const [stored] = await db.select().from(schema.releases)
    expect(stored?.isSecurity).toBe(true)
  })

  test('a 304 response changes nothing', async () => {
    const repo = await insertRepository('100')
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    pollWith({ notModified: true })

    await runPollJob()

    expect(sent).toEqual([])
    const [unchangedRepo] = await db.select().from(schema.repositories)
    expect(unchangedRepo?.lastCheckedAt).toBe(null)
  })

  test('releases that become security releases are posted oldest first', async () => {
    const repo = await insertRepository('100')
    await subscribe(repo.id, 'C_DIGEST', 'digest')
    // forge_release_id is text, so '100' sorts before '99'. Without an ORDER
    // BY, the database returns the newer release first. Same case as
    // keycloak 26.8.0 and 26.7.5.
    const newer = forgeRelease({
      id: '100',
      tagName: '26.8.0',
      publishedAt: hoursAgo(2),
    })
    const older = forgeRelease({
      id: '99',
      tagName: '26.7.5',
      publishedAt: hoursAgo(3),
    })
    await insertStoredRelease(repo.id, newer)
    await insertStoredRelease(repo.id, older)
    const edited = (r: ForgeRelease) => ({
      ...r,
      body: CVE_BODY,
      updatedAt: hoursAgo(1),
    })
    pollWith({ knownReleases: [edited(newer), edited(older)] })

    await runPollJob()

    expect(sent.map((m) => m.text)).toEqual([
      ':lock: Security release: owner/repo 26.7.5',
      ':lock: Security release: owner/repo 26.8.0',
    ])
  })

  test('notes edited after publish send the security alert once', async () => {
    const repo = await insertRepository('100')
    await subscribe(repo.id, 'C_DIGEST', 'digest')
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    const published = forgeRelease()
    const stored = await insertStoredRelease(repo.id, published)
    await db.insert(schema.notifications).values({
      releaseId: stored.id,
      channelId: 'C_IMMEDIATE',
      kind: 'immediate',
    })
    const edited = { ...published, body: CVE_BODY, updatedAt: hoursAgo(0.5) }
    pollWith({ knownReleases: [edited] })

    await runPollJob()

    expect(sent.map((m) => m.channel).sort()).toEqual([
      'C_DIGEST',
      'C_IMMEDIATE',
    ])
    expect(JSON.stringify(sent[0]?.blocks)).toContain(
      'updated after the release was published',
    )
    expect(await notificationsOf(stored.id)).toEqual([
      'C_DIGEST:security',
      'C_IMMEDIATE:immediate',
      'C_IMMEDIATE:security',
    ])

    await runPollJob()

    expect(sent).toHaveLength(2)
  })

  test('a known release without a new edit time is not classified again', async () => {
    const repo = await insertRepository('100')
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    const published = forgeRelease()
    await insertStoredRelease(repo.id, published)
    pollWith({ knownReleases: [{ ...published, body: CVE_BODY }] })

    await runPollJob()

    expect(sent).toEqual([])
    const [row] = await db.select().from(schema.releases)
    expect(row?.isSecurity).toBe(false)
  })

  test('a known release outside the re-check window is ignored', async () => {
    const repo = await insertRepository('100')
    await subscribe(repo.id, 'C_IMMEDIATE', 'immediately')
    const published = forgeRelease({ publishedAt: hoursAgo(100) })
    await insertStoredRelease(repo.id, published)
    pollWith({
      knownReleases: [{ ...published, body: CVE_BODY, updatedAt: hoursAgo(1) }],
    })

    await runPollJob()

    expect(sent).toEqual([])
  })
})
