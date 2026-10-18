import { useCallback, useEffect, useState } from 'react'
import { AuthPage, LandingPage } from './PublicPages.jsx'
import Workspace from './Workspace.jsx'
import {
  createLooplineRuntime,
  normalizeLooplineError,
  normalizePublicAuthConfig,
} from './loopline-api.js'

const runtime = createLooplineRuntime()

const routes = new Set(['/', '/login', '/signup', '/forgot-password', '/reset-password', '/app'])
const authRoutes = new Set(['/login', '/signup', '/forgot-password', '/reset-password'])
const resetRoutes = new Set(['/forgot-password', '/reset-password'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function routeFromHash(hash = typeof window === 'undefined' ? '' : window.location.hash) {
  const value = String(hash || '').replace(/^#/, '').split(/[?#]/, 1)[0] || '/'
  return routes.has(value) ? value : '/'
}

export function normalizeRoute(path) {
  const value = typeof path === 'string' && path.startsWith('/') ? path : `/${path || ''}`
  return routes.has(value) ? value : '/'
}

function errorMessage(error, fallback) {
  return normalizeLooplineError(error, fallback).message
}

function isMissingSessionError(error) {
  const code = String(error?.error || error?.code || '').replaceAll('_', ' ')
  const message = String(error?.message || '')
  return /no refresh token|refresh token (?:is )?missing|no active session|not authenticated|unauthenticated/i.test(`${code} ${message}`)
}

function App({ runtimeOverride = runtime } = {}) {
  const activeRuntime = runtimeOverride
  const [route, setRoute] = useState(() => routeFromHash())
  const [user, setUser] = useState(null)
  const [authConfig, setAuthConfig] = useState(null)
  const [authUnavailable, setAuthUnavailable] = useState(activeRuntime.unavailableReason || '')
  const [authReady, setAuthReady] = useState(!activeRuntime.client)
  const [resetEmail, setResetEmail] = useState('')

  const navigate = useCallback((destination) => {
    const next = normalizeRoute(destination)
    if (typeof window === 'undefined') return
    const nextHash = `#${next}`
    if (window.location.hash === nextHash) {
      setRoute(next)
      return
    }
    window.location.hash = nextHash
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onHashChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    onHashChange()
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!activeRuntime.client) return undefined
    let active = true
    const { auth } = activeRuntime.client

    async function readCurrentUser() {
      const result = await auth.getCurrentUser()
      if (result?.error && !isMissingSessionError(result.error)) throw result.error
      if (!result || !isRecord(result.data)) throw new Error('The authentication service did not return the current session.')
      return result?.data?.user || null
    }

    async function initializeAuth() {
      try {
        // The SDK result is the source of truth for a session restored on startup.
        const [currentUserResult, publicConfigResult] = await Promise.all([
          auth.getCurrentUser(),
          auth.getPublicAuthConfig(),
        ])
        if (currentUserResult?.error && !isMissingSessionError(currentUserResult.error)) throw currentUserResult.error
        if (publicConfigResult?.error) throw publicConfigResult.error
        if (!currentUserResult || !isRecord(currentUserResult.data)) {
          throw new Error('The authentication service did not return the current session.')
        }
        if (!publicConfigResult || !Object.hasOwn(publicConfigResult, 'data')) {
          throw new Error('The authentication service did not return its public configuration.')
        }
        if (!isRecord(publicConfigResult.data)) {
          throw new Error('The authentication service did not return its public configuration.')
        }
        if (!active) return
        setUser(currentUserResult?.data?.user || null)
        setAuthConfig(normalizePublicAuthConfig(publicConfigResult.data))
        setAuthUnavailable('')
      } catch (error) {
        if (!active) return
        setAuthUnavailable(errorMessage(error, 'The authentication service is unavailable. Please try again shortly.'))
      } finally {
        if (active) setAuthReady(true)
      }
    }

    void initializeAuth()

    const unsubscribe = typeof auth.onAuthStateChange === 'function'
      ? auth.onAuthStateChange((event) => {
        if (!active) return
        if (event === 'signedOut') {
          setUser(null)
          return
        }
        void readCurrentUser()
          .then((currentUser) => {
            if (active) setUser(currentUser)
          })
          .catch((error) => {
            if (active) setAuthUnavailable(errorMessage(error, 'The authentication service is unavailable.'))
          })
      })
      : undefined

    return () => {
      active = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [activeRuntime])

  useEffect(() => {
    if (!authReady) return
    if (user && authRoutes.has(route)) navigate('/app')
    else if (!user && route === '/app') navigate('/login')
  }, [authReady, navigate, route, user])

  async function signOut() {
    if (!activeRuntime.client) throw new Error(activeRuntime.unavailableReason || 'The authentication service is unavailable.')
    const result = await activeRuntime.client.auth.signOut()
    if (result?.error) throw normalizeLooplineError(result.error, 'Could not sign out. Try again.')
    setUser(null)
    navigate('/')
  }

  function authenticated(nextUser) {
    setAuthUnavailable('')
    setUser(nextUser)
    navigate('/app')
  }

  function renderAuth(mode) {
    return (
      <AuthPage
        mode={mode}
        navigate={navigate}
        auth={activeRuntime.auth}
        authConfig={authConfig}
        onAuthenticated={authenticated}
        initialEmail={resetRoutes.has(`/${mode}`) ? resetEmail : ''}
        onResetRequested={setResetEmail}
        unavailableReason={authUnavailable}
      />
    )
  }

  // Keep public surfaces visible while session/config bootstrap runs. The SDK
  // result still controls whether `/app` becomes the authenticated workspace.
  if (route === '/app' && !authReady) return <LandingPage navigate={navigate} user={user} />
  if (route === '/app' && user && activeRuntime.api) {
    return <Workspace user={user} api={activeRuntime.api} onSignOut={signOut} navigate={navigate} />
  }
  if (route === '/app') return renderAuth('login')
  if (route === '/login') return renderAuth('login')
  if (route === '/signup') return renderAuth('signup')
  if (route === '/forgot-password') return renderAuth('forgot-password')
  if (route === '/reset-password') return renderAuth('reset-password')
  return <LandingPage navigate={navigate} user={user} />
}

export default App
