/**
 * Defines all possible lifecycle phases for tasks and sequences.
 * This is the single source of truth for status strings.
 */
export const ALL_STATUS_PHASES = [
  'pending',
  'running',
  'done',
  'failed',
  'interrupted',
  'waiting_for_reset',
  'waiting_for_input',
  'paused',
  'started',
] as const;

export type StatusPhase = typeof ALL_STATUS_PHASES[number];
