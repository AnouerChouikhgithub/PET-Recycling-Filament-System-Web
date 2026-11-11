/** Auth endpoints — POST /api/auth/register, POST /api/auth/login, GET /api/me. */
import { api, setToken } from './client'
import type { AuthPayload, User } from '../types/api'

export const authApi = {
  async login(email: string, password: string): Promise<AuthPayload> {
    const data = await api.post<AuthPayload>('/auth/login', { email, password })
    setToken(data.token)
    return data
  },

  async register(email: string, password: string, name: string): Promise<AuthPayload> {
    const data = await api.post<AuthPayload>('/auth/register', { email, password, name })
    setToken(data.token)
    return data
  },

  async me(): Promise<User> {
    return api.get<User>('/me')
  },

  logout(): void {
    // Discards the short-lived access token locally. This client deliberately
    // does NOT keep a refresh token in JavaScript-readable storage, so it also
    // cannot revoke one server-side; a 401 simply ends the session. Cookie-based
    // refresh + server revocation is Future (a separate design decision).
    setToken(null)
  },
}
