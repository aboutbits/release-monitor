import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { ForgeError } from '@forges/types'
import { githubFetch } from './client'

const LIFETIME_POLICY_MESSAGE =
  "The 'aboutbits' organization forbids access via a fine-grained personal access tokens if the token's lifetime is greater than 366 days. Please adjust your token's lifetime at the following URL: https://github.com/settings/personal-access-tokens/14948016"

function errorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      message,
      documentation_url:
        'https://docs.github.com/rest/repos/repos#get-a-repository',
      status: String(status),
    }),
    { status, headers },
  )
}

const fetchSpy = spyOn(globalThis, 'fetch')

afterEach(() => {
  fetchSpy.mockReset()
})

function requestHeaders(call: number): Record<string, string> {
  const init = fetchSpy.mock.calls[call]?.[1]
  return (init?.headers ?? {}) as Record<string, string>
}

async function catchForgeError(promise: Promise<unknown>): Promise<ForgeError> {
  const err = await promise.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ForgeError)
  return err as ForgeError
}

describe('githubFetch - success', () => {
  test('returns 200 responses from the authenticated request', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const res = await githubFetch('/repos/owner/repo')

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(requestHeaders(0).Authorization).toStartWith('Bearer ')
  })

  test('returns 304 responses without throwing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 304 }))

    const res = await githubFetch('/repos/owner/repo/releases', {
      'If-None-Match': 'W/"abc"',
    })

    expect(res.status).toBe(304)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('githubFetch - token rejected', () => {
  for (const [status, message] of [
    [403, LIFETIME_POLICY_MESSAGE],
    [401, 'Bad credentials'],
  ] as const) {
    test(`${status}: throws token-rejected with GitHub's reason, without retrying`, async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(status, message))

      const err = await catchForgeError(
        githubFetch('/repos/aboutbits/release-monitor'),
      )

      expect(err.kind).toBe('token-rejected')
      expect(err.status).toBe(status)
      expect(err.forgeMessage).toBe(message)
      // Surfaced in poll job logs, which only print the error.
      expect(err.message).toContain(message)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  }

  test('tolerates a non-JSON error body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>', { status: 403 }))

    const err = await catchForgeError(githubFetch('/repos/owner/repo'))

    expect(err.kind).toBe('token-rejected')
    expect(err.forgeMessage).toBeUndefined()
    expect(err.message).toBe('GitHub API error 403 for /repos/owner/repo')
  })
})

describe('githubFetch - other errors', () => {
  test('403 with exhausted rate limit is not retried', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(403, 'API rate limit exceeded', {
        'x-ratelimit-remaining': '0',
      }),
    )

    const err = await catchForgeError(githubFetch('/repos/owner/repo'))

    expect(err.kind).toBe('rate-limited')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  test('429 is rate-limited', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(429, 'Too many requests', { 'retry-after': '60' }),
    )

    const err = await catchForgeError(githubFetch('/repos/owner/repo'))

    expect(err.kind).toBe('rate-limited')
  })

  test('404 with a working token is not-found and not retried', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404, 'Not Found'))

    const err = await catchForgeError(githubFetch('/repos/owner/missing'))

    expect(err.kind).toBe('not-found')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  test('5xx is unknown', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(502, 'Bad Gateway'))

    const err = await catchForgeError(githubFetch('/repos/owner/repo'))

    expect(err.kind).toBe('unknown')
    expect(err.status).toBe(502)
  })
})
