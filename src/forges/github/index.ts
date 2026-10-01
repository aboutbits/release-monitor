import { fetchLatestStableRelease, verifyRepository } from './api'
import { pollGithubReleases } from './poller'
import type { Forge } from '@forges/types'

export const githubForge: Forge = {
  name: 'github',
  displayName: 'GitHub',
  getRepositoryUrl: (owner, repo) => `https://github.com/${owner}/${repo}`,
  verifyRepository,
  fetchLatestStableRelease,
  pollReleases: pollGithubReleases,
}
