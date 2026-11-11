import { describe, expect, it } from 'vitest'
import { compareNullableNumber } from '../lib/historySort'

describe('history optional-number sorting', () => {
  it('sorts null values last when ascending', () => {
    const rows = [null, 10, null, 5]
    rows.sort((a, b) => compareNullableNumber(a, b, 1))
    expect(rows).toEqual([5, 10, null, null])
  })

  it('sorts null values last when descending', () => {
    const rows = [null, 10, null, 5]
    rows.sort((a, b) => compareNullableNumber(a, b, -1))
    expect(rows).toEqual([10, 5, null, null])
  })

  it('keeps two nulls equal and two numbers ordered by direction', () => {
    expect(compareNullableNumber(null, null, -1)).toBe(0)
    expect(compareNullableNumber(5, 10, -1)).toBeGreaterThan(0)
  })
})
