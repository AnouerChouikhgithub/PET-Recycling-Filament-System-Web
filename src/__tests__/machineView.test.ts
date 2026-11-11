import { describe, expect, it } from 'vitest'
import { buildSensors, buildSubsystems } from '../contexts/MachineContext'
import type { MachineDashboardView, MachineTelemetry } from '../types/api'

const NOW = new Date('2026-11-10T12:00:00.000Z').getTime()

function telemetry(overrides: Partial<MachineTelemetry> = {}): MachineTelemetry {
  return {
    id: 't1',
    machineId: 'm1',
    temperature: null,
    targetTemperature: null,
    heaterState: null,
    motorState: null,
    motorSpeed: null,
    fanState: null,
    filamentSpeed: null,
    filamentDiameter: null,
    energyConsumption: null,
    extra: null,
    recordedAt: '2026-11-10T12:00:00+00:00',
    ...overrides,
  }
}

function view(overrides: Partial<MachineDashboardView> = {}): MachineDashboardView {
  return {
    id: 'm1',
    name: 'Test machine',
    identifier: 'test-1',
    status: 'idle',
    reportedStatus: 'idle',
    lastSeenAt: '2026-11-10T12:00:00+00:00',
    secondsSinceLastSeen: 5,
    createdAt: '2026-11-01T00:00:00+00:00',
    updatedAt: '2026-11-10T12:00:00+00:00',
    owner: 'u1',
    telemetry: telemetry(),
    activeSessionId: null,
    activeSession: null,
    recentTelemetry: [],
    recyclingTotals: { records: 0, inputGrams: null, outputGrams: null },
    ...overrides,
  }
}

describe('machine view telemetry honesty', () => {
  it('keeps every unreported channel null instead of zero or off', () => {
    const sensors = buildSensors(view(), 260, NOW)
    expect(sensors.map((s) => s.value)).toEqual([null, null, null, null])
    expect(sensors.map((s) => s.target)).toEqual([null, null, null, null])

    const subsystems = buildSubsystems(view(), NOW)
    expect(subsystems.map((s) => s.state)).toEqual(['unknown', 'unknown', 'unknown', 'unknown'])
  })

  it('preserves explicit zero and false as reported values', () => {
    const sensors = buildSensors(
      view({
        telemetry: telemetry({
          temperature: 0,
          targetTemperature: 195,
          motorSpeed: 0,
          fanState: false,
          filamentSpeed: 0,
        }),
        recentTelemetry: [telemetry({ fanState: false, motorSpeed: 0 })],
      }),
      260,
      NOW,
    )

    expect(sensors[0].value).toBe(0)
    expect(sensors[1].value).toBe(0)
    expect(sensors[2].value).toBe(0)
    expect(sensors[3].value).toBe(0)
    expect(sensors[2].history).toEqual([0])

    const subsystems = buildSubsystems(
      view({
        telemetry: telemetry({ heaterState: false, motorState: false, fanState: false }),
      }),
      NOW,
    )
    expect(subsystems.slice(0, 3).map((s) => s.state)).toEqual(['off', 'off', 'off'])
  })

  it('does not claim an active subsystem from stale offline telemetry', () => {
    const subsystems = buildSubsystems(
      view({
        status: 'offline',
        telemetry: telemetry({ heaterState: true, motorState: true, fanState: true }),
      }),
      NOW,
    )
    expect(subsystems.map((s) => s.state)).toEqual(['unknown', 'unknown', 'unknown', 'unknown'])
  })
})
