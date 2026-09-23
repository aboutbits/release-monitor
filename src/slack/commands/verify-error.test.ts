import { describe, expect, test } from 'bun:test'
import { ForgeError } from '@forges/types'
import { formatVerifyError } from './verify-error'

describe('formatVerifyError', () => {
  test('token-rejected quotes the forge reason and links the org policy', () => {
    const text = formatVerifyError(
      new ForgeError(
        'token-rejected',
        403,
        'GitHub API error 403',
        "The 'aboutbits' organization forbids access",
      ),
      'github',
      'aboutbits',
      'react-ui',
    )

    expect(text).toContain('`aboutbits/react-ui`')
    expect(text).toContain(">The 'aboutbits' organization forbids access")
    expect(text).toContain(
      'https://github.com/organizations/aboutbits/settings/personal-access-tokens',
    )
  })

  test('token-rejected without a reason omits the quote', () => {
    const text = formatVerifyError(
      new ForgeError('token-rejected', 401, 'GitHub API error 401'),
      'github',
      'owner',
      'repo',
    )

    expect(text).not.toContain('>')
  })

  test('rate-limited', () => {
    const text = formatVerifyError(
      new ForgeError('rate-limited', 429, 'rate limited'),
      'github',
      'owner',
      'repo',
    )

    expect(text).toContain('rate limit')
  })

  test('not-found and unexpected errors keep the original message', () => {
    const expected =
      'Repository `owner/repo` not found or not accessible on github.'

    expect(
      formatVerifyError(
        new ForgeError('not-found', 404, 'not found'),
        'github',
        'owner',
        'repo',
      ),
    ).toBe(expected)
    expect(
      formatVerifyError(new Error('boom'), 'github', 'owner', 'repo'),
    ).toBe(expected)
  })
})
