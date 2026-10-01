import { classifyRelease } from '@classify/stable'
import { sortByPublishedAt, toForgeRelease } from './api'
import { githubFetch } from './client'
import type { GithubApiRelease } from './types'
import type { ForgeRelease, PollResult } from '@forges/types'

const RELEASES_PER_PAGE = 25

export async function pollGithubReleases(
  owner: string,
  repo: string,
  opts: { lastKnownId?: string; pollToken?: string },
): Promise<PollResult> {
  const extraHeaders: Record<string, string> = {}
  if (opts.pollToken) {
    extraHeaders['If-None-Match'] = opts.pollToken
  }

  const response = await githubFetch(
    `/repos/${owner}/${repo}/releases?per_page=${RELEASES_PER_PAGE}`,
    extraHeaders,
  )

  if (response.status === 304) {
    return {
      releases: [],
      knownReleases: [],
      pollToken: opts.pollToken,
      notModified: true,
      maxKnownId: opts.lastKnownId ?? null,
    }
  }

  const pollToken = response.headers.get('etag') ?? undefined
  const remaining = response.headers.get('x-ratelimit-remaining')
  if (remaining !== null && parseInt(remaining, 10) < 500) {
    console.warn(`GitHub rate limit low: ${remaining} requests remaining`)
  }

  const data = (await response.json()) as GithubApiRelease[]
  const releases: ForgeRelease[] = []
  const knownReleases: ForgeRelease[] = []
  const lastKnownBigInt = opts.lastKnownId ? BigInt(opts.lastKnownId) : null
  let maxSeenBigInt = lastKnownBigInt ?? 0n

  for (const r of sortByPublishedAt(data)) {
    const id = BigInt(r.id)
    const isKnown = lastKnownBigInt !== null && id <= lastKnownBigInt

    if (!isKnown && id > maxSeenBigInt) {
      maxSeenBigInt = id
    }

    const release = toForgeRelease(r)
    const { stable } = classifyRelease({
      tagName: release.tagName,
      name: release.name,
      body: release.body,
      isDraft: release.isDraft,
      isPrerelease: release.isPrerelease,
    })

    if (!stable) {
      continue
    }

    if (isKnown) {
      knownReleases.push(release)
    } else {
      releases.push(release)
    }
  }

  const maxKnownId = maxSeenBigInt > 0n ? String(maxSeenBigInt) : null
  return { releases, knownReleases, pollToken, notModified: false, maxKnownId }
}
