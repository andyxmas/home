import type { ClearNotificationsResult } from '../../data/repositories/notification-repository'

export type ClearNotificationsRepository = {
  clearActive(): Promise<ClearNotificationsResult>
}

export type SyncRunRepository = {
  clearHistory(): Promise<number>
}

export type SourceConfigRepository = {
  resetLastSuccessfulSyncAt(): Promise<number>
}

export type ClearAllNotificationsResult = ClearNotificationsResult & {
  clearedSyncHistory: number
  resetWatermarks: number
}

export function createClearNotificationsService(dependencies: {
  notificationRepository: ClearNotificationsRepository
  syncRunRepository: SyncRunRepository
  sourceConfigRepository: SourceConfigRepository
}) {
  return {
    async clearAllNotifications(): Promise<ClearAllNotificationsResult> {
      const [notificationResult, clearedSyncHistory, resetWatermarks] = await Promise.all([
        dependencies.notificationRepository.clearActive(),
        dependencies.syncRunRepository.clearHistory(),
        dependencies.sourceConfigRepository.resetLastSuccessfulSyncAt(),
      ])

      return {
        ...notificationResult,
        clearedSyncHistory,
        resetWatermarks,
      }
    },
  }
}
