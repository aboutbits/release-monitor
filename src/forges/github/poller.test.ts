/* eslint-disable import/order -- Bun's mock.module must be called before the mocked module is imported (hoisting requirement) */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const githubFetchMock = mock()

void mock.module('./client', () => ({
  githubFetch: githubFetchMock,
}))

import { pollGithubReleases } from './poller'
import type { GithubApiRelease } from './types'
/* eslint-enable import/order */

function apiRelease(
  overrides: Partial<GithubApiRelease> = {},
): GithubApiRelease {
  return {
    id: 100,
    tag_name: 'v1.0.0',
    name: 'Release 1.0.0',
    html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    published_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    body: '',
    draft: false,
    prerelease: false,
    ...overrides,
  }
}

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status: 200, headers })
}

beforeEach(() => {
  githubFetchMock.mockReset()
})

describe('pollGithubReleases - 304 not modified', () => {
  test('echoes lastKnownId and pollToken', async () => {
    githubFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    const result = await pollGithubReleases('owner', 'repo', {
      lastKnownId: '42',
      pollToken: 'W/"abc"',
    })

    expect(result.notModified).toBe(true)
    expect(result.releases).toEqual([])
    expect(result.knownReleases).toEqual([])
    expect(result.maxKnownId).toBe('42')
    expect(result.pollToken).toBe('W/"abc"')
  })

  test('maxKnownId is null when no lastKnownId provided', async () => {
    githubFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    const result = await pollGithubReleases('owner', 'repo', {})

    expect(result.notModified).toBe(true)
    expect(result.maxKnownId).toBe(null)
  })

  test('sends If-None-Match header when pollToken provided', async () => {
    githubFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    await pollGithubReleases('owner', 'repo', { pollToken: 'W/"abc"' })

    expect(githubFetchMock).toHaveBeenCalledWith(
      '/repos/owner/repo/releases?per_page=25',
      { 'If-None-Match': 'W/"abc"' },
    )
  })

  test('omits If-None-Match when no pollToken', async () => {
    githubFetchMock.mockResolvedValueOnce(jsonResponse([]))

    await pollGithubReleases('owner', 'repo', {})

    expect(githubFetchMock).toHaveBeenCalledWith(
      '/repos/owner/repo/releases?per_page=25',
      {},
    )
  })
})

describe('pollGithubReleases - 200 first poll', () => {
  test('returns all stable releases sorted by publishedAt desc', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse(
        [
          apiRelease({
            id: 1,
            tag_name: 'v1.0.0',
            published_at: '2024-01-01T00:00:00Z',
          }),
          apiRelease({
            id: 3,
            tag_name: 'v1.2.0',
            published_at: '2024-03-01T00:00:00Z',
          }),
          apiRelease({
            id: 2,
            tag_name: 'v1.1.0',
            published_at: '2024-02-01T00:00:00Z',
          }),
        ],
        { etag: 'W/"new"' },
      ),
    )

    const result = await pollGithubReleases('owner', 'repo', {})

    expect(result.notModified).toBe(false)
    expect(result.releases.map((r) => r.tagName)).toEqual([
      'v1.2.0',
      'v1.1.0',
      'v1.0.0',
    ])
    expect(result.maxKnownId).toBe('3')
    expect(result.pollToken).toBe('W/"new"')
  })

  test('empty page on fresh repo returns null maxKnownId', async () => {
    githubFetchMock.mockResolvedValueOnce(jsonResponse([]))

    const result = await pollGithubReleases('owner', 'repo', {})

    expect(result.releases).toEqual([])
    expect(result.maxKnownId).toBe(null)
    expect(result.notModified).toBe(false)
  })

  test('maps GitHub fields to ForgeRelease shape', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({
          id: 42,
          tag_name: 'v2.0.0',
          name: 'Major release',
          html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
          published_at: '2024-05-01T12:00:00Z',
          updated_at: '2024-05-01T12:30:00Z',
          body: 'Release notes',
        }),
      ]),
    )

    const result = await pollGithubReleases('owner', 'repo', {})

    expect(result.releases[0]).toEqual({
      id: '42',
      tagName: 'v2.0.0',
      name: 'Major release',
      url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
      publishedAt: '2024-05-01T12:00:00Z',
      updatedAt: '2024-05-01T12:30:00Z',
      body: 'Release notes',
      isDraft: false,
      isPrerelease: false,
    })
  })
})

describe('pollGithubReleases - 200 with lastKnownId', () => {
  test('returns only releases newer than lastKnownId', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({
          id: 50,
          tag_name: 'v2.0.0',
          published_at: '2024-03-01T00:00:00Z',
        }),
        apiRelease({
          id: 42,
          tag_name: 'v1.5.0',
          published_at: '2024-02-01T00:00:00Z',
        }),
        apiRelease({
          id: 30,
          tag_name: 'v1.0.0',
          published_at: '2024-01-01T00:00:00Z',
        }),
      ]),
    )

    const result = await pollGithubReleases('owner', 'repo', {
      lastKnownId: '42',
    })

    expect(result.releases.map((r) => r.tagName)).toEqual(['v2.0.0'])
    expect(result.knownReleases.map((r) => r.tagName)).toEqual([
      'v1.5.0',
      'v1.0.0',
    ])
    expect(result.maxKnownId).toBe('50')
  })

  test('all releases ≤ lastKnownId echoes lastKnownId', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({ id: 40, published_at: '2024-01-01T00:00:00Z' }),
        apiRelease({ id: 35, published_at: '2023-12-01T00:00:00Z' }),
      ]),
    )

    const result = await pollGithubReleases('owner', 'repo', {
      lastKnownId: '42',
    })

    expect(result.releases).toEqual([])
    expect(result.knownReleases.map((r) => r.id)).toEqual(['40', '35'])
    expect(result.maxKnownId).toBe('42')
  })

  test('maps updated_at null to updatedAt null', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([apiRelease({ id: 42, updated_at: null })]),
    )

    const result = await pollGithubReleases('owner', 'repo', {
      lastKnownId: '42',
    })

    expect(result.knownReleases[0]?.updatedAt).toBe(null)
  })
})

describe('pollGithubReleases - release notes edited after publish', () => {
  // keycloak/keycloak 26.7.5: published with empty notes at 17:44:19Z, the
  // notes with the CVE fixes were added at 18:11:25Z.
  const keycloak = {
    id: 400263044,
    tag_name: '26.7.5',
    name: '26.7.5',
    published_at: '2026-09-30T17:44:19Z',
  }

  test('returns the release as new first, then as known with the edited notes', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse(
        [apiRelease({ ...keycloak, updated_at: '2026-09-30T17:44:19Z' })],
        { etag: 'W/"first"' },
      ),
    )

    const first = await pollGithubReleases('keycloak', 'keycloak', {
      lastKnownId: '400000000',
    })

    expect(first.releases.map((r) => r.body)).toEqual([''])
    expect(first.knownReleases).toEqual([])
    expect(first.maxKnownId).toBe('400263044')

    githubFetchMock.mockResolvedValueOnce(
      jsonResponse(
        [
          apiRelease({
            ...keycloak,
            updated_at: '2026-09-30T18:11:25Z',
            body: '<h3>Security fixes</h3>\n[CVE-2026-16103] Incomplete fix',
          }),
        ],
        { etag: 'W/"second"' },
      ),
    )

    const second = await pollGithubReleases('keycloak', 'keycloak', {
      lastKnownId: first.maxKnownId ?? undefined,
      pollToken: first.pollToken,
    })

    expect(second.releases).toEqual([])
    expect(second.knownReleases).toHaveLength(1)
    expect(second.knownReleases[0]?.updatedAt).toBe('2026-09-30T18:11:25Z')
    expect(second.knownReleases[0]?.body).toContain('CVE-2026-16103')
    expect(second.maxKnownId).toBe('400263044')
  })
})

describe('pollGithubReleases - filtering', () => {
  test('filters prerelease and draft, only the prerelease counts toward maxKnownId', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({
          id: 11,
          tag_name: 'v2.0.0',
          draft: true,
          published_at: null,
        }),
        apiRelease({
          id: 10,
          tag_name: 'v2.0.0-rc1',
          prerelease: true,
          published_at: '2024-03-01T00:00:00Z',
        }),
        apiRelease({
          id: 8,
          tag_name: 'v1.4.0',
          published_at: '2024-02-01T00:00:00Z',
        }),
      ]),
    )

    const result = await pollGithubReleases('owner', 'repo', {})

    expect(result.releases.map((r) => r.tagName)).toEqual(['v1.4.0'])
    expect(result.maxKnownId).toBe('10')
  })

  test('known prerelease and draft are not returned as known releases', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({ id: 10, tag_name: 'v2.0.0-rc1', prerelease: true }),
        apiRelease({
          id: 9,
          tag_name: 'v1.5.0',
          draft: true,
          published_at: null,
        }),
        apiRelease({ id: 8, tag_name: 'v1.4.0' }),
      ]),
    )

    const result = await pollGithubReleases('owner', 'repo', {
      lastKnownId: '10',
    })

    expect(result.knownReleases.map((r) => r.tagName)).toEqual(['v1.4.0'])
  })

  test('a draft is ignored, and it is new when it is published later', async () => {
    // GitHub returns drafts with published_at: null to tokens with write
    // access. A draft keeps its ID when it is published.
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({
          id: 50,
          tag_name: 'v2.0.0',
          draft: true,
          published_at: null,
        }),
        apiRelease({ id: 40, tag_name: 'v1.9.0' }),
      ]),
    )

    const first = await pollGithubReleases('owner', 'repo', {})

    expect(first.releases.map((r) => r.tagName)).toEqual(['v1.9.0'])
    expect(first.maxKnownId).toBe('40')

    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({
          id: 50,
          tag_name: 'v2.0.0',
          published_at: '2024-06-01T00:00:00Z',
        }),
        apiRelease({ id: 40, tag_name: 'v1.9.0' }),
      ]),
    )

    const second = await pollGithubReleases('owner', 'repo', {
      lastKnownId: first.maxKnownId ?? undefined,
    })

    expect(second.releases.map((r) => r.tagName)).toEqual(['v2.0.0'])
    expect(second.maxKnownId).toBe('50')
  })
})
