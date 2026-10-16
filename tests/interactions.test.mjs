import test, { beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

process.env.NODE_ENV = 'test'

// Compile the real component with the existing toolchain, without writing build files.
const result = await build({
  configFile: false,
  logLevel: 'silent',
  esbuild: { jsx: 'automatic' },
  build: {
    write: false,
    minify: false,
    lib: { entry: fileURLToPath(new URL('../src/App.jsx', import.meta.url)), formats: ['es'] },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime'],
      output: { paths: { react: import.meta.resolve('react'), 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime') } },
    },
  },
})
const bundle = (Array.isArray(result) ? result[0] : result).output.find((entry) => entry.type === 'chunk')
const { default: App } = await import(`data:text/javascript;base64,${Buffer.from(bundle.code).toString('base64')}`)

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement, act, StrictMode } = await import('react')
const { createRoot } = await import('react-dom/client')

let root
let now = 0
let nextTimer = 0
const timers = new Map()
window.setTimeout = (callback, delay = 0) => {
  const id = ++nextTimer
  timers.set(id, { callback, at: now + delay })
  return id
}
window.clearTimeout = (id) => timers.delete(id)

beforeEach(async () => {
  now = 0
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById('root'))
  await act(() => root.render(createElement(StrictMode, null, createElement(App))))
})

afterEach(async () => {
  await act(() => root.unmount())
  const pendingTimers = timers.size
  timers.clear()
  document.body.style.overflow = ''
  assert.equal(pendingTimers, 0, 'Unmounting must clear every local verification and notice timer')
})

after(() => dom.window.close())

const byId = (id) => document.querySelector(`[data-testid="${id}"]`)
const namedButton = (name) => [...document.querySelectorAll('button')].find((button) => (
  button.getAttribute('aria-label') === name || button.textContent.trim() === name
))

async function click(target) {
  const button = typeof target === 'string' ? byId(target) : target
  assert.ok(button, `Missing control: ${target}`)
  await act(() => { button.focus(); button.click() })
}

async function fill(id, value) {
  const input = byId(id)
  assert.ok(input, `Missing input: ${id}`)
  await act(() => {
    if (input.tagName === 'SELECT') input.value = value
    else Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

async function key(value, options = {}) {
  await act(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: value, bubbles: true, cancelable: true, ...options,
  })))
}

async function backdrop(dialogId) {
  const layer = byId(dialogId)?.closest('.modal-layer')
  assert.ok(layer, `Missing backdrop: ${dialogId}`)
  await act(() => layer.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
}

async function advance(milliseconds) {
  const until = now + milliseconds
  let pending
  while ((pending = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= until))) {
    const [id, timer] = pending
    timers.delete(id)
    now = timer.at
    await act(() => timer.callback())
  }
  now = until
}

async function addRelease() {
  await click('new-release-button')
  await fill('new-release-name', 'Billing portal')
  await fill('new-release-version', 'v3.0.0')
  await fill('new-release-branch', 'release/billing')
  await click('create-release')
}

function assertBundleIcon(status) {
  const context = byId('failure-drawer').querySelector('.failure-context')
  assert.equal(context.querySelector('.failure-context-mark svg').innerHTML, byId('failure-bundle-button').querySelector('svg').innerHTML)
  assert.equal(context.getAttribute('data-status'), status)
}

test('a queued release does not claim that its checks have passed', async () => {
  await addRelease()
  const card = [...document.querySelectorAll('.release-card')].find((element) => element.textContent.includes('Billing portal'))
  assert.ok(card)
  assert.match(card.textContent, /Queued/)
  assert.doesNotMatch(card.textContent, /All checks passed/)
  assert.match(byId('run-status').textContent, /Ready to verify/)
})

test('creating a release clears filters so the new candidate is visible', async () => {
  await fill('release-search', 'checkout')
  await fill('release-filter', 'attention')
  await addRelease()
  assert.equal(byId('release-search').value, '')
  assert.equal(byId('release-filter').value, 'all')
  assert.ok([...document.querySelectorAll('.release-card')].some((card) => card.textContent.includes('Billing portal')))
})

test('a verification finishing in the background cannot mark another release passed', async () => {
  await click('run-verification')
  assert.match(byId('run-status').textContent, /Verification in progress/)
  await addRelease()
  await advance(2200)
  assert.match(byId('selected-release').textContent, /Billing portal/)
  assert.match(byId('run-status').textContent, /Ready to verify/)
  assert.match(byId('selected-release').textContent, /Queued/)
})

test('the new release dialog receives focus and restores it on Escape', async () => {
  const opener = byId('new-release-button')
  await click(opener)
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'new-release-name')
  await act(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(byId('new-release-modal'), null)
  assert.ok(document.activeElement === opener, 'Closing the dialog should restore focus to its opener')
})

test('navigation selects each view and marks exactly one current page', async () => {
  for (const [id, title] of [
    ['nav-releases', 'Release directory'],
    ['nav-test-runs', 'Test runs'],
    ['nav-settings', 'Verification settings'],
    ['nav-overview', 'Release verification'],
  ]) {
    await click(id)
    assert.equal(document.querySelector('h1').textContent, title)
    assert.equal(byId(id).getAttribute('aria-current'), 'page')
    assert.equal(document.querySelectorAll('nav [aria-current="page"]').length, 1)
  }
  await click('nav-test-runs')
  await click(namedButton('Browse releases'))
  assert.equal(document.querySelector('h1').textContent, 'Release directory')
})

test('every sample release card and run row selects its own candidate', async () => {
  for (const [releaseId, runId, name] of [
    ['release-217', 'run-8038', 'Team permissions'],
    ['release-216', 'run-8024', 'Usage insights'],
    ['release-215', 'run-8012', 'Notification center'],
    ['release-218', 'run-8042', 'Checkout refresh'],
  ]) {
    await click(`release-card-${releaseId}`)
    assert.equal(byId('selected-release').querySelector('h2').textContent, name)
    assert.equal(byId(`release-card-${releaseId}`).getAttribute('aria-pressed'), 'true')
    assert.equal(document.querySelectorAll('.release-card[aria-pressed="true"]').length, 1)
    await click('nav-test-runs')
    await click(`run-row-${runId}`)
    assert.equal(document.querySelector('h1').textContent, 'Release directory')
    assert.equal(byId('selected-release').querySelector('h2').textContent, name)
  }
})

test('search, status filters, empty state and reset work together', async () => {
  for (const query of ['CHECKOUT', 'v2.18.0', 'release/checkout-refresh', '6f23a91']) {
    await fill('release-search', query)
    assert.equal(document.querySelectorAll('.release-card').length, 1)
    assert.match(document.querySelector('.release-card').textContent, /Checkout refresh/)
  }
  await fill('release-filter', 'passed')
  assert.equal(document.querySelectorAll('.release-card').length, 0)
  assert.match(document.querySelector('.empty-state').textContent, /No matching releases/)
  await click('empty-new-release')
  assert.ok(byId('new-release-modal'))
  await click('cancel-new-release')
  assert.equal(document.querySelectorAll('.release-card').length, 0)
  await click('clear-release-filters')
  assert.equal(byId('release-search').value, '')
  assert.equal(byId('release-filter').value, 'all')
  assert.equal(document.querySelectorAll('.release-card').length, 4)
  assert.equal(byId('clear-release-filters'), null)
  await fill('release-filter', 'passed')
  assert.equal(document.querySelectorAll('.release-card').length, 3)
  await fill('release-filter', 'attention')
  assert.equal(document.querySelectorAll('.release-card').length, 1)
})

test('the release form announces required errors, corrects them and resets after creation', async () => {
  await click('new-release-button')
  await click('create-release')
  for (const field of ['name', 'version', 'branch']) {
    const input = byId(`new-release-${field}`)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.ok(document.getElementById(input.getAttribute('aria-describedby'))?.textContent)
  }
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'new-release-name')
  await fill('new-release-name', '  Billing portal  ')
  assert.equal(byId('new-release-name').getAttribute('aria-invalid'), 'false')
  assert.equal(byId('new-release-name').hasAttribute('aria-describedby'), false)
  await fill('new-release-version', '   ')
  await fill('new-release-branch', ' release/billing ')
  await click('create-release')
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'new-release-version')
  assert.ok(byId('new-release-modal'))
  await fill('new-release-version', ' v3.0.0 ')
  await click('create-release')
  assert.equal(byId('new-release-modal'), null)
  assert.equal(document.querySelectorAll('.release-card').length, 5)
  assert.equal(byId('selected-release').querySelector('h2').textContent, 'Billing portal')
  assert.match(byId('selected-release').textContent, /v3\.0\.0/)
  await click('new-release-button')
  assert.ok(['name', 'version', 'branch'].every((field) => byId(`new-release-${field}`).value === ''))
  await click('close-new-release')
  assert.equal(byId('new-release-modal'), null)
  assert.equal(document.querySelectorAll('.release-card').length, 5)
})

test('dialogs trap boundary focus, isolate the background and unlock on dismissal', async () => {
  document.body.style.overflow = 'scroll'
  await click('new-release-button')
  const dialog = byId('new-release-modal')
  assert.equal(dialog.getAttribute('role'), 'dialog')
  assert.equal(dialog.getAttribute('aria-modal'), 'true')
  assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent)
  assert.equal(document.body.style.overflow, 'hidden')
  assert.ok(document.querySelector('main').hasAttribute('inert'))
  assert.equal(document.querySelector('aside').getAttribute('aria-hidden'), 'true')
  byId('create-release').focus()
  await key('Tab')
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'close-new-release')
  await key('Tab', { shiftKey: true })
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'create-release')
  byId('nav-settings').focus()
  assert.ok(dialog.contains(document.activeElement), 'Programmatic background focus must return to the dialog')
  await act(() => dialog.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  assert.ok(byId('new-release-modal'), 'Clicking the dialog itself must not dismiss it')
  await backdrop('new-release-modal')
  assert.equal(byId('new-release-modal'), null)
  assert.equal(document.body.style.overflow, 'scroll')
  assert.equal(document.querySelector('main').hasAttribute('inert'), false)
  assert.equal(document.querySelector('aside').hasAttribute('aria-hidden'), false)
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'new-release-button')
})

for (const [controlId, kind, title, content, view] of [
  ['workspace-info-button', 'workspace-info', 'Workspace information', /4 candidates.*0 running/],
  ['account-info-button', 'account-info', 'Account information', /not an authenticated account/],
  ['release-info-button', 'release-info', 'Release information', /Checkout refresh.*v2\.18\.0/],
  ['help-button', 'help', 'Loopline help', /Escape, Close, and the backdrop/],
  ['notifications-button', 'notifications', 'Notifications', /No local verification notices yet/],
  ['sample-data-button', 'integration-status', 'Integration status', /TestSpriteNot connected/],
  ['integration-status-button', 'integration-status', 'Integration status', /RepositoryNot connected/, 'nav-settings'],
  ['view-all-activity', 'activity', 'All local activity', /Checkout refresh requires review/],
]) {
  test(`${controlId} opens its local dialog and both dismissal buttons restore focus`, async () => {
    if (view) await click(view)
    const opener = byId(controlId)
    for (const dismissal of ['close', 'done']) {
      await click(opener)
      const dialog = byId(`${kind}-dialog`)
      assert.ok(dialog)
      assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, title)
      assert.match(dialog.textContent, content)
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
      await click(`${kind}-dialog-${dismissal}`)
      assert.equal(byId(`${kind}-dialog`), null)
      assert.ok(document.activeElement === opener, 'Return focus to the actual utility control')
    }
  })
}

test('the failure bundle exposes a sample failure and applying its fix resolves only that release', async () => {
  await click('failure-bundle-button')
  assert.match(byId('bundle-status').textContent, /Review failed checks/)
  assertBundleIcon('failed')
  assert.equal(document.querySelectorAll('.failure-card').length, 1)
  assert.match(document.querySelector('.failure-code').textContent, /1200ms/)
  assert.equal(byId('apply-suggested-fix').disabled, false)
  await click('close-verification-bundle')
  assert.equal(byId('failure-drawer'), null)
  assert.equal(document.activeElement?.getAttribute('data-testid'), 'failure-bundle-button')
  await click('failure-bundle-button')
  await click('apply-suggested-fix')
  assert.equal(byId('failure-drawer'), null)
  assert.match(byId('run-status').textContent, /All gates passed/)
  assert.equal(byId('run-verification').textContent.trim(), 'Run again')
  assert.ok([...document.querySelectorAll('.check-row')].every((row) => row.dataset.status === 'passed'))
  assert.match(byId('local-notice').textContent, /no code changed/)
  await click('failure-bundle-button')
  assert.match(byId('bundle-status').textContent, /All checks passed/)
  assertBundleIcon('passed')
  assert.equal(byId('apply-suggested-fix').disabled, true)
  await backdrop('failure-drawer')
  await click('release-card-release-217')
  assert.match(byId('selected-release').textContent, /Completed 1 hr ago/)
  assert.equal(byId('verification-progress').getAttribute('aria-valuenow'), '4')
})

test('queued and running bundles cannot claim success or apply a fix', async () => {
  await addRelease()
  assert.equal(byId('verification-progress').getAttribute('aria-valuenow'), '0')
  assert.ok([...document.querySelectorAll('.check-row')].every((row) => row.dataset.status === 'queued'))
  await click('failure-bundle-button')
  assert.match(byId('bundle-status').textContent, /Waiting for verification/)
  assertBundleIcon('queued')
  assert.doesNotMatch(byId('failure-drawer').textContent, /All checks passed/)
  assert.equal(byId('apply-suggested-fix').disabled, true)
  await key('Escape')
  await click('run-verification')
  assert.equal(byId('run-verification').disabled, true)
  assert.equal(byId('verification-progress').hasAttribute('aria-valuenow'), false)
  assert.match(byId('verification-progress').getAttribute('aria-valuetext'), /indeterminate/)
  assert.ok([...document.querySelectorAll('.check-row')].every((row) => row.dataset.status === 'running'))
  await click('failure-bundle-button')
  assert.match(byId('bundle-status').textContent, /Verification in progress/)
  assertBundleIcon('running')
  assert.equal(byId('apply-suggested-fix').disabled, true)
  await advance(2199)
  assert.match(byId('bundle-status').textContent, /Verification in progress/)
  await advance(1)
  assert.match(byId('bundle-status').textContent, /All checks passed/)
  assert.equal(byId('apply-suggested-fix').disabled, true)
  await click('close-verification-bundle')
  assert.equal(byId('run-verification').disabled, false)
  assert.equal(byId('verification-progress').getAttribute('aria-valuenow'), '4')
})

test('concurrent release runs complete independently and reject duplicate starts', async () => {
  await click('run-verification')
  const firstRunId = document.querySelector('.run-id').textContent
  await click('run-verification')
  assert.equal(document.querySelector('.run-id').textContent, firstRunId)
  await advance(500)
  await click('release-card-release-217')
  assert.match(byId('run-status').textContent, /All gates passed/)
  await click('run-verification')
  const secondRunId = document.querySelector('.run-id').textContent
  assert.notEqual(secondRunId, firstRunId)
  await click('nav-overview')
  assert.equal(document.querySelector('.metric-amber strong').textContent, '2')
  await click('nav-test-runs')
  await click(`run-row-${firstRunId}`)
  assert.match(byId('selected-release').textContent, /Checkout refresh/)
  assert.match(byId('run-status').textContent, /Verification in progress/)
  await advance(1700)
  assert.match(byId('run-status').textContent, /All gates passed/)
  await click('release-card-release-217')
  assert.match(byId('run-status').textContent, /Verification in progress/)
  await advance(500)
  assert.match(byId('run-status').textContent, /All gates passed/)
  await click('run-verification')
  assert.notEqual(document.querySelector('.run-id').textContent, secondRunId)
  await advance(2200)
  assert.match(byId('run-status').textContent, /All gates passed/)
  await click('nav-overview')
  assert.equal(document.querySelector('.metric-amber strong').textContent, '—')
})

test('settings persist across views and control local notifications and bundle archives', async () => {
  await click('nav-settings')
  assert.equal(byId('setting-alerts').checked, true)
  assert.equal(byId('setting-auto-archive').checked, true)
  await click('setting-alerts')
  await click('setting-auto-archive')
  await click('nav-releases')
  await click('run-verification')
  assert.equal(byId('local-notice'), null)
  await advance(2200)
  assert.equal(byId('local-notice'), null)
  await click('failure-bundle-button')
  assert.match(byId('bundle-archive-status').textContent, /not archived/)
  await click('close-verification-bundle')
  await click('notifications-button')
  assert.ok(byId('notifications-empty'))
  assert.match(byId('notifications-dialog').textContent, /Disabled/)
  await click('notifications-dialog-done')
  await click('nav-settings')
  assert.equal(byId('setting-alerts').checked, false)
  assert.equal(byId('setting-auto-archive').checked, false)
  await click('setting-alerts')
  await click('setting-auto-archive')
  await click('nav-releases')
  await click('run-verification')
  assert.match(byId('local-notice').textContent, /Verification started/)
  await click('notifications-button')
  assert.equal(byId('notifications-list').children.length, 1)
  await advance(2200)
  assert.equal(byId('notifications-list').children.length, 2)
  assert.match(byId('notifications-list').textContent, /passed the local verification simulation/)
  assert.ok(byId('notifications-dialog').contains(document.activeElement))
  await click('notifications-dialog-done')
  await click('failure-bundle-button')
  assert.match(byId('bundle-archive-status').textContent, /^Bundle archived in this session/)
})

test('changes to preferences during a run take effect without removing retained notifications', async () => {
  await click('run-verification')
  await click('nav-settings')
  await click('setting-alerts')
  await click('setting-auto-archive')
  await advance(2200)
  await click('notifications-button')
  assert.equal(byId('notifications-list').children.length, 1)
  assert.match(byId('notifications-list').textContent, /Verification started/)
  await key('Escape')
  await click('nav-releases')
  assert.match(byId('run-status').textContent, /All gates passed/)
  await click('failure-bundle-button')
  assert.match(byId('bundle-archive-status').textContent, /not archived/)
})

test('View all retains activity older than the recent list and rapid additions have unique IDs', async () => {
  await addRelease()
  await addRelease()
  const ids = [...document.querySelectorAll('.release-card')].map((card) => card.dataset.testid)
  assert.equal(ids.length, 6)
  assert.equal(new Set(ids).size, 6)
  await click('nav-overview')
  assert.equal(byId('recent-activity-list').children.length, 5)
  assert.doesNotMatch(byId('recent-activity-list').textContent, /Notification center released/)
  await click('view-all-activity')
  assert.equal(byId('all-activity-list').children.length, 6)
  assert.match(byId('all-activity-list').textContent, /Notification center released/)
})

test('replacing a notice restarts its expiry without losing retained notifications', async () => {
  await click('run-verification')
  await advance(2200)
  assert.match(byId('local-notice').textContent, /passed the local verification simulation/)
  await advance(3599)
  assert.ok(byId('local-notice'))
  await advance(1)
  assert.equal(byId('local-notice'), null)
  await click('notifications-button')
  assert.equal(byId('notifications-list').children.length, 2)
})

test('unmounting with a running verification and open dialog releases focus and scroll isolation', async () => {
  await click('run-verification')
  await click('help-button')
  assert.equal(document.body.style.overflow, 'hidden')
  await act(() => root.render(null))
  assert.equal(timers.size, 0)
  assert.equal(document.body.style.overflow, '')
  assert.equal(document.querySelector('[inert]'), null)
  await act(() => root.render(createElement(StrictMode, null, createElement(App))))
  assert.match(byId('run-status').textContent, /Needs attention/)
  await advance(10000)
  assert.match(byId('run-status').textContent, /Needs attention/)
})
