/**
 * Mission State Machine — enforces valid transitions per Section 4.2.
 * A transition is only allowed if it appears in VALID_TRANSITIONS.
 */
import {
  MissionStatus,
  VALID_STATUSES,
  VALID_TRANSITIONS,
} from './types.js';

export class MissionStateMachine {
  /** Validate and return the new status, or throw if transition is invalid */
  static transition(current: string, target: string): MissionStatus {
    if (!VALID_STATUSES.includes(current as MissionStatus)) {
      throw new Error(`Invalid current status: '${current}'`);
    }
    if (!VALID_STATUSES.includes(target as MissionStatus)) {
      throw new Error(`Invalid target status: '${target}'`);
    }

    const allowed = VALID_TRANSITIONS[current as MissionStatus];
    if (!allowed.includes(target as MissionStatus)) {
      throw new Error(
        `Invalid transition: '${current}' → '${target}'. ` +
        `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`
      );
    }

    return target as MissionStatus;
  }

  /** Check if a transition is valid without throwing */
  static canTransition(current: string, target: string): boolean {
    try {
      this.transition(current, target);
      return true;
    } catch {
      return false;
    }
  }

  /** Get allowed next states for a given current state */
  static getAllowedTransitions(current: string): MissionStatus[] {
    if (!VALID_STATUSES.includes(current as MissionStatus)) return [];
    return [...VALID_TRANSITIONS[current as MissionStatus]];
  }
}
