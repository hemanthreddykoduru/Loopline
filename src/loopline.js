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
    detail: check.name === 'Browser journeys'
      ? '18 journeys passed'
      : check.detail.replace(/waiting for verification|need attention|flagged/gi, 'passed'),
  }))
}

export function createQueuedRelease(form, { id, runId }) {
  const name = form.name.trim()
  const version = form.version.trim()
  const branch = form.branch.trim()

  return {
    id,
    name,
    version,
    branch,
    commit: 'pending',
    owner: 'You',
    created: 'Just now',
    lastVerified: 'Not verified',
    duration: '—',
    status: 'queued',
    latestRun: { id: runId, status: 'queued', trigger: 'Manual', duration: '—', time: 'just now' },
    checks: [
      { name: 'Unit suite', status: 'queued', detail: 'Waiting for verification', meta: '—' },
      { name: 'Browser journeys', status: 'queued', detail: 'Waiting for verification', meta: '—' },
      { name: 'Contract checks', status: 'queued', detail: 'Waiting for verification', meta: '—' },
      { name: 'Visual diff', status: 'queued', detail: 'Waiting for verification', meta: '—' },
    ],
  }
}
