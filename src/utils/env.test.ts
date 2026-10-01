import { afterEach, describe, expect, test } from 'bun:test'
import { timeZone } from './env'

const original = process.env.CRON_TZ

afterEach(() => {
  if (original === undefined) {
    delete process.env.CRON_TZ
  } else {
    process.env.CRON_TZ = original
  }
})

describe('timeZone', () => {
  test('returns the default when the variable is not set', () => {
    delete process.env.CRON_TZ
    expect(timeZone('CRON_TZ', 'UTC')).toBe('UTC')
  })

  test('returns the default when the variable is empty', () => {
    process.env.CRON_TZ = ''
    expect(timeZone('CRON_TZ', 'UTC')).toBe('UTC')
  })

  test('returns a valid IANA time zone', () => {
    process.env.CRON_TZ = 'Europe/Rome'
    expect(timeZone('CRON_TZ', 'UTC')).toBe('Europe/Rome')
  })

  test('throws for a UTC offset, which Bun.cron does not accept', () => {
    process.env.CRON_TZ = '+01:00'
    expect(() => timeZone('CRON_TZ', 'UTC')).toThrow(
      'CRON_TZ must be an IANA time zone, for example "Europe/Rome", got "+01:00"',
    )
  })

  test('throws for an invalid time zone', () => {
    process.env.CRON_TZ = 'Invalid/Zone'
    expect(() => timeZone('CRON_TZ', 'UTC')).toThrow(
      'CRON_TZ must be an IANA time zone, for example "Europe/Rome", got "Invalid/Zone"',
    )
  })
})
