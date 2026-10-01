import { describe, expect, test } from 'bun:test'
import { checkSecurityRelease } from '@classify/security'
import { isRecheckDue } from './recheck'

const cutoff = new Date('2026-09-28T00:00:00Z')

function stored(overrides: Partial<Parameters<typeof isRecheckDue>[0]> = {}) {
  return {
    publishedAt: new Date('2026-09-30T17:44:19Z'),
    updatedAt: new Date('2026-09-30T17:44:19Z'),
    isSecurity: false,
    ...overrides,
  }
}

describe('isRecheckDue', () => {
  test('due when the forge reports a newer edit', () => {
    expect(
      isRecheckDue(stored(), { updatedAt: '2026-09-30T18:11:25Z' }, cutoff),
    ).toBe(true)
  })

  test('not due when the edit time is unchanged', () => {
    expect(
      isRecheckDue(stored(), { updatedAt: '2026-09-30T17:44:19Z' }, cutoff),
    ).toBe(false)
  })

  test('not due for a release that is already a security release', () => {
    expect(
      isRecheckDue(
        stored({ isSecurity: true }),
        { updatedAt: '2026-09-30T18:11:25Z' },
        cutoff,
      ),
    ).toBe(false)
  })

  test('not due for a release published before the cutoff', () => {
    expect(
      isRecheckDue(
        stored({ publishedAt: new Date('2026-09-27T23:59:59Z') }),
        { updatedAt: '2026-09-30T18:11:25Z' },
        cutoff,
      ),
    ).toBe(false)
  })

  test('due when the stored row has no edit time (rows from before the migration)', () => {
    expect(
      isRecheckDue(
        stored({ updatedAt: null }),
        { updatedAt: '2026-09-30T17:44:19Z' },
        cutoff,
      ),
    ).toBe(true)
  })

  test('due when the forge has no edit time', () => {
    expect(isRecheckDue(stored(), { updatedAt: null }, cutoff)).toBe(true)
  })
})

describe('keycloak 26.7.5 sequence', () => {
  const release = {
    tagName: '26.7.5',
    name: '26.7.5',
    isDraft: false,
    isPrerelease: false,
  }

  test('empty notes at publish are not a security release, edited notes are', () => {
    expect(checkSecurityRelease({ ...release, body: '' }).isSecurity).toBe(
      false,
    )

    const edited = checkSecurityRelease({
      ...release,
      body: [
        '<h3>Security fixes</h3>',
        '<ul>',
        '<li>#50996 [CVE-2026-16103] Incomplete fix for CVE-2026-9798</li>',
        '</ul>',
      ].join('\n'),
    })
    expect(edited.isSecurity).toBe(true)
    expect(edited.reasons).toContain('Contains CVE identifier')
  })
})
