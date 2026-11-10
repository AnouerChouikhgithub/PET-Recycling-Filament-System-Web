import { describe, expect, it } from 'vitest'
import { commandDeliveryMessage } from '../lib/commandDelivery'

describe('command delivery copy', () => {
  it('does not claim execution for broker-only delivery', () => {
    const text = commandDeliveryMessage({ delivery: 'published_to_broker', deviceAcknowledged: false })
    expect(text).toContain('broker accepted')
    expect(text).toContain('fresh telemetry')
    expect(text).not.toMatch(/heater (is|has) off|stopped the motor/i)
  })

  it('states that a buffered command was not sent', () => {
    const text = commandDeliveryMessage({ delivery: 'buffered_not_sent', deviceAcknowledged: false })
    expect(text).toContain('not sent')
    expect(text).toContain('will not take effect')
  })

  it('still requires telemetry after a device acknowledgement', () => {
    const text = commandDeliveryMessage({ delivery: 'published_to_broker', deviceAcknowledged: true })
    expect(text).toContain('acknowledged')
    expect(text).toContain('fresh telemetry')
  })
})
