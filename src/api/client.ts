/**
 * Central API client for the 3awedlou Symfony backend.
 *
 * Responsibilities:
 *  - base URL from VITE_API_BASE_URL
 *  - Bearer token injection (single place — components never handle tokens)
 *  - envelope unwrapping ({success,data} → data) and ApiError normalization
 *  - 401 handling: clear session once, notify the app (AuthContext listens)
 *
 * The mobile app mirrors this file (fetch + expo-secure-store) — keep the two
 * in sync with backend/docs/api-contract.md.
 */

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const AUTH_ERROR_EVENT = '3awedlou:auth-error'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api').replace(/\/+$/, '')

const TOKEN_KEY = '3awedlou.auth.token'

let onUnauthorized: (() => void) | null = null

/** Called once by AuthContext so the client can flush the session on 401s. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export function getBaseUrl(): string {
  return BASE_URL
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable (private mode) — session stays in memory only */
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Skip envelope unwrapping (login/register return the full envelope data incl. token). */
  auth?: boolean
  signal?: AbortSignal
}

/** Single entry point for every API call. Returns unwrapped `data`. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError('NETWORK_ERROR', 'Cannot reach the 3awedlou server. Check your connection.', 0)
  }

  if (res.status === 401) {
    // Flush session + notify once; the AuthContext decides what to render.
    setToken(null)
    onUnauthorized?.()
    throw new ApiError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401)
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server returned an unexpected response.', res.status)
  }

  const envelope = payload as { success?: boolean; data?: T; error?: { code: string; message: string; details?: Record<string, string[]> } }

  if (!res.ok || envelope.success === false) {
    const error = envelope?.error
    throw new ApiError(
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed (HTTP ${res.status}).`,
      res.status,
      error?.details,
    )
  }

  return (envelope.data ?? (payload as T)) as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>(path, { method: 'POST', body, signal }),
}
