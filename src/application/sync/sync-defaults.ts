export const INITIAL_SYNC_LOOKBACK_DAYS = 7

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function buildInitialSyncSince(now: Date): string {
  return new Date(now.getTime() - INITIAL_SYNC_LOOKBACK_DAYS * DAY_IN_MS).toISOString()
}
