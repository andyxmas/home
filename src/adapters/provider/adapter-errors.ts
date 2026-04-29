export class AdapterConfigError extends Error {
  constructor(source: string, message: string) {
    super(`[${source}] ${message}`)
    this.name = 'AdapterConfigError'
  }
}

export class AdapterRequestError extends Error {
  constructor(source: string, message: string) {
    super(`[${source}] ${message}`)
    this.name = 'AdapterRequestError'
  }
}
