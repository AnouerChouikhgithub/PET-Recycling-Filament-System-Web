/**
 * Login / registration — the gate in front of the app shell.
 * Visual identity: same tokens and card styles as the rest of the app,
 * brand green accent preserved.
 */
import { useState } from 'react'
import { LogoIcon } from '../components/icons'
import { useAuth, isCredentialsError } from '../contexts/AuthContext'
import { ApiError } from '../api/client'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { login, register, loginInProgress } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password, name || email.split('@')[0])
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const first = Object.values(err.details)[0]?.[0]
        setError(first ?? err.message)
      } else if (isCredentialsError(err)) {
        setError('Invalid email or password.')
      } else {
        setError((err as Error).message || 'Sign-in failed. Please try again.')
      }
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="brand login-brand">
          <LogoIcon size={34} />
          <div>
            <div className="brand-name">3awedlou</div>
            <div className="brand-tagline">Plastic today.{'\n'}A brighter tomorrow.</div>
          </div>
        </div>

        <h1 className="login-title">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="login-sub">
          {mode === 'login'
            ? 'Sign in to monitor and control your recycling machine.'
            : 'Join 3awedlou and start turning plastic into possibility.'}
        </p>

        <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
          {mode === 'register' && (
            <div className="field">
              <label className="field-label" htmlFor="login-name">Name</label>
              <input
                id="login-name"
                className="input"
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              required
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
            />
          </div>

          {error && (
            <div className="alert-banner alert-banner--error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <button className="btn btn-primary btn-lg" type="submit" disabled={loginInProgress}>
            {loginInProgress ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <>
              New to 3awedlou?{' '}
              <button className="link-btn" onClick={() => { setMode('register'); setError(null) }}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button className="link-btn" onClick={() => { setMode('login'); setError(null) }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
