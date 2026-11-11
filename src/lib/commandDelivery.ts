import type { MachineCommandResult } from '../types/api'

/**
 * Turns the backend's delivery honesty fields into user-facing copy. Broker
 * acceptance is not physical execution; only telemetry can confirm that.
 */
export function commandDeliveryMessage(
  result: Pick<MachineCommandResult, 'delivery' | 'deviceAcknowledged'>,
): string {
  if (result.delivery === 'buffered_not_sent') {
    return 'The command was queued locally but was not sent to the machine. It will not take effect until broker delivery is enabled.'
  }
  if (result.deviceAcknowledged) {
    return 'The device acknowledged the command. Confirm the resulting state from fresh telemetry.'
  }
  return 'The broker accepted the command. Physical execution must be confirmed from fresh telemetry.'
}
