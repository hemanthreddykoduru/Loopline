import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createQueuedRelease,
  filterReleases,
  resolveChecks,
  validateReleaseForm,
} from '../src/loopline.js'

const releases = [
  { name: 'Checkout refresh', version: 'v2.18.0', branch: 'release/checkout', commit: '6f23a91', status: 'attention' },
  { name: 'Team permissions', version: 'v2.17.4', branch: 'release/permissions', commit: 'a84d10c', status: 'passed' },
]

test('filters releases by a case-insensitive search and status', () => {
  assert.equal(filterReleases(releases, 'CHECKOUT').length, 1)
  assert.equal(filterReleases(releases, '', 'passed')[0].name, 'Team permissions')
  assert.equal(filterReleases(releases, 'missing').length, 0)
})

test('validates the three required release fields', () => {
  assert.deepEqual(validateReleaseForm({ name: '', version: ' ', branch: '' }), {
    name: 'Add a release name.',
    version: 'Add a version label.',
    branch: 'Add the source branch.',
  })
  assert.deepEqual(validateReleaseForm({ name: 'Billing', version: 'v1.0.0', branch: 'release/billing' }), {})
})

test('resolves every check and replaces stale waiting copy', () => {
  const checks = resolveChecks([
    { name: 'Unit suite', status: 'queued', detail: 'Waiting for verification', meta: '—' },
    { name: 'Browser journeys', status: 'failed', detail: '2 journeys need attention', meta: '1m' },
  ])
  assert.deepEqual(checks.map(({ status, detail }) => [status, detail]), [
    ['passed', 'passed'],
    ['passed', '18 journeys passed'],
  ])
})

test('creates a queued release with normalized user input', () => {
  const release = createQueuedRelease(
    { name: '  Billing portal ', version: ' v1.2.0 ', branch: ' release/billing ' },
    { id: 'release-test', runId: 'run-test' },
  )
  assert.equal(release.name, 'Billing portal')
  assert.equal(release.version, 'v1.2.0')
  assert.equal(release.branch, 'release/billing')
  assert.equal(release.status, 'queued')
  assert.equal(release.checks.length, 4)
})
