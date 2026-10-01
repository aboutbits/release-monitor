import { and, eq } from 'drizzle-orm'
import { checkSecurityRelease } from '@classify/security'
import { db } from '@db/client'
import { type Repository, releases, repositories } from '@db/schema'
import type { Forge } from './types'

/** Registers a repository for tracking and stores a baseline release. Idempotent. */
export async function trackRepository(
  forge: Forge,
  owner: string,
  name: string,
): Promise<Repository> {
  const [existing] = await db
    .select()
    .from(repositories)
    .where(
      and(
        eq(repositories.forge, forge.name),
        eq(repositories.owner, owner),
        eq(repositories.repo, name),
      ),
    )
    .limit(1)

  if (existing) {
    return existing
  }

  const [repo] = await db
    .insert(repositories)
    .values({
      forge: forge.name,
      owner,
      repo: name,
      url: forge.getRepositoryUrl(owner, name),
    })
    .returning()

  if (!repo) {
    throw new Error(`Failed to insert repository ${owner}/${name}`)
  }

  const latest = await forge.fetchLatestStableRelease(owner, name)
  if (latest) {
    const { isSecurity, score, reasons } = checkSecurityRelease({
      tagName: latest.tagName,
      name: latest.name,
      body: latest.body,
      isDraft: latest.isDraft,
      isPrerelease: latest.isPrerelease,
    })

    await db.insert(releases).values({
      repositoryId: repo.id,
      forgeReleaseId: latest.id,
      tagName: latest.tagName,
      name: latest.name,
      url: latest.url,
      publishedAt: new Date(latest.publishedAt),
      updatedAt: latest.updatedAt ? new Date(latest.updatedAt) : null,
      isSecurity,
      securityScore: score,
      securityReasons: reasons,
    })

    await db
      .update(repositories)
      .set({ lastKnownReleaseId: latest.id })
      .where(eq(repositories.id, repo.id))
  }

  return repo
}
