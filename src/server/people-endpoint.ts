import type { Person } from '../domain/person'

export type PeopleService = {
  listPeople(): Promise<Person[]>
  upsertPerson(input: {
    id?: string
    name: string
    githubUsername?: string
    slackUsername?: string
    shortcutUserId?: string
    shortcutHandle?: string
    shortcutUsername?: string
    isMe?: boolean
  }): Promise<string>
  deletePerson(personId: string): Promise<void>
}

type PersonPayload = {
  id?: string
  name?: string
  githubUsername?: string
  slackUsername?: string
  shortcutUserId?: string
  shortcutHandle?: string
  shortcutUsername?: string
  isMe?: boolean
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function validatePayload(payload: PersonPayload): string[] {
  const errors: string[] = []
  if (!payload.name?.trim()) {
    errors.push('Person name is required.')
  }
  return errors
}

async function readPayload<T>(request: Pick<Request, 'text'>): Promise<T> {
  const text = await request.text()
  if (!text.trim()) {
    return {} as T
  }
  return JSON.parse(text) as T
}

export function createPeopleEndpoint(service: PeopleService) {
  return async function handlePeopleEndpoint(request: Pick<Request, 'method' | 'url' | 'text'>) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === '/api/people' && request.method === 'GET') {
      const people = await service.listPeople()
      return Response.json({ people }, { status: 200 })
    }

    if (pathname === '/api/people' && request.method === 'POST') {
      const payload = await readPayload<PersonPayload>(request)
      const errors = validatePayload(payload)
      if (errors.length > 0) {
        return Response.json({ error: errors.join(' ') }, { status: 400 })
      }

      const personId = await service.upsertPerson({
        name: payload.name!.trim(),
        githubUsername: normalizeOptional(payload.githubUsername),
        slackUsername: normalizeOptional(payload.slackUsername),
        shortcutUserId: normalizeOptional(payload.shortcutUserId),
        shortcutHandle: normalizeOptional(payload.shortcutHandle),
        shortcutUsername: normalizeOptional(payload.shortcutUsername),
        isMe: payload.isMe ?? false,
      })
      return Response.json({ ok: true, personId }, { status: 200 })
    }

    if (pathname.startsWith('/api/people/') && request.method === 'PUT') {
      const personId = decodeURIComponent(pathname.replace('/api/people/', '').trim())
      if (!personId) {
        return Response.json({ error: 'Missing person ID in URL.' }, { status: 400 })
      }
      const payload = await readPayload<PersonPayload>(request)
      const errors = validatePayload(payload)
      if (errors.length > 0) {
        return Response.json({ error: errors.join(' ') }, { status: 400 })
      }

      await service.upsertPerson({
        id: personId,
        name: payload.name!.trim(),
        githubUsername: normalizeOptional(payload.githubUsername),
        slackUsername: normalizeOptional(payload.slackUsername),
        shortcutUserId: normalizeOptional(payload.shortcutUserId),
        shortcutHandle: normalizeOptional(payload.shortcutHandle),
        shortcutUsername: normalizeOptional(payload.shortcutUsername),
        isMe: payload.isMe ?? false,
      })
      return Response.json({ ok: true, personId }, { status: 200 })
    }

    if (pathname.startsWith('/api/people/') && request.method === 'DELETE') {
      const personId = decodeURIComponent(pathname.replace('/api/people/', '').trim())
      if (!personId) {
        return Response.json({ error: 'Missing person ID in URL.' }, { status: 400 })
      }
      await service.deletePerson(personId)
      return Response.json({ ok: true }, { status: 200 })
    }

    return Response.json({ error: 'People endpoint route not found.' }, { status: 404 })
  }
}
