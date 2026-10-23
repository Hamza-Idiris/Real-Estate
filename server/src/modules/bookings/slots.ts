import { badRequest } from '../../utils/errors';
/** Slot rules (pure, unit-tested). Start must be on the grid, in the future (>=1h ahead) and within 60 days. */
export function validateSlotStart(start: Date, slotMinutes: number, now = new Date()) {
  if (Number.isNaN(start.getTime())) throw badRequest('Invalid slot', 'INVALID_SLOT');
  const onGrid = start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0 && start.getUTCMinutes() % slotMinutes === 0;
  if (!onGrid) throw badRequest(`Viewing times must start on a ${slotMinutes}-minute boundary`, 'INVALID_SLOT');
  if (start.getTime() < now.getTime() + 3_600_000) throw badRequest('Viewing must be at least 1 hour from now', 'INVALID_SLOT');
  if (start.getTime() > now.getTime() + 60 * 86_400_000) throw badRequest('Viewing must be within the next 60 days', 'INVALID_SLOT');
}
export const slotEnd = (start: Date, slotMinutes: number) => new Date(start.getTime() + slotMinutes * 60_000);
