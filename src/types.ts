/**
 * Defines all possible lifecycle phases for tasks and sequences.
 * This is the single source of truth for status strings.
 */
export type StatusPhase =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'interrupted'
  | 'paused'
  | 'started';