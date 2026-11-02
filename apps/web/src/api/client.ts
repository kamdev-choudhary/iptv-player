import type { z } from 'zod'

/**
 * Every response is parsed against the same zod schema the server validated it
 * with, so a contract drift shows up here as a named error rather than as
 * `undefined` reaching a component three renders later.
 */

/** Empty by default: the API is same-origin, in development via Vite's proxy. */
const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ContractError extends Error {
  constructor(
    public path: string,
    public issues: z.core.$ZodIssue[],
  ) {
    super(`${path} did not match its schema: ${issues[0]?.message ?? 'unknown issue'}`)
    this.name = 'ContractError'
  }
}

type Params = Record<string, string | number | boolean | string[] | undefined>

export function query(params: Params): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue
    // A repeated key is how the API takes a multi-value filter.
    if (Array.isArray(value)) for (const v of value) search.append(key, v)
    else search.append(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** The admin token, for the write surface. Never sent to the read API. */
  token?: string
  signal?: AbortSignal
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  { method = 'GET', body, token, signal }: RequestOptions = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    // The API reports failures as { error }; anything else is a proxy or a
    // misconfiguration, where the status is the only honest thing to show.
    const detail = await response
      .json()
      .then((payload: { error?: string }) => payload.error)
      .catch(() => null)
    throw new ApiError(response.status, detail ?? `Request failed with ${response.status}`)
  }

  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) throw new ContractError(path, parsed.error.issues)
  return parsed.data
}

export const api = {
  get: <S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal) =>
    request(path, schema, { signal }),

  post: <S extends z.ZodType>(path: string, schema: S, body?: unknown, token?: string) =>
    request(path, schema, { method: 'POST', body, token }),

  put: <S extends z.ZodType>(path: string, schema: S, body: unknown, token?: string) =>
    request(path, schema, { method: 'PUT', body, token }),

  patch: <S extends z.ZodType>(path: string, schema: S, body: unknown, token?: string) =>
    request(path, schema, { method: 'PATCH', body, token }),

  delete: <S extends z.ZodType>(path: string, schema: S, token?: string) =>
    request(path, schema, { method: 'DELETE', token }),
}

/** The proxy URL for a source, which is what the player loads when direct fails. */
export const streamUrlFor = (proxyPath: string, token?: string) =>
  `${BASE}${proxyPath}${token ? `?k=${encodeURIComponent(token)}` : ''}`
