import { createPeopleEndpoint } from './people-endpoint'
import type { Person } from '../domain/person'

describe('people endpoint', () => {
  function createService() {
    const people: Person[] = []
    return {
      people,
      service: {
        async listPeople() {
          return people
        },
        async upsertPerson(input: {
          id?: string
          name: string
          githubUsername?: string
          slackUsername?: string
          shortcutUserId?: string
          shortcutHandle?: string
          shortcutUsername?: string
        }) {
          const id = input.id ?? `person-${people.length + 1}`
          const now = '2026-01-15T12:00:00.000Z'
          const existing = people.find((person) => person.id === id)
          if (existing) {
            existing.name = input.name
            existing.githubUsername = input.githubUsername
            existing.slackUsername = input.slackUsername
            existing.shortcutUserId = input.shortcutUserId
            existing.shortcutHandle = input.shortcutHandle
            existing.shortcutUsername = input.shortcutUsername
            existing.updatedAt = now
            return id
          }
          people.push({
            id,
            name: input.name,
            githubUsername: input.githubUsername,
            slackUsername: input.slackUsername,
            shortcutUserId: input.shortcutUserId,
            shortcutHandle: input.shortcutHandle,
            shortcutUsername: input.shortcutUsername,
            createdAt: now,
            updatedAt: now,
          })
          return id
        },
        async deletePerson(personId: string) {
          const index = people.findIndex((person) => person.id === personId)
          if (index >= 0) {
            people.splice(index, 1)
          }
        },
      },
    }
  }

  it('supports people CRUD routes', async () => {
    const { people, service } = createService()
    const endpoint = createPeopleEndpoint(service)

    const createResponse = await endpoint(
      new Request('http://localhost/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Andy',
          githubUsername: 'andy-dev',
          slackUsername: 'U123',
          shortcutUserId: 'member-123',
          shortcutHandle: 'andy-shortcut',
        }),
      }),
    )
    expect(createResponse.status).toBe(200)
    const createPayload = (await createResponse.json()) as { personId: string }
    expect(createPayload.personId).toBe('person-1')
    expect(people).toHaveLength(1)
    expect(people[0].shortcutUserId).toBe('member-123')
    expect(people[0].shortcutHandle).toBe('andy-shortcut')

    const listResponse = await endpoint(new Request('http://localhost/api/people', { method: 'GET' }))
    expect(listResponse.status).toBe(200)
    const listPayload = (await listResponse.json()) as { people: Person[] }
    expect(listPayload.people).toHaveLength(1)

    const updateResponse = await endpoint(
      new Request('http://localhost/api/people/person-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Andy Updated',
          githubUsername: 'andy-updated',
        }),
      }),
    )
    expect(updateResponse.status).toBe(200)
    expect(people[0].name).toBe('Andy Updated')
    expect(people[0].slackUsername).toBeUndefined()
    expect(people[0].shortcutUserId).toBeUndefined()
    expect(people[0].shortcutHandle).toBeUndefined()

    const deleteResponse = await endpoint(
      new Request('http://localhost/api/people/person-1', {
        method: 'DELETE',
      }),
    )
    expect(deleteResponse.status).toBe(200)
    expect(people).toHaveLength(0)
  })

  it('returns 400 for invalid person payload', async () => {
    const { service } = createService()
    const endpoint = createPeopleEndpoint(service)
    const response = await endpoint(
      new Request('http://localhost/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
        }),
      }),
    )
    expect(response.status).toBe(400)
  })
})
