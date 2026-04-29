import { createClearNotificationsEndpoint } from './clear-notifications-endpoint'

describe('clear notifications endpoint', () => {
  it('returns 200 and clear counts on POST', async () => {
    const endpoint = createClearNotificationsEndpoint({
      async clearAllNotifications() {
        return {
          clearedNotifications: 4,
          clearedReadStates: 3,
          clearedSyncHistory: 2,
          resetWatermarks: 1,
        }
      },
    })

    const response = await endpoint(new Request('http://localhost/api/inbox/clear-all', { method: 'POST' }))
    expect(response.status).toBe(200)

    const payload = (await response.json()) as {
      clearedNotifications: number
      clearedReadStates: number
      clearedSyncHistory: number
      resetWatermarks: number
    }
    expect(payload).toEqual({
      clearedNotifications: 4,
      clearedReadStates: 3,
      clearedSyncHistory: 2,
      resetWatermarks: 1,
    })
  })

  it('returns 405 for unsupported methods', async () => {
    const endpoint = createClearNotificationsEndpoint({
      async clearAllNotifications() {
        throw new Error('should not be called')
      },
    })

    const response = await endpoint(new Request('http://localhost/api/inbox/clear-all', { method: 'GET' }))
    expect(response.status).toBe(405)
  })
})
