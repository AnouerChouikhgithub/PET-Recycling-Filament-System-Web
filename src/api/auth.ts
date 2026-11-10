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
    // Discards the access token locally. The server refresh token is not stored
    // yet, so /auth/logout is not called and server-side revocation is pending
    // the token-storage decision tracked in the inventory.
    setToken(null)
  },
}
