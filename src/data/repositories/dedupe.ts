export function buildDedupeKey(source: string, externalId: string): string {
  return `${source}:${externalId}`
}
