import { describe, expect, test } from 'bun:test'
import { toDate } from './date'

describe('toDate', () => {
  test('converts an ISO timestamp to a Date', () => {
    expect(toDate('2026-09-30T18:11:25Z')).toEqual(
      new Date('2026-09-30T18:11:25Z'),
    )
  })

  test('returns null for null', () => {
    expect(toDate(null)).toBe(null)
  })
})
