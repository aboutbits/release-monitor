import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import * as client from './client'
import { pollGithubReleases } from './poller'
import type { GithubApiRelease } from './types'

// spyOn instead of mock.module: module mocks leak into other test files
// (client.test.ts needs the real githubFetch), spies can be restored.
const githubFetchMock = spyOn(client, 'githubFetch')

afterAll(() => {
  githubFetchMock.mockRestore()
})

function apiRelease(
  overrides: Partial<GithubApiRelease> = {},
): GithubApiRelease {
  return {
    id: 100,
    tag_name: 'v1.0.0',
    name: 'Release 1.0.0',
    html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    published_at: '2024-01-01T00:00:00Z',
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
      '/repos/owner/repo/releases?per_page=10',
      { 'If-None-Match': 'W/"abc"' },
    )
  })

  test('omits If-None-Match when no pollToken', async () => {
    githubFetchMock.mockResolvedValueOnce(jsonResponse([]))

    await pollGithubReleases('owner', 'repo', {})

    expect(githubFetchMock).toHaveBeenCalledWith(
      '/repos/owner/repo/releases?per_page=10',
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
    expect(result.maxKnownId).toBe('42')
  })
})

describe('pollGithubReleases - filtering', () => {
  test('filters prerelease and draft, but they still count toward maxKnownId', async () => {
    githubFetchMock.mockResolvedValueOnce(
      jsonResponse([
        apiRelease({
          id: 10,
          tag_name: 'v2.0.0-rc1',
          prerelease: true,
          published_at: '2024-03-01T00:00:00Z',
        }),
        apiRelease({
          id: 9,
          tag_name: 'v1.5.0',
          draft: true,
          published_at: '2024-02-15T00:00:00Z',
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
})
