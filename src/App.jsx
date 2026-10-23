import { useCallback, useEffect, useState } from 'react'
import { AuthPage, LandingPage } from './PublicPages.jsx'
import Workspace from './Workspace.jsx'
import {
  createLooplineRuntime,
  normalizeLooplineError,
  normalizePublicAuthConfig,
} from './loopline-api.js'
import { Brand } from './ui.jsx'

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

function SessionBootstrap() {
  return (
    <div className="ws-workspace ws-session-bootstrap" data-testid="session-bootstrap" aria-busy="true">
      <header className="ws-topbar">
        <div className="ws-topbar-brand"><Brand /><span className="ws-topbar-divider" aria-hidden="true" /><span>Workspace</span></div>
        <div className="ws-account" aria-hidden="true"><span className="ws-bootstrap-account-line" /></div>
      </header>
      <div className="ws-layout">
        <aside className="ws-sidebar" aria-hidden="true">
          <div className="ws-sidebar-heading"><h2>Repositories</h2></div>
          <div className="ws-bootstrap-button" />
          <div className="ws-bootstrap-sidebar-lines"><span /><span /><span /></div>
        </aside>
        <main className="ws-main" id="main-content" tabIndex={-1}>
          <div className="ws-page-heading">
            <p className="ws-eyebrow">Repository workspace</p>
            <h1>Repository evidence</h1>
            <p>Restoring your session before loading the workspace.</p>
          </div>
          <div className="ws-detail-message ws-session-bootstrap-message" role="status">Checking your Loopline session…</div>
        </main>
      </div>
    </div>
  )
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
      try {
        const result = await auth.getCurrentUser()
        if (result?.error || !result || !isRecord(result.data)) return null
        return result.data.user || null
      } catch {
        // Session discovery is advisory. A transient refresh/network failure
        // must not disable signup, login, or password reset forms.
        return null
      }
    }

    async function initializeAuth() {
      const [currentUserResult, publicConfigResult] = await Promise.allSettled([
        auth.getCurrentUser(),
        auth.getPublicAuthConfig(),
      ])
      if (!active) return

      // A failed/empty refresh means signed out. It is not an auth-service
      // outage, and should never replace the usable public auth forms.
      const currentUser = currentUserResult.status === 'fulfilled'
        && !currentUserResult.value?.error
        && isRecord(currentUserResult.value?.data)
        ? currentUserResult.value.data.user || null
        : null
      setUser(currentUser)

      if (publicConfigResult.status === 'fulfilled'
        && !publicConfigResult.value?.error
        && isRecord(publicConfigResult.value?.data)) {
        setAuthConfig(normalizePublicAuthConfig(publicConfigResult.value.data))
      } else {
        // Auth methods remain enabled with safe defaults; the action itself
        // will surface a contextual network/service error if it still fails.
        setAuthConfig(normalizePublicAuthConfig({}))
      }
      setAuthUnavailable(activeRuntime.unavailableReason || '')
      setAuthReady(true)
    }

    void initializeAuth()

    const unsubscribe = typeof auth.onAuthStateChange === 'function'
      ? auth.onAuthStateChange((event) => {
        if (!active) return
        if (event === 'signedOut') {
          setUser(null)
          return
        }
        void readCurrentUser().then((currentUser) => {
          if (active) setUser(currentUser)
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

  // Keep the dashboard route visually stable while session/config bootstrap runs.
  // Rendering the public landing page here caused an authenticated refresh to flash
  // away from the workspace before the SDK restored the session.
  if (route === '/app' && !authReady) return <SessionBootstrap />
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
