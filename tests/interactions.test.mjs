import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

process.env.NODE_ENV = 'test'
// Keep this offline component harness independent of a developer's connected `.env`.
process.env.VITE_INSFORGE_BASE_URL = ''
process.env.VITE_INSFORGE_ANON_KEY = ''
process.env.VITE_INSFORGE_FUNCTIONS_URL = ''

// Compile the rendered application with the production toolchain, without writing build files.
const result = await build({
  configFile: false,
  logLevel: 'silent',
  esbuild: { jsx: 'automatic' },
  build: {
    write: false,
    minify: false,
    lib: { entry: fileURLToPath(new URL('../src/App.jsx', import.meta.url)), formats: ['es'] },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        inlineDynamicImports: true,
        paths: {
          react: import.meta.resolve('react'),
          'react-dom': import.meta.resolve('react-dom'),
          'react-dom/client': import.meta.resolve('react-dom/client'),
          'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
        },
      },
    },
  },
})
const bundle = (Array.isArray(result) ? result[0] : result).output.find((entry) => entry.type === 'chunk')
const appModule = await import(`data:text/javascript;base64,${Buffer.from(bundle.code).toString('base64')}`)
const { default: App, normalizeRoute, routeFromHash } = appModule

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')

let root

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  window.location.hash = '#/'
  root = createRoot(document.getElementById('root'))
})

afterEach(async () => {
  await act(() => root.unmount())
  document.body.innerHTML = ''
})

after(() => dom.window.close())

const byId = (id) => document.querySelector(`[data-testid="${id}"]`)

async function render(element) {
  await act(async () => {
    root.render(element)
    await flushAsyncWork()
  })
}

async function settle() {
  await act(async () => { await flushAsyncWork() })
}

async function flushAsyncWork() {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    await Promise.resolve()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
}

async function click(target) {
  const element = typeof target === 'string' ? byId(target) : target
  assert.ok(element, `Missing control: ${target}`)
  await act(async () => {
    element.focus()
    element.click()
    await flushAsyncWork()
  })
}

async function fill(id, value) {
  const input = byId(id)
  assert.ok(input, `Missing input: ${id}`)
  await act(() => {
    if (input.tagName === 'SELECT') {
      input.value = value
      input.dispatchEvent(new window.Event('change', { bubbles: true }))
    } else {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      input.dispatchEvent(new window.Event('change', { bubbles: true }))
    }
  })
}

function createAuthRuntime({
  user = null,
  api = null,
  sendResetPasswordEmail = async () => ({ data: { success: true }, error: null }),
  signInWithPassword = async () => ({ data: null, error: new Error('Sign-in was not expected in this test.') }),
} = {}) {
  const auth = {
    getCurrentUser: async () => ({ data: { user }, error: null }),
    getPublicAuthConfig: async () => ({ data: { requireEmailVerification: false, passwordMinLength: 10 }, error: null }),
    onAuthStateChange: () => () => {},
    sendResetPasswordEmail,
    signInWithPassword,
    signOut: async () => ({ error: null }),
  }
  return { client: { auth }, auth, api, unavailableReason: '' }
}

function createPendingRuntime() {
  const auth = {
    getCurrentUser: () => new Promise(() => {}),
    getPublicAuthConfig: () => new Promise(() => {}),
    onAuthStateChange: () => () => {},
  }
  return { client: { auth }, auth, api: null, unavailableReason: '' }
}

test('hash routing accepts supported routes and falls back safely', () => {
  assert.equal(routeFromHash('#/app'), '/app')
  assert.equal(routeFromHash('#/reset-password?email=person@example.com'), '/reset-password')
  assert.equal(routeFromHash('#/not-a-route'), '/')
  assert.equal(normalizeRoute('signup'), '/signup')
  assert.equal(normalizeRoute('/missing'), '/')
})

test('the public landing page links to an unavailable auth state without backend configuration', async () => {
  await render(createElement(App))
  assert.ok(byId('landing-hero-cta'))
  assert.ok(byId('landing-preview').querySelector('.pub-evidence-preview'))
  assert.equal(document.querySelectorAll('.pub-section-index').length, 0)
  assert.equal(document.querySelector('.pub-hero h1').textContent, 'Ship the right commit.')

  await click('landing-nav-login')
  assert.equal(window.location.hash, '#/login')
  assert.ok(byId('auth-form'))
  assert.match(byId('auth-unavailable').textContent, /InsForge is not configured/)
  assert.equal(byId('auth-submit').disabled, true)

  await click('auth-nav-home')
  assert.ok(byId('landing-hero-cta'))
})

test('session bootstrap keeps the landing page visible instead of showing a loading message', async () => {
  await render(createElement(App, { runtimeOverride: createPendingRuntime() }))
  assert.ok(byId('landing-hero-cta'))
  assert.equal(document.body.textContent.includes('Loading Loopline'), false)
})

test('reset email remains available when moving from the reset request to the code form', async () => {
  window.location.hash = '#/forgot-password'
  await render(createElement(App, { runtimeOverride: createAuthRuntime() }))
  await settle()
  assert.ok(byId('auth-form'))
  await fill('auth-email', 'person@example.com')
  await click('auth-submit')
  assert.ok(byId('auth-continue-reset'))
  await click('auth-continue-reset')
  assert.equal(window.location.hash, '#/reset-password')
  assert.equal(byId('auth-email').value, 'person@example.com')
})

test('a successful sign-in opens the authenticated workspace and loads its repository list', async () => {
  const user = { id: 'user-1', email: 'person@example.com', profile: { display_name: 'Person' } }
  let listCalls = 0
  const api = {
    listProjects: async () => { listCalls += 1; return [] },
    connectProject: async () => ({}),
    getProject: async () => ({}),
    syncProject: async () => ({}),
    disconnectProject: async () => ({ success: true }),
  }
  window.location.hash = '#/login'
  const runtime = createAuthRuntime({
    api,
    signInWithPassword: async () => ({ data: { user, accessToken: 'session-token' }, error: null }),
  })
  await render(createElement(App, { runtimeOverride: runtime }))

  await fill('auth-email', user.email)
  await fill('auth-password', 'correct horse battery staple')
  await click('auth-submit')
  assert.equal(window.location.hash, '#/app')
  assert.equal(byId('workspace-user-email').textContent, user.email)
  assert.ok(byId('projects-empty'))
  assert.equal(listCalls, 1)
})

test('an existing authenticated session opens an empty workspace without inventing repositories', async () => {
  const api = {
    listProjects: async () => [],
    connectProject: async () => ({}),
    getProject: async () => ({}),
    syncProject: async () => ({}),
    disconnectProject: async () => ({ success: true }),
  }
  window.location.hash = '#/app'
  await render(createElement(App, {
    runtimeOverride: createAuthRuntime({
      user: { id: 'user-2', email: 'restored@example.com', profile: {} },
      api,
    }),
  }))
  assert.ok(byId('workspace'))
  assert.equal(byId('workspace-user-email').textContent, 'restored@example.com')
  assert.ok(byId('projects-empty'))
  assert.equal(document.querySelectorAll('[data-testid^="project-select-"]').length, 0)
})

test('the workspace syncs the selected PR target and renders its exact commit evidence', async () => {
  const branchSha = 'a'.repeat(40)
  const pullSha = 'b'.repeat(40)
  const project = {
    id: 'project-3',
    full_name: 'owner/repository',
    description: null,
    default_branch: 'main',
    html_url: 'https://github.com/owner/repository',
    created_at: '2026-10-16T10:00:00.000Z',
    last_synced_at: '2026-10-16T10:00:00.000Z',
    require_testsprite: true,
  }
  const branchSnapshot = {
    id: 'snapshot-branch',
    head_sha: branchSha,
    ref_name: 'main',
    pr_number: null,
    pr_title: null,
    html_url: project.html_url,
    conclusion: 'unverified',
    checked_at: '2026-10-16T10:00:00.000Z',
    checks: [],
    summary: { total: 0, passed: 0, failed: 0, pending: 0 },
    reason: 'No published checks were returned.',
    stale: false,
    current: true,
  }
  const pullSnapshot = {
    ...branchSnapshot,
    id: 'snapshot-pr',
    head_sha: pullSha,
    ref_name: 'feature/release',
    pr_number: 7,
    pr_title: 'Prepare release',
    checked_at: '2026-10-16T10:05:00.000Z',
    conclusion: 'ready',
    checks: [{
      id: 'check-1',
      name: 'TestSprite',
      provider: 'TestSprite',
      status: 'completed',
      conclusion: 'success',
      head_sha: pullSha,
      html_url: 'https://github.com/owner/repository/actions/runs/1',
      completed_at: '2026-10-16T10:04:00.000Z',
    }],
    summary: { total: 1, passed: 1, failed: 0, pending: 0 },
    reason: 'All observed checks passed.',
  }
  let syncedTarget
  const detail = (snapshot) => ({
    project,
    snapshot,
    pullRequests: [{ number: 7, title: 'Prepare release', head_sha: pullSha, head_ref: 'feature/release', html_url: 'https://github.com/owner/repository/pull/7' }],
    history: [snapshot],
  })
  const api = {
    listProjects: async () => [project],
    getProject: async () => detail(branchSnapshot),
    syncProject: async (projectId, options) => {
      syncedTarget = { projectId, ...options }
      return detail(pullSnapshot)
    },
    connectProject: async () => detail(branchSnapshot),
    disconnectProject: async () => ({ success: true }),
  }

  window.location.hash = '#/app'
  await render(createElement(App, {
    runtimeOverride: createAuthRuntime({ user: { id: 'user-3', email: 'reviewer@example.com', profile: {} }, api }),
  }))
  assert.equal(byId('pull-request-select').value, 'branch')
  await fill('pull-request-select', '7')
  await click('sync-project')
  assert.deepEqual(syncedTarget, { projectId: 'project-3', pullNumber: 7 })
  assert.equal(byId('evidence-sha').textContent, pullSha)
  assert.equal(byId('evidence-status').dataset.conclusion, 'ready')
})
