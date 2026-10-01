import { describe, expect, test } from 'bun:test'
import { ForgeError } from '@forges/types'
import { formatVerifyError } from './verify-error'

describe('formatVerifyError', () => {
  test('token-rejected quotes the forge reason and shows the forge hint', () => {
    const text = formatVerifyError(
      new ForgeError('token-rejected', 403, 'GitHub API error 403', {
        forgeMessage: "The 'aboutbits' organization forbids access",
        hint: 'Check the org policy: https://example.com/policy',
      }),
      'GitHub',
      'aboutbits',
      'react-ui',
    )

    expect(text).toBe(
      "GitHub rejected the Release Monitor's access token for `aboutbits/react-ui`.\n" +
        ">The 'aboutbits' organization forbids access\n" +
        'Ask an admin to update the token.\n' +
        'Check the org policy: https://example.com/policy',
    )
  })

  test('token-rejected without a reason or hint omits both', () => {
    const text = formatVerifyError(
      new ForgeError('token-rejected', 401, 'GitHub API error 401'),
      'GitHub',
      'owner',
      'repo',
    )

    expect(text).toBe(
      "GitHub rejected the Release Monitor's access token for `owner/repo`.\n" +
        'Ask an admin to update the token.',
    )
  })

  test('rate-limited', () => {
    const text = formatVerifyError(
      new ForgeError('rate-limited', 429, 'rate limited'),
      'GitHub',
      'owner',
      'repo',
    )

    expect(text).toBe('GitHub rate limit reached, please try again later.')
  })

  test('not-found and unexpected errors keep the original message', () => {
    const expected =
      'Repository `owner/repo` not found or not accessible on GitHub.'

    expect(
      formatVerifyError(
        new ForgeError('not-found', 404, 'not found'),
        'GitHub',
        'owner',
        'repo',
      ),
    ).toBe(expected)
    expect(
      formatVerifyError(new Error('boom'), 'GitHub', 'owner', 'repo'),
    ).toBe(expected)
  })
})
