import { createMarkAllReadEndpoint } from './mark-all-read-endpoint'

describe('mark all read endpoint', () => {
  it('returns 200 and changed count on POST', async () => {
    const endpoint = createMarkAllReadEndpoint({
      async markAllAsRead() {
        return { changedCount: 7 }
      },
    })

    const response = await endpoint(new Request('http://localhost/api/inbox/mark-all-read', { method: 'POST' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ changedCount: 7 })
  })

  it('returns 405 for unsupported methods', async () => {
    const endpoint = createMarkAllReadEndpoint({
      async markAllAsRead() {
        throw new Error('should not be called')
      },
    })

    const response = await endpoint(new Request('http://localhost/api/inbox/mark-all-read', { method: 'GET' }))
    expect(response.status).toBe(405)
  })
})
