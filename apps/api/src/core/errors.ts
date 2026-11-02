/**
 * The errors modules raise, and the status each one means. Keeping them here
 * rather than in a module lets the admin surface map any module's failure to a
 * response without importing that module.
 */

export class NotFoundError extends Error {
  readonly status = 404

  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

/** A job is already running, here or in another process. */
export class ConflictError extends Error {
  readonly status = 409

  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

/** The request was well-formed but asks for something that cannot be done. */
export class UnprocessableError extends Error {
  readonly status = 422

  constructor(message: string) {
    super(message)
    this.name = 'UnprocessableError'
  }
}

export function statusOf(error: unknown): number | null {
  if (error instanceof NotFoundError) return error.status
  if (error instanceof ConflictError) return error.status
  if (error instanceof UnprocessableError) return error.status
  return null
}
