import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createQueuedRelease,
  filterReleases,
  medianRunDuration,
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
    ['passed', 'Passed in local simulation'],
    ['passed', 'Passed in local simulation'],
  ])
  assert.ok(checks.every((check) => check.meta === '—'))
})

test('resolves running checks without retaining running copy or inventing counts', () => {
  const source = [
    { name: 'Unit suite', status: 'passed', detail: '128 checks passed', meta: '1m 14s' },
    { name: 'Browser journeys', status: 'running', detail: 'Running in local simulation', meta: '—' },
  ]
  const resolved = resolveChecks(source)
  assert.equal(resolved[0].detail, '128 checks passed')
  assert.equal(resolved[1].detail, 'Passed in local simulation')
  assert.equal(source[1].status, 'running')
})

test('computes the median of listed completed run durations without mutating them', () => {
  const runs = ['03:42', '02:58', '04:16', '03:08'].map((duration) => ({ status: 'passed', duration }))
  assert.equal(medianRunDuration(runs), '03:25')
  assert.deepEqual(runs.map((run) => run.duration), ['03:42', '02:58', '04:16', '03:08'])
  assert.equal(medianRunDuration(runs.slice(0, 3)), '03:42')
  assert.equal(medianRunDuration([{ status: 'failed', duration: '01:01' }, { status: 'passed', duration: '01:02' }]), '01:02')
})

test('excludes queued, running and invalid durations from the median', () => {
  const runs = [
    { status: 'queued', duration: '03:00' },
    { status: 'running', duration: '04:00' },
    ...['—', '', '1:99', '-1:00', '02:02 extra', 'Infinity:00', '999999999999999999:00'].map((duration) => ({ status: 'passed', duration })),
    { status: 'failed', duration: '00:00' },
    { status: 'passed', duration: '02:00' },
  ]
  assert.equal(medianRunDuration(runs), '01:00')
  assert.equal(medianRunDuration([]), '—')
  assert.equal(medianRunDuration(runs.slice(0, -2)), '—')
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
  assert.ok(release.checks.every((check) => check.status === 'queued'))
  assert.equal(release.latestRun.archived, false)
  assert.ok(Number.isFinite(Date.parse(release.latestRun.queuedAt)))
})
