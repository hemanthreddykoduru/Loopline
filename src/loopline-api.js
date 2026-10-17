import { createClient } from '@insforge/sdk'

export const LOOPLINE_FUNCTION = 'loopline-api'
export const MISSING_CONFIG_MESSAGE = 'InsForge is not configured for this deployment. Set VITE_INSFORGE_BASE_URL and VITE_INSFORGE_ANON_KEY, then reload.'

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validHttpUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.host)
  } catch {
    return false
  }
}

function viteEnv() {
  return import.meta.env || {}
}

export function readInsForgePublicConfig(env = viteEnv()) {
  const baseUrl = text(env?.VITE_INSFORGE_BASE_URL)
  const anonKey = text(env?.VITE_INSFORGE_ANON_KEY)
  const functionsUrl = text(env?.VITE_INSFORGE_FUNCTIONS_URL)

  if (!baseUrl || !anonKey) {
    return { config: null, unavailableReason: MISSING_CONFIG_MESSAGE }
  }
  if (!validHttpUrl(baseUrl)) {
    return { config: null, unavailableReason: 'InsForge is unavailable because VITE_INSFORGE_BASE_URL is not a valid HTTP(S) URL.' }
  }
  if (functionsUrl && !validHttpUrl(functionsUrl)) {
    return { config: null, unavailableReason: 'InsForge is unavailable because VITE_INSFORGE_FUNCTIONS_URL is not a valid HTTP(S) URL.' }
  }

  return {
    config: {
      baseUrl,
      anonKey,
      ...(functionsUrl ? { functionsUrl } : {}),
    },
    unavailableReason: '',
  }
}

export function normalizePublicAuthConfig(value) {
  const source = isObject(value?.data?.config)
    ? value.data.config
    : isObject(value?.config)
      ? value.config
      : isObject(value?.data)
        ? value.data
        : isObject(value)
          ? value
          : {}
  const passwordMinLength = Number(source.passwordMinLength)
  return {
    ...source,
    requireEmailVerification: source.requireEmailVerification !== false,
    passwordMinLength: Number.isFinite(passwordMinLength) && passwordMinLength > 0 ? passwordMinLength : 6,
    verifyEmailMethod: typeof source.verifyEmailMethod === 'string' ? source.verifyEmailMethod : 'code',
    resetPasswordMethod: typeof source.resetPasswordMethod === 'string' ? source.resetPasswordMethod : 'code',
    disableSignup: source.disableSignup === true,
  }
}

export class LooplineApiError extends Error {
  constructor(message, fields = {}) {
    super(message)
    this.name = 'LooplineApiError'
    Object.assign(this, fields, { message })
  }
}

export function normalizeLooplineError(error, fallback = 'The Loopline API request failed.') {
  if (error instanceof LooplineApiError) return error

  const source = isObject(error) ? error : {}
  const nested = isObject(source.error) ? source.error : null
  const code = text(nested?.code)
    || (typeof source.error === 'string' ? source.error : '')
    || text(source.code)
    || 'FUNCTION_ERROR'
  const message = text(nested?.message) || text(source.message) || (typeof error === 'string' ? error.trim() : '') || fallback
  const retryAfterSeconds = nested?.retryAfterSeconds ?? source.retryAfterSeconds
  const rawStatus = nested?.statusCode ?? nested?.status ?? source.statusCode ?? source.status
  const numericStatus = Number(rawStatus)
  const fields = {
    code,
    retryAfterSeconds,
    statusCode: Number.isFinite(numericStatus) && numericStatus > 0 ? numericStatus : undefined,
    cause: error,
  }
  return new LooplineApiError(message, fields)
}

function configError() {
  return new LooplineApiError(MISSING_CONFIG_MESSAGE, { code: 'SERVICE_NOT_CONFIGURED', statusCode: 503 })
}

export function createLooplineApi(client) {
  async function invoke(action, payload = {}) {
    if (!client?.functions || typeof client.functions.invoke !== 'function') throw configError()
    try {
      // The SDK client is shared with auth, so functions.invoke adds its current signed-in session.
      const result = await client.functions.invoke('loopline-api', {
        body: { action, ...payload },
      })
      if (result?.error) throw normalizeLooplineError(result.error)
      if (isObject(result?.data) && isObject(result.data.error)) throw normalizeLooplineError(result.data)
      if (!result || !Object.hasOwn(result, 'data')) throw new LooplineApiError('The Loopline API returned no response.', { code: 'INVALID_RESPONSE' })
      return result.data
    } catch (error) {
      if (error instanceof LooplineApiError) throw error
      throw normalizeLooplineError(error)
    }
  }

  return {
    invoke,
    async listProjects() {
      const data = await invoke('list')
      if (!Array.isArray(data?.projects)) throw new LooplineApiError('The repository list could not be read. Retry to load it again.', { code: 'INVALID_RESPONSE' })
      return data.projects
    },
    connectProject(repository, { requireTestSprite = true } = {}) {
      return invoke('connect', { repository, requireTestSprite })
    },
    getProject(projectId) {
      return invoke('get', { projectId })
    },
    syncProject(projectId, { pullNumber = null } = {}) {
      return invoke('sync', { projectId, pullNumber })
    },
    disconnectProject(projectId) {
      return invoke('disconnect', { projectId })
    },
  }
}

export function createLooplineRuntime(env = viteEnv()) {
  const { config, unavailableReason } = readInsForgePublicConfig(env)
  if (!config) return { client: null, auth: null, api: null, config: null, unavailableReason }

  try {
    const client = createClient(config)
    return {
      client,
      auth: client.auth,
      api: createLooplineApi(client),
      config,
      unavailableReason: '',
    }
  } catch (error) {
    return {
      client: null,
      auth: null,
      api: null,
      config,
      unavailableReason: normalizeLooplineError(error, 'The InsForge client could not be initialized.').message,
    }
  }
}
