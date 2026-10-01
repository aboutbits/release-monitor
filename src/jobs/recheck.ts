import type { Release } from '@db/schema'
import type { ForgeRelease } from '@forges/types'

/**
 * Returns true when a stored release must be classified again, because its
 * notes can have changed after publish. Some maintainers publish with empty
 * notes and add the security fixes some minutes later.
 *
 * A release is due when it is not a security release yet, is published after
 * `cutoff`, and the forge reports an edit since the last check. When either
 * side has no edit time, the release is due, because classification is cheap.
 */
export function isRecheckDue(
  stored: Pick<Release, 'publishedAt' | 'updatedAt' | 'isSecurity'>,
  forgeRelease: Pick<ForgeRelease, 'updatedAt'>,
  cutoff: Temporal.Instant,
): boolean {
  const publishedAt = stored.publishedAt.toTemporalInstant()
  if (stored.isSecurity || Temporal.Instant.compare(publishedAt, cutoff) <= 0) {
    return false
  }

  if (!stored.updatedAt || !forgeRelease.updatedAt) {
    return true
  }

  return !Temporal.Instant.from(forgeRelease.updatedAt).equals(
    stored.updatedAt.toTemporalInstant(),
  )
}
