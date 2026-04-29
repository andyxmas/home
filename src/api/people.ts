import type { Person } from '../domain/person'

type PeopleResponse = {
  people?: Person[]
  personId?: string
  error?: string
}

export type SavePersonInput = {
  id?: string
  name: string
  githubUsername?: string
  slackUsername?: string
  shortcutUserId?: string
  shortcutHandle?: string
  shortcutUsername?: string
}

export async function listPeople(): Promise<Person[]> {
  const response = await fetch('/api/people')
  const payload = (await response.json().catch(() => ({}))) as PeopleResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load people')
  }
  return payload.people ?? []
}

export async function savePerson(input: SavePersonInput): Promise<string> {
  const method = input.id ? 'PUT' : 'POST'
  const response = await fetch(input.id ? `/api/people/${encodeURIComponent(input.id)}` : '/api/people', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as PeopleResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to save person')
  }
  return payload.personId ?? input.id ?? ''
}

export async function deletePerson(personId: string): Promise<void> {
  const response = await fetch(`/api/people/${encodeURIComponent(personId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as PeopleResponse
    throw new Error(payload.error ?? 'Failed to delete person')
  }
}
