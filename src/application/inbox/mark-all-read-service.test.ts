import { createMarkAllReadService } from './mark-all-read-service'

describe('mark all read service', () => {
  it('returns changed count from repository', async () => {
    const markAllActiveAsRead = vi.fn().mockResolvedValue(4)
    const service = createMarkAllReadService({
      notificationRepository: { markAllActiveAsRead },
    })

    await expect(service.markAllAsRead()).resolves.toEqual({ changedCount: 4 })
    expect(markAllActiveAsRead).toHaveBeenCalledTimes(1)
  })
})
