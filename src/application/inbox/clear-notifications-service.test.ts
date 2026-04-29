import { createClearNotificationsService } from './clear-notifications-service'

describe('clear notifications service', () => {
  it('clears inbox data, sync history, and source watermarks', async () => {
    const clearActive = vi.fn().mockResolvedValue({
      clearedNotifications: 3,
      clearedReadStates: 2,
    })
    const clearHistory = vi.fn().mockResolvedValue(5)
    const resetLastSuccessfulSyncAt = vi.fn().mockResolvedValue(2)
    const service = createClearNotificationsService({
      notificationRepository: { clearActive },
      syncRunRepository: { clearHistory },
      sourceConfigRepository: { resetLastSuccessfulSyncAt },
    })

    const result = await service.clearAllNotifications()

    expect(clearActive).toHaveBeenCalledTimes(1)
    expect(clearHistory).toHaveBeenCalledTimes(1)
    expect(resetLastSuccessfulSyncAt).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      clearedNotifications: 3,
      clearedReadStates: 2,
      clearedSyncHistory: 5,
      resetWatermarks: 2,
    })
  })
})
