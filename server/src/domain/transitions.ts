import { conflict } from '../utils/errors';

export type TransitionMap = Record<string, readonly string[]>;

export function assertTransition(map: TransitionMap, from: string, to: string, what: string) {
  if (!(map[from] ?? []).includes(to)) {
    throw conflict(`Cannot change ${what} from "${from}" to "${to}"`, 'INVALID_TRANSITION');
  }
}
export const canTransition = (map: TransitionMap, from: string, to: string) => (map[from] ?? []).includes(to);

export const BOOKING_TRANSITIONS: TransitionMap = {
  pending: ['confirmed', 'alternative_proposed', 'rejected', 'cancelled'],
  alternative_proposed: ['confirmed', 'cancelled', 'rejected'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [], cancelled: [], rejected: [], no_show: [],
};
export const ACTIVE_BOOKING = ['pending', 'confirmed', 'alternative_proposed'];

export const APPLICATION_TRANSITIONS: TransitionMap = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'rejected', 'withdrawn', 'expired'],
  under_review: ['information_required', 'approved', 'rejected', 'withdrawn'],
  information_required: ['under_review', 'withdrawn', 'expired', 'rejected'],
  approved: [], rejected: [], withdrawn: [], expired: [],
};
export const OPEN_APPLICATION = ['draft', 'submitted', 'under_review', 'information_required'];

export const MAINTENANCE_TRANSITIONS: TransitionMap = {
  submitted: ['acknowledged', 'assigned', 'closed'],
  acknowledged: ['assigned', 'in_progress', 'closed'],
  assigned: ['in_progress', 'waiting_for_parts', 'acknowledged'],
  in_progress: ['waiting_for_parts', 'resolved'],
  waiting_for_parts: ['in_progress', 'resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['acknowledged', 'assigned', 'in_progress'],
};

export const TENANCY_TRANSITIONS: TransitionMap = {
  pending: ['active', 'terminated'],
  active: ['expired', 'terminated', 'renewed'],
  expired: [], terminated: [], renewed: [],
};
