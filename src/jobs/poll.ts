import { and, eq, inArray } from 'drizzle-orm'
import { buildReleaseBlocks } from '@bot/blocks/release'
import { buildSecurityBlocks } from '@bot/blocks/security'
import { sendBlocks } from '@bot/send'
import { checkSecurityRelease } from '@classify/security'
import { db } from '@db/client'
import {
  type Release,
  type Repository,
  type Subscription,
  notifications,
  releases,
  repositories,
  subscriptions,
} from '@db/schema'
import { getForge } from '@forges/registry'
import { isRecheckDue } from '@jobs/recheck'
import { toDate } from '@utils/date'
import { positiveInt } from '@utils/env'
import type { ForgeRelease } from '@forges/types'

const CHUNK_SIZE = 5
const SECURITY_RECHECK_HOURS = positiveInt('SECURITY_RECHECK_HOURS', 72)
const NOTES_EDITED_NOTE =
  ':pencil2: The release notes were updated after the release was published.'

export async function runPollJob(): Promise<void> {
  const allRepos = await db.select().from(repositories)
  console.log(`Poll started for ${allRepos.length} repos`)

  for (let i = 0; i < allRepos.length; i += CHUNK_SIZE) {
    const chunk = allRepos.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map((repo) =>
        pollOne(repo).catch((err: unknown) => {
          console.error(
            `Poll failed for ${repo.forge}/${repo.owner}/${repo.repo}:`,
            err,
          )
        }),
      ),
    )
  }
}

async function pollOne(repo: Repository): Promise<void> {
  const label = `${repo.forge}/${repo.owner}/${repo.repo}`
  const forge = getForge(repo.forge)

  // --- fetch ---
  const {
    releases: newReleases,
    knownReleases,
    pollToken,
    notModified,
    maxKnownId,
  } = await forge.pollReleases(repo.owner, repo.repo, {
    lastKnownId: repo.lastKnownReleaseId ?? undefined,
    pollToken: repo.pollToken ?? undefined,
  })

  if (notModified) {
    console.log(`[${label}] Not modified (pollToken hit)`)
    return
  }

  console.log(`[${label}] Found ${newReleases.length} new stable release(s)`)

  // --- persist, classify & notify ---
  const repoSubscriptions = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.repositoryId, repo.id))

  // The forge returns the releases newest first. Post them oldest first, so
  // that Slack shows them in the order they were published.
  const oldestFirst = newReleases.toSorted((a, b) =>
    Temporal.Instant.compare(
      Temporal.Instant.from(a.publishedAt),
      Temporal.Instant.from(b.publishedAt),
    ),
  )

  for (const forgeRelease of oldestFirst) {
    const { isSecurity, score, reasons } = checkSecurityRelease({
      tagName: forgeRelease.tagName,
      name: forgeRelease.name,
      body: forgeRelease.body,
      isDraft: forgeRelease.isDraft,
      isPrerelease: forgeRelease.isPrerelease,
    })

    const [inserted] = await db
      .insert(releases)
      .values({
        repositoryId: repo.id,
        forgeReleaseId: forgeRelease.id,
        tagName: forgeRelease.tagName,
        name: forgeRelease.name,
        url: forgeRelease.url,
        publishedAt: new Date(forgeRelease.publishedAt),
        updatedAt: toDate(forgeRelease.updatedAt),
        isSecurity,
        securityScore: score,
        securityReasons: reasons,
      })
      .onConflictDoNothing()
      .returning()

    if (!inserted) {
      console.log(`[${label}] ${forgeRelease.tagName} already in DB, skipping`)
      continue
    }

    if (isSecurity) {
      // Security releases bypass notificationMode and go to every subscriber
      // immediately, including digest-mode ones. The digest job filters them
      // back out (isSecurity = false), so digest subscribers get the security
      // ping now and no duplicate in tomorrow's digest.
      await sendToChannels(
        repo,
        inserted,
        repoSubscriptions,
        'security',
        reasons,
      )
    } else {
      const immediate = repoSubscriptions.filter(
        (s) => s.notificationMode === 'immediately',
      )
      if (immediate.length > 0) {
        await sendToChannels(repo, inserted, immediate, 'immediate')
      }
    }
  }

  // --- re-check known releases ---
  await recheckKnownReleases(repo, knownReleases, repoSubscriptions)

  // --- update state ---
  await db
    .update(repositories)
    .set({
      lastCheckedAt: new Date(),
      pollToken: pollToken ?? repo.pollToken,
      lastKnownReleaseId: maxKnownId,
    })
    .where(eq(repositories.id, repo.id))
}

/**
 * Classifies known releases in the re-check window again when the forge
 * reports an edit. A release that becomes a security release gets the
 * security notification for every subscriber, the same as a new one.
 */
async function recheckKnownReleases(
  repo: Repository,
  knownReleases: ForgeRelease[],
  repoSubscriptions: Subscription[],
): Promise<void> {
  const label = `${repo.forge}/${repo.owner}/${repo.repo}`
  const cutoff = Temporal.Now.instant().subtract({
    hours: SECURITY_RECHECK_HOURS,
  })
  const candidates = knownReleases.filter((r) => {
    const publishedAt = Temporal.Instant.from(r.publishedAt)
    return Temporal.Instant.compare(publishedAt, cutoff) > 0
  })
  if (candidates.length === 0) {
    return
  }

  const storedReleases = await db
    .select()
    .from(releases)
    .where(
      and(
        eq(releases.repositoryId, repo.id),
        inArray(
          releases.forgeReleaseId,
          candidates.map((r) => r.id),
        ),
        eq(releases.isSecurity, false),
      ),
    )

  for (const stored of storedReleases) {
    const forgeRelease = candidates.find((r) => r.id === stored.forgeReleaseId)
    if (!forgeRelease || !isRecheckDue(stored, forgeRelease, cutoff)) {
      continue
    }

    const { isSecurity, score, reasons } = checkSecurityRelease({
      tagName: forgeRelease.tagName,
      name: forgeRelease.name,
      body: forgeRelease.body,
      isDraft: forgeRelease.isDraft,
      isPrerelease: forgeRelease.isPrerelease,
    })

    // The isSecurity = false guard lets only one poll flip the flag, so the
    // security notification goes out once. A release is never downgraded.
    const [updated] = await db
      .update(releases)
      .set({
        name: forgeRelease.name,
        updatedAt: toDate(forgeRelease.updatedAt),
        isSecurity,
        securityScore: score,
        securityReasons: reasons,
      })
      .where(and(eq(releases.id, stored.id), eq(releases.isSecurity, false)))
      .returning()

    if (!updated || !isSecurity) {
      continue
    }

    console.log(
      `[${label}] ${updated.tagName} became a security release after its notes were edited`,
    )
    await sendToChannels(
      repo,
      updated,
      repoSubscriptions,
      'security',
      reasons,
      NOTES_EDITED_NOTE,
    )
  }
}

async function sendToChannels(
  repo: Repository,
  release: Release,
  targets: Subscription[],
  kind: 'security' | 'immediate',
  reasons: string[] = [],
  note?: string,
): Promise<void> {
  const label = `${repo.forge}/${repo.owner}/${repo.repo}`
  const isSecurity = kind === 'security'

  console.log(
    `[${label}] Sending ${kind} notification for ${release.tagName} to ${targets.length} channel(s)`,
  )

  const blocks = isSecurity
    ? buildSecurityBlocks(repo, release, reasons, note)
    : buildReleaseBlocks(repo, release)
  const text = isSecurity
    ? `:lock: Security release: ${repo.owner}/${repo.repo} ${release.tagName}`
    : `:package: New release: ${repo.owner}/${repo.repo} ${release.tagName}`

  await Promise.all(
    targets.map(async (sub) => {
      const sent = await sendBlocks(sub.channelId, text, blocks)
      if (sent) {
        await db
          .insert(notifications)
          .values({
            releaseId: release.id,
            channelId: sub.channelId,
            kind,
          })
          .onConflictDoNothing()
      } else {
        console.warn(
          `[${label}] Failed to send ${kind} notification to channel ${sub.channelId}`,
        )
      }
    }),
  )
}
