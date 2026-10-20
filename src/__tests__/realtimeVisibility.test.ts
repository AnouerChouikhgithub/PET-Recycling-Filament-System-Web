/**
 * Realtime polling lifecycle (BUGS-TO-FIX F12).
 *
 * The dashboard polls every 10 s. A hidden tab used to keep polling (wasted
 * requests) and, worse, showed stale numbers when the user came back. These
 * tests pin the contract: no work while hidden, an IMMEDIATE refresh on show,
 * and the normal cadence while visible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { dashboard } = vi.hoisted(() => ({ dashboard: vi.fn() }))

vi.mock('../api/machines', () => ({ machinesApi: { dashboard } }))

import { realtimeService } from '../realtime/realtimeService'

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: hidden ? 'hidden' : 'visible',
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('realtimeService polling vs tab visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    dashboard.mockResolvedValue({ telemetry: null })
    setHidden(false)
  })

  afterEach(() => {
    realtimeService.unsubscribe()
    vi.useRealTimers()
  })

  it('refreshes immediately and then every 10s while the tab is visible', async () => {
    realtimeService.subscribeToMachine('m-visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(dashboard).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(dashboard).toHaveBeenCalledTimes(2)
  })

  it('does no work while hidden and refreshes the moment the tab is shown again', async () => {
    setHidden(true)
    realtimeService.subscribeToMachine('m-hidden')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(dashboard).not.toHaveBeenCalled()

    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(dashboard).toHaveBeenCalledTimes(1)

    setHidden(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(dashboard).toHaveBeenCalledTimes(1)
  })

  it('resumes the 10s cadence after the tab is shown again', async () => {
    realtimeService.subscribeToMachine('m-cycle')
    await vi.advanceTimersByTimeAsync(0)

    setHidden(true)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(dashboard).toHaveBeenCalledTimes(2) // initial + immediate refresh on return

    await vi.advanceTimersByTimeAsync(10_000)
    expect(dashboard).toHaveBeenCalledTimes(3)
  })
})
