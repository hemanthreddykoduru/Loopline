import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createLooplineApi,
  normalizeLooplineError,
  normalizePublicAuthConfig,
  readInsForgePublicConfig,
} from '../src/loopline-api.js'

test('public InsForge configuration requires a base URL and anonymous key', () => {
  assert.match(readInsForgePublicConfig({}).unavailableReason, /VITE_INSFORGE_BASE_URL/)
  assert.match(readInsForgePublicConfig({ VITE_INSFORGE_BASE_URL: 'not-a-url', VITE_INSFORGE_ANON_KEY: 'anon' }).unavailableReason, /valid HTTP/)

  const result = readInsForgePublicConfig({
    VITE_INSFORGE_BASE_URL: 'https://example.insforge.app',
    VITE_INSFORGE_ANON_KEY: 'public-anon-key',
    VITE_INSFORGE_FUNCTIONS_URL: 'https://example.function2.insforge.app',
  })
  assert.equal(result.unavailableReason, '')
  assert.deepEqual(result.config, {
    baseUrl: 'https://example.insforge.app',
    anonKey: 'public-anon-key',
    functionsUrl: 'https://example.function2.insforge.app',
  })
  assert.match(readInsForgePublicConfig({
    VITE_INSFORGE_BASE_URL: 'https://example.insforge.app',
    VITE_INSFORGE_ANON_KEY: 'public-anon-key',
    VITE_INSFORGE_FUNCTIONS_URL: 'file:///tmp/function',
  }).unavailableReason, /VITE_INSFORGE_FUNCTIONS_URL/)
})

test('browser development auth uses a same-origin proxy for refresh cookies', () => {
  const previousWindow = globalThis.window
  globalThis.window = { location: { origin: 'http://127.0.0.1:5173' } }
  try {
    const result = readInsForgePublicConfig({
      DEV: true,
      VITE_INSFORGE_BASE_URL: 'https://example.insforge.app',
      VITE_INSFORGE_ANON_KEY: 'public-anon-key',
    })
    assert.equal(result.config.baseUrl, 'http://127.0.0.1:5173/insforge')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('public auth configuration accepts a nested config and supplies safe defaults', () => {
  assert.deepEqual(normalizePublicAuthConfig({ data: { config: { passwordMinLength: 12, disableSignup: true } } }), {
    passwordMinLength: 12,
    disableSignup: true,
    requireEmailVerification: true,
    verifyEmailMethod: 'code',
    resetPasswordMethod: 'code',
  })
})

test('the Loopline API adapter sends authenticated raw action bodies', async () => {
  const calls = []
  const client = {
    functions: {
      invoke: async (slug, options) => {
        calls.push({ slug, options })
        const action = options.body.action
        if (action === 'list') return { data: { projects: [] }, error: null }
        if (action === 'connect') return { data: { project: { id: 'project-1' } }, error: null }
        if (action === 'get') return { data: { project: { id: options.body.projectId } }, error: null }
        if (action === 'sync') return { data: { project: { id: options.body.projectId }, snapshot: null }, error: null }
        return { data: { success: true }, error: null }
      },
    },
  }
  const api = createLooplineApi(client)

  assert.deepEqual(await api.listProjects(), [])
  assert.deepEqual((await api.connectProject('owner/repo', { requireTestSprite: false })).project, { id: 'project-1' })
  assert.equal((await api.getProject('project-1')).project.id, 'project-1')
  assert.equal((await api.syncProject('project-1', { pullNumber: 4 })).project.id, 'project-1')
  assert.deepEqual(await api.disconnectProject('project-1'), { success: true })
  assert.deepEqual(calls.map(({ slug, options }) => [slug, options.body]), [
    ['loopline-api', { action: 'list' }],
    ['loopline-api', { action: 'connect', repository: 'owner/repo', requireTestSprite: false }],
    ['loopline-api', { action: 'get', projectId: 'project-1' }],
    ['loopline-api', { action: 'sync', projectId: 'project-1', pullNumber: 4 }],
    ['loopline-api', { action: 'disconnect', projectId: 'project-1' }],
  ])
})

test('nested backend errors keep their code, message, retry hint, and HTTP status', async () => {
  const api = createLooplineApi({
    functions: {
      invoke: async () => ({
        data: null,
        error: Object.assign(new Error('SDK wrapper'), {
          statusCode: 429,
          error: { code: 'SYNC_COOLDOWN', message: 'Try again later.', retryAfterSeconds: 9 },
        }),
      }),
    },
  })

  await assert.rejects(() => api.syncProject('project-1'), (error) => {
    assert.equal(error.name, 'LooplineApiError')
    assert.equal(error.code, 'SYNC_COOLDOWN')
    assert.equal(error.message, 'Try again later.')
    assert.equal(error.retryAfterSeconds, 9)
    assert.equal(error.statusCode, 429)
    return true
  })

  const fallback = normalizeLooplineError({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } })
  assert.equal(fallback.code, 'UNAUTHENTICATED')
  assert.equal(fallback.message, 'Sign in required')
})
