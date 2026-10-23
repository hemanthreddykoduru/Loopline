export function filterReleases(releases, search = '', filter = 'all') {
  const query = search.trim().toLowerCase()

  return releases.filter((release) => {
    const matchesQuery = !query || [release.name, release.version, release.branch, release.commit]
      .some((value) => value.toLowerCase().includes(query))
    const matchesFilter = filter === 'all' || release.status === filter
    return matchesQuery && matchesFilter
  })
}

export function validateReleaseForm(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Add a release name.'
  if (!form.version.trim()) errors.version = 'Add a version label.'
  if (!form.branch.trim()) errors.branch = 'Add the source branch.'
  return errors
}

export function resolveChecks(checks) {
  return checks.map((check) => ({
    ...check,
    status: 'passed',
    detail: check.status === 'passed' ? check.detail : 'Passed in local simulation',
    meta: check.status === 'passed' ? check.meta : '—',
  }))
}

export function medianRunDuration(runs) {
  const seconds = runs.flatMap((run) => {
    if (!['passed', 'failed'].includes(run.status)) return []
    const match = /^(\d+):([0-5]\d)$/.exec(run.duration || '')
    if (!match) return []
    const value = Number(match[1]) * 60 + Number(match[2])
    return Number.isSafeInteger(value) ? [value] : []
  }).sort((left, right) => left - right)
  if (!seconds.length) return '—'

  const middle = Math.floor(seconds.length / 2)
  const median = Math.round(seconds.length % 2 ? seconds[middle] : (seconds[middle - 1] + seconds[middle]) / 2)
  return `${String(Math.floor(median / 60)).padStart(2, '0')}:${String(median % 60).padStart(2, '0')}`
}

export function createQueuedRelease(form, { id, runId }) {
  const name = form.name.trim()
  const version = form.version.trim()
  const branch = form.branch.trim()
  const queuedAt = new Date().toISOString()
  const time = new Date(queuedAt).toLocaleString()

  return {
    id,
    name,
    version,
    branch,
    commit: 'pending',
    owner: 'You',
    created: time,
    lastVerified: 'Not verified',
    duration: '—',
    status: 'queued',
    latestRun: { id: runId, status: 'queued', trigger: 'Manual (demo)', duration: '—', time, queuedAt, archived: false },
    checks: [
      { name: 'Unit suite', status: 'queued', detail: 'Waiting for verification', meta: '—' },
      { name: 'Browser journeys', status: 'queued', detail: 'Waiting for verification', meta: '—' },
      { name: 'Contract checks', status: 'queued', detail: 'Waiting for verification', meta: '—' },
      { name: 'Visual diff', status: 'queued', detail: 'Waiting for verification', meta: '—' },
    ],
  }
}
