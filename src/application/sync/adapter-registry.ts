import type { SourceKind } from '../../domain/notification'
import type { SourceAdapter } from '../../domain/source-adapter'

export type AdapterRegistry = {
  get(source: SourceKind): SourceAdapter | undefined
}

export function createAdapterRegistry(adapters: SourceAdapter[]): AdapterRegistry {
  const bySource = new Map<SourceKind, SourceAdapter>()

  for (const adapter of adapters) {
    if (bySource.has(adapter.source)) {
      throw new Error(`Duplicate adapter registered for source: ${adapter.source}`)
    }
    bySource.set(adapter.source, adapter)
  }

  return {
    get(source: SourceKind): SourceAdapter | undefined {
      return bySource.get(source)
    },
  }
}
