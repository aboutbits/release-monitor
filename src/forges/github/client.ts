import { ForgeError, type ForgeErrorKind } from '@forges/types'

const BASE = 'https://api.github.com'

const defaultHeaders = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

function isRateLimited(res: Response): boolean {
  return (
    res.status === 429 ||
    (res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.has('retry-after')))
  )
}

function errorKind(res: Response): ForgeErrorKind {
  if (isRateLimited(res)) {
    return 'rate-limited'
  }

  // 401: expired or revoked token. 403: token blocked by an org policy, e.g.
  // a maximum fine-grained PAT lifetime or SAML SSO enforcement.
  if (res.status === 401 || res.status === 403) {
    return 'token-rejected'
  }

  return res.status === 404 ? 'not-found' : 'unknown'
}

/** GitHub has no machine-readable error codes here, so we only surface the message. */
async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown }
    return typeof body.message === 'string' ? body.message : undefined
  } catch {
    return undefined
  }
}

export async function githubFetch(
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...defaultHeaders, ...extraHeaders },
  })

  if (res.ok || res.status === 304) {
    return res
  }

  const reason = await readErrorMessage(res)
  throw new ForgeError(
    errorKind(res),
    res.status,
    `GitHub API error ${res.status} for ${path}${reason ? `: ${reason}` : ''}`,
    reason,
  )
}
