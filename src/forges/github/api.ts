import { classifyRelease } from '@classify/stable'
import { githubFetch } from './client'
import type { GithubApiRelease } from './types'
import type { ForgeRelease } from '@forges/types'

/** A release that is not a draft, so it has a publish time. */
export type PublishedGithubRelease = GithubApiRelease & { published_at: string }

export function toForgeRelease(r: PublishedGithubRelease): ForgeRelease {
  return {
    id: String(r.id),
    tagName: r.tag_name,
    name: r.name ?? null,
    url: r.html_url,
    publishedAt: r.published_at,
    updatedAt: r.updated_at ?? null,
    body: r.body ?? '',
    isDraft: r.draft,
    isPrerelease: r.prerelease,
  }
}

/**
 * Returns the published releases, newest first. Drafts are left out: they have
 * no publish time, and a draft keeps its ID when it is published later, so it
 * must not count as known before that.
 */
export function publishedNewestFirst(
  releases: GithubApiRelease[],
): PublishedGithubRelease[] {
  return releases
    .filter((r): r is PublishedGithubRelease => r.published_at !== null)
    .sort((a, b) =>
      Temporal.Instant.compare(
        Temporal.Instant.from(b.published_at),
        Temporal.Instant.from(a.published_at),
      ),
    )
}

export async function verifyRepository(
  owner: string,
  repo: string,
): Promise<void> {
  await githubFetch(`/repos/${owner}/${repo}`)
}

/** Returns the newest stable release, or null if there are none. */
export async function fetchLatestStableRelease(
  owner: string,
  repo: string,
): Promise<ForgeRelease | null> {
  const res = await githubFetch(`/repos/${owner}/${repo}/releases?per_page=10`)
  const data = (await res.json()) as GithubApiRelease[]

  for (const r of publishedNewestFirst(data)) {
    const release = toForgeRelease(r)
    const { stable } = classifyRelease({
      tagName: release.tagName,
      name: release.name,
      body: release.body,
      isDraft: release.isDraft,
      isPrerelease: release.isPrerelease,
    })
    if (stable) {
      return release
    }
  }

  return null
}
