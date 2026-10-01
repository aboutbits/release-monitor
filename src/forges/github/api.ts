import { classifyRelease } from '@classify/stable'
import { githubFetch } from './client'
import type { GithubApiRelease } from './types'
import type { ForgeRelease } from '@forges/types'

export function toForgeRelease(r: GithubApiRelease): ForgeRelease {
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

export function sortByPublishedAt(
  releases: GithubApiRelease[],
): GithubApiRelease[] {
  return [...releases].sort(
    (a, b) =>
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
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

  for (const r of sortByPublishedAt(data)) {
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
