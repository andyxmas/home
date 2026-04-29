import { AdapterRequestError } from './adapter-errors'

type FetchLike = typeof fetch

type JsonRequestOptions = {
  source: string
  fetchImpl: FetchLike
  url: URL
  headers: Record<string, string>
}

export async function requestJson<T>({
  source,
  fetchImpl,
  url,
  headers,
}: JsonRequestOptions): Promise<{ data: T; response: Response }> {
  let response: Response

  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AdapterRequestError(source, `Request failed: ${message}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new AdapterRequestError(
      source,
      `HTTP ${response.status} for ${url.pathname}${body ? `: ${body}` : ''}`,
    )
  }

  let data: T
  try {
    data = (await response.json()) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AdapterRequestError(source, `Invalid JSON response: ${message}`)
  }

  return { data, response }
}
