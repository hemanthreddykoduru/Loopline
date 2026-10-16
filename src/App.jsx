import { useEffect, useMemo, useRef, useState } from 'react'
import { createQueuedRelease, filterReleases, resolveChecks, validateReleaseForm } from './loopline.js'

const initialReleases = [
  {
    id: 'release-218',
    name: 'Checkout refresh',
    version: 'v2.18.0',
    branch: 'release/checkout-refresh',
    commit: '6f23a91',
    owner: 'Maya Chen',
    created: 'Nov 18, 09:42',
    lastVerified: '12 min ago',
    duration: '03:42',
    status: 'attention',
    latestRun: {
      id: 'run-8042',
      status: 'failed',
      trigger: 'PR merged',
      duration: '03:42',
      time: '12 min ago',
    },
    checks: [
      { name: 'Unit suite', status: 'passed', detail: '128 checks passed', meta: '1m 14s' },
      { name: 'Browser journeys', status: 'failed', detail: '2 journeys need attention', meta: '1m 56s' },
      { name: 'Contract checks', status: 'passed', detail: '24 contracts passed', meta: '32s' },
      { name: 'Visual diff', status: 'passed', detail: 'No unexpected changes', meta: '00s' },
    ],
  },
  {
    id: 'release-217',
    name: 'Team permissions',
    version: 'v2.17.4',
    branch: 'release/team-permissions',
    commit: 'a84d10c',
    owner: 'Noah Williams',
    created: 'Nov 17, 16:08',
    lastVerified: '1 hr ago',
    duration: '02:58',
    status: 'passed',
    latestRun: {
      id: 'run-8038',
      status: 'passed',
      trigger: 'Scheduled',
      duration: '02:58',
      time: '1 hr ago',
    },
    checks: [
      { name: 'Unit suite', status: 'passed', detail: '96 checks passed', meta: '58s' },
      { name: 'Browser journeys', status: 'passed', detail: '18 journeys passed', meta: '1m 23s' },
      { name: 'Contract checks', status: 'passed', detail: '20 contracts passed', meta: '37s' },
      { name: 'Visual diff', status: 'passed', detail: 'No unexpected changes', meta: '00s' },
    ],
  },
  {
    id: 'release-216',
    name: 'Usage insights',
    version: 'v2.16.2',
    branch: 'release/usage-insights',
    commit: 'c91ab7e',
    owner: 'Priya Shah',
    created: 'Nov 16, 11:26',
    lastVerified: 'Yesterday',
    duration: '04:16',
    status: 'passed',
    latestRun: {
      id: 'run-8024',
      status: 'passed',
      trigger: 'Manual',
      duration: '04:16',
      time: 'Yesterday',
    },
    checks: [
      { name: 'Unit suite', status: 'passed', detail: '142 checks passed', meta: '1m 36s' },
      { name: 'Browser journeys', status: 'passed', detail: '22 journeys passed', meta: '1m 59s' },
      { name: 'Contract checks', status: 'passed', detail: '28 contracts passed', meta: '41s' },
      { name: 'Visual diff', status: 'passed', detail: 'No unexpected changes', meta: '00s' },
    ],
  },
  {
    id: 'release-215',
    name: 'Notification center',
    version: 'v2.15.1',
    branch: 'release/notification-center',
    commit: '49d6e2b',
    owner: 'Ari Cole',
    created: 'Nov 14, 14:04',
    lastVerified: 'Nov 14',
    duration: '03:08',
    status: 'passed',
    latestRun: {
      id: 'run-8012',
      status: 'passed',
      trigger: 'PR merged',
      duration: '03:08',
      time: 'Nov 14',
    },
    checks: [
      { name: 'Unit suite', status: 'passed', detail: '110 checks passed', meta: '1m 08s' },
      { name: 'Browser journeys', status: 'passed', detail: '16 journeys passed', meta: '1m 21s' },
      { name: 'Contract checks', status: 'passed', detail: '22 contracts passed', meta: '39s' },
      { name: 'Visual diff', status: 'passed', detail: 'No unexpected changes', meta: '00s' },
    ],
  },
]

const initialActivity = [
  {
    id: 'activity-1',
    tone: 'rose',
    title: 'Checkout refresh requires review',
    detail: 'Browser journeys found 2 checkout edge cases.',
    time: '12 min ago',
  },
  {
    id: 'activity-2',
    tone: 'success',
    title: 'Team permissions verified',
    detail: 'All release checks passed.',
    time: '1 hr ago',
  },
  {
    id: 'activity-3',
    tone: 'amber',
    title: 'Usage insights queued',
    detail: 'Scheduled verification started from main.',
    time: 'Yesterday',
  },
  {
    id: 'activity-4',
    tone: 'success',
    title: 'Notification center released',
    detail: 'Verification bundle archived with the release.',
    time: 'Nov 14',
  },
]

const statusCopy = {
  passed: { label: 'Verified', className: 'status-passed' },
  attention: { label: 'Needs attention', className: 'status-attention' },
  failed: { label: 'Failed', className: 'status-attention' },
  running: { label: 'Verifying', className: 'status-running' },
  queued: { label: 'Queued', className: 'status-queued' },
}

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
        <path d="m5.2 11.1-1.7.9L12 16.5l8.5-4.5-1.7-.9" />
        <path d="m5.2 15.1-1.7.9 8.5 4.5 8.5-4.5-1.7-.9" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v5.2L5.5 16a3 3 0 0 0 2.6 4.5h7.8a3 3 0 0 0 2.6-4.5L14 8.2V3" />
        <path d="M7.3 15h9.4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.6h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.6v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.6H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.4" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    external: (
      <>
        <path d="M14 5h5v5" />
        <path d="m19 5-8 8" />
        <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    alert: (
      <>
        <path d="M12 4 3.5 19h17L12 4Z" />
        <path d="M12 9v4.5M12 16.5h.01" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    pulse: (
      <>
        <path d="M3 12h4l2-6 4.5 12 2-6H21" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="19" r="2" />
        <circle cx="18" cy="7" r="2" />
        <path d="M6 7v4a4 4 0 0 0 4 4h6M6 7v12" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.2 2" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
      </>
    ),
    wand: (
      <>
        <path d="m4 20 11-11" />
        <path d="m14 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
        <path d="m18 14 .7-1.3.8 1.3 1.3.7-1.3.7-.8 1.3-.7-1.3-1.3-.7 1.3-.7Z" />
        <path d="m5 5 .6-1.2L6.2 5l1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6L5 5Z" />
      </>
    ),
    dots: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
    shield: (
      <>
        <path d="M12 3 19 6v5c0 4.5-2.7 8-7 10-4.3-2-7-5.5-7-10V6l7-3Z" />
        <path d="m8.7 12 2.1 2.1 4.5-4.5" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h7M15 7h5M4 17h3M11 17h9" />
        <circle cx="13" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.grid}
    </svg>
  )
}

function StatusPill({ status, compact = false }) {
  const copy = statusCopy[status] || statusCopy.queued
  return (
    <span className={`status-pill ${copy.className} ${compact ? 'status-compact' : ''}`}>
      <span className="status-dot" aria-hidden="true" />
      {copy.label}
    </span>
  )
}

function MetricCard({ label, value, detail, tone = 'neutral', icon }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon"><Icon name={icon} size={16} /></span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function ReleaseCard({ release, selected, onSelect }) {
  const failedCount = release.checks.filter((check) => check.status === 'failed').length
  return (
    <button
      type="button"
      className={`release-card ${selected ? 'release-card-selected' : ''}`}
      onClick={() => onSelect(release.id)}
      aria-pressed={selected}
      data-testid={`release-card-${release.id}`}
      aria-label={`Select ${release.name} ${release.version}`}
    >
      <span className="release-card-topline">
        <span className="release-version">{release.version}</span>
        <StatusPill status={release.status} compact />
      </span>
      <span className="release-card-name">{release.name}</span>
      <span className="release-card-branch"><Icon name="branch" size={13} /> {release.branch}</span>
      <span className="release-card-bottomline">
        <span>{failedCount ? `${failedCount} check${failedCount > 1 ? 's' : ''} failed` : 'All checks passed'}</span>
        <span>{release.lastVerified}</span>
      </span>
    </button>
  )
}

function CheckRow({ check }) {
  const passed = check.status === 'passed'
  return (
    <li className={`check-row check-${check.status}`}>
      <span className="check-icon" aria-hidden="true"><Icon name={passed ? 'check' : 'alert'} size={14} /></span>
      <span className="check-copy">
        <strong>{check.name}</strong>
        <span>{check.detail}</span>
      </span>
      <span className="check-meta">{check.meta}</span>
    </li>
  )
}

function PageHeading({ eyebrow, title, children, description }) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="page-heading-actions">{children}</div> : null}
    </header>
  )
}

function EmptyReleases({ onCreate }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="layers" size={20} /></span>
      <h3>No matching releases</h3>
      <p>Try a different search or add a release to verify it.</p>
      <button type="button" className="button button-secondary" onClick={onCreate} data-testid="empty-new-release">
        <Icon name="plus" size={16} /> New release
      </button>
    </div>
  )
}

function App() {
  const [activeView, setActiveView] = useState('overview')
  const [releases, setReleases] = useState(initialReleases)
  const [selectedId, setSelectedId] = useState(initialReleases[0].id)
  const [runState, setRunState] = useState(null)
  const [failureOpen, setFailureOpen] = useState(false)
  const [newReleaseOpen, setNewReleaseOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [activity, setActivity] = useState(initialActivity)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ name: '', version: '', branch: '' })
  const [formErrors, setFormErrors] = useState({})
  const [autoArchive, setAutoArchive] = useState(true)
  const [slackAlerts, setSlackAlerts] = useState(false)
  const runTimerRef = useRef(null)
  const noticeTimerRef = useRef(null)

  const selectedRelease = releases.find((release) => release.id === selectedId) || releases[0]
  const selectedRunStatus = runState || selectedRelease?.latestRun.status || 'queued'
  const selectedFailedChecks = selectedRelease?.checks.filter((check) => check.status === 'failed') || []

  const filteredReleases = useMemo(() => {
    return filterReleases(releases, search, filter)
  }, [filter, releases, search])

  const passedCount = releases.filter((release) => release.status === 'passed').length
  const attentionCount = releases.filter((release) => release.status === 'attention').length
  const runningCount = releases.filter((release) => release.status === 'running').length

  useEffect(() => {
    return () => {
      window.clearTimeout(runTimerRef.current)
      window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!failureOpen && !newReleaseOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setFailureOpen(false)
        setNewReleaseOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [failureOpen, newReleaseOpen])

  function showNotice(message) {
    setNotice(message)
    window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 3600)
  }

  function addActivity(entry) {
    setActivity((current) => [{ ...entry, id: `${entry.id}-${Date.now()}` }, ...current].slice(0, 6))
  }

  function updateRelease(releaseId, updater) {
    setReleases((current) => current.map((release) => (release.id === releaseId ? updater(release) : release)))
  }

  function selectRelease(releaseId) {
    if (runState === 'running') return
    setSelectedId(releaseId)
    setRunState(null)
  }

  function runVerification() {
    if (!selectedRelease || runState === 'running') return
    const releaseId = selectedRelease.id
    setRunState('running')
    updateRelease(releaseId, (release) => ({
      ...release,
      status: 'running',
      latestRun: { ...release.latestRun, status: 'running', time: 'just now' },
    }))
    addActivity({
      tone: 'amber',
      title: `${selectedRelease.name} is verifying`,
      detail: 'Release checks are running.',
      time: 'just now',
    })
    showNotice(`Verification started for ${selectedRelease.version}`)
    window.clearTimeout(runTimerRef.current)
    runTimerRef.current = window.setTimeout(() => {
      setRunState('passed')
      updateRelease(releaseId, (release) => ({
        ...release,
        status: 'passed',
        lastVerified: 'just now',
        duration: '02:41',
        latestRun: { ...release.latestRun, status: 'passed', duration: '02:41', time: 'just now' },
         checks: resolveChecks(release.checks),
      }))
      addActivity({
        tone: 'success',
        title: `${selectedRelease.name} verified`,
        detail: 'All release checks passed.',
        time: 'just now',
      })
      showNotice(`${selectedRelease.version} is verified and ready for release`)
    }, 2200)
  }

  function applySuggestedFix() {
    if (!selectedRelease) return
    const releaseId = selectedRelease.id
    updateRelease(releaseId, (release) => ({
      ...release,
      status: 'passed',
      lastVerified: 'just now',
      latestRun: { ...release.latestRun, status: 'passed', time: 'just now' },
       checks: resolveChecks(release.checks),
    }))
    setRunState('passed')
    setFailureOpen(false)
    addActivity({
      tone: 'success',
      title: `Suggested fix applied to ${selectedRelease.name}`,
      detail: 'The failed browser journeys now pass.',
      time: 'just now',
    })
    showNotice('Suggested fix applied. Release marked verified.')
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (formErrors[field]) setFormErrors((current) => ({ ...current, [field]: '' }))
  }

  function createRelease(event) {
    event.preventDefault()
    const errors = validateReleaseForm(form)
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const timestamp = Date.now()
    const id = `release-${timestamp}`
    const newRelease = createQueuedRelease(form, { id, runId: `run-${timestamp}` })
    setReleases((current) => [newRelease, ...current])
    setSelectedId(id)
    setRunState(null)
    setNewReleaseOpen(false)
    setForm({ name: '', version: '', branch: '' })
    setFormErrors({})
    setActiveView('releases')
    addActivity({
      tone: 'amber',
      title: `${newRelease.name} added to releases`,
      detail: `${newRelease.version} is ready for its first verification.`,
      time: 'just now',
    })
    showNotice(`${newRelease.version} added. Run verification when ready.`)
  }

  function openNewRelease() {
    setFormErrors({})
    setNewReleaseOpen(true)
  }

  function renderReleaseDirectory({ compact = false } = {}) {
    return (
      <section className={`panel release-directory ${compact ? 'release-directory-compact' : ''}`}>
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Release queue</div>
            <h2>{compact ? 'All releases' : 'Releases in verification'}</h2>
          </div>
          <span className="panel-count">{filteredReleases.length} visible</span>
        </div>
        <div className="filter-row">
          <label className="search-field">
            <span className="sr-only">Search releases</span>
            <Icon name="search" size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search releases"
              data-testid="release-search"
            />
          </label>
          <label className="select-field">
            <span className="sr-only">Filter releases by status</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="release-filter">
              <option value="all">All statuses</option>
              <option value="passed">Verified</option>
              <option value="attention">Needs attention</option>
              <option value="running">Verifying</option>
              <option value="queued">Queued</option>
            </select>
            <Icon name="chevron" size={14} />
          </label>
          {search || filter !== 'all' ? (
            <button
              type="button"
              className="text-button filter-reset"
              onClick={() => { setSearch(''); setFilter('all') }}
              data-testid="clear-release-filters"
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {filteredReleases.length ? (
          <div className="release-list">
            {filteredReleases.map((release) => (
              <ReleaseCard key={release.id} release={release} selected={selectedId === release.id} onSelect={selectRelease} />
            ))}
          </div>
        ) : (
          <EmptyReleases onCreate={openNewRelease} />
        )}
      </section>
    )
  }

  function renderDetailPanel({ standalone = false } = {}) {
    if (!selectedRelease) return null
    const isRunning = selectedRunStatus === 'running'
    const isPassed = selectedRunStatus === 'passed'
    const progress = isRunning ? 48 : isPassed ? 100 : selectedRunStatus === 'failed' ? 72 : 12
    const failedCount = selectedRelease.checks.filter((check) => check.status === 'failed').length
    return (
      <section className={`panel detail-panel ${standalone ? 'detail-panel-standalone' : ''}`} data-testid="selected-release">
        <div className="detail-topline">
          <div className="panel-kicker">Selected release</div>
          <StatusPill status={selectedRelease.status === 'running' || isRunning ? 'running' : isPassed ? 'passed' : selectedRelease.status} />
        </div>
        <div className="detail-title-row">
          <div>
            <h2>{selectedRelease.name}</h2>
            <span className="detail-version">{selectedRelease.version} <span>·</span> {selectedRelease.owner}</span>
          </div>
           <button type="button" className="icon-button" aria-label="More release options" title="More release options" onClick={() => showNotice('Release actions are unavailable without a live integration.')}>
            <Icon name="dots" size={18} />
          </button>
        </div>
        <div className="commit-line">
          <span className="commit-chip"><Icon name="branch" size={14} /> {selectedRelease.branch}</span>
          <span className="commit-hash">{selectedRelease.commit === 'pending' ? 'awaiting commit' : `commit ${selectedRelease.commit}`}</span>
        </div>

        <div className={`run-summary ${isRunning ? 'run-summary-running' : isPassed ? 'run-summary-passed' : ''}`}>
          <div className="run-summary-head">
            <div>
              <span className="summary-label">Latest verification</span>
              <strong data-testid="run-status" aria-live="polite">
                {isRunning ? 'Verification in progress' : isPassed ? 'All gates passed' : selectedRunStatus === 'failed' ? 'Needs attention' : 'Ready to verify'}
              </strong>
            </div>
            <span className="run-id">{selectedRelease.latestRun.id}</span>
          </div>
           <div className="progress-track" aria-label={`${progress}% complete`}>
             <span style={{ '--progress': progress / 100 }} />
          </div>
          <div className="run-summary-foot">
            <span>{isRunning ? 'Running release gates' : isPassed ? 'Completed just now' : selectedRelease.latestRun.time}</span>
            <span>{isRunning ? 'Estimating 2–4 min' : selectedRelease.duration === '—' ? 'No run yet' : selectedRelease.duration}</span>
          </div>
        </div>

        <div className="detail-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={runVerification}
            disabled={isRunning}
            data-testid="run-verification"
          >
            <Icon name={isRunning ? 'pulse' : 'play'} size={16} />
            {isRunning ? 'Running verification' : isPassed ? 'Run again' : 'Run verification'}
          </button>
          <button type="button" className="button button-secondary" onClick={() => setFailureOpen(true)} data-testid="failure-bundle-button">
            <Icon name="alert" size={16} />
            {failedCount ? `Failure bundle · ${failedCount}` : 'View verification bundle'}
          </button>
        </div>

        <div className="checks-heading">
          <span>Release checks</span>
          <span>{selectedRelease.checks.filter((check) => check.status === 'passed').length}/{selectedRelease.checks.length} passed</span>
        </div>
        <ul className="check-list">
          {selectedRelease.checks.map((check) => <CheckRow key={check.name} check={check} />)}
        </ul>
        <div className="detail-footnote">
          <Icon name="shield" size={15} />
          Sample data · no repository or CI connection is active.
        </div>
      </section>
    )
  }

  function renderTimeline() {
    return (
      <section className="panel activity-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Activity log</div>
            <h2>Recent activity</h2>
          </div>
          <button type="button" className="text-button" onClick={() => showNotice('The full activity stream is unavailable without a live integration.')}>
            View all <Icon name="arrow" size={14} />
          </button>
        </div>
        <ol className="activity-list">
          {activity.slice(0, 5).map((item) => (
            <li key={item.id} className="activity-item">
              <span className={`activity-marker marker-${item.tone}`} aria-hidden="true" />
              <div className="activity-copy">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <time>{item.time}</time>
            </li>
          ))}
        </ol>
      </section>
    )
  }

  function renderOverview() {
    return (
      <>
        <PageHeading
          eyebrow="Workspace / Overview"
          title="Release verification"
          description="Review checks, failures, and sign-off status for each candidate release."
        >
          <button type="button" className="button button-secondary" onClick={() => showNotice('This workspace uses sample data; no live integration is connected.')}>
            <Icon name="shield" size={16} /> Sample data
          </button>
          <button type="button" className="button button-primary" onClick={openNewRelease} data-testid="new-release-button">
            <Icon name="plus" size={16} /> New release
          </button>
        </PageHeading>

        <section className="metric-grid" aria-label="Workspace metrics">
          <MetricCard label="Verified releases" value={passedCount} detail="all configured checks passed" tone="success" icon="check" />
          <MetricCard label="Needs attention" value={attentionCount} detail="failed checks requiring review" tone="rose" icon="alert" />
          <MetricCard label="Active verifications" value={runningCount || '—'} detail={runningCount ? 'verification in progress' : 'no verification running'} tone="amber" icon="pulse" />
          <MetricCard label="Median run" value="03:14" detail="based on listed runs" tone="neutral" icon="clock" />
        </section>

        <div className="dashboard-grid">
          {renderReleaseDirectory()}
          {renderDetailPanel()}
          {renderTimeline()}
          <section className="panel loop-panel">
             <div className="panel-kicker">Verification loop</div>
             <div className="loop-mark" aria-hidden="true"><span /><span /><span /><span /></div>
             <h2>Resolve failures before release.</h2>
             <p>Review the failure, apply the fix, and run the checks again.</p>
            <div className="loop-steps">
              <span><b>01</b> Detect</span>
              <span><b>02</b> Explain</span>
              <span><b>03</b> Re-run</span>
            </div>
          </section>
        </div>
      </>
    )
  }

  function renderReleases() {
    return (
      <>
        <PageHeading
          eyebrow="Workspace / Releases"
          title="Release directory"
          description="Review each candidate release, its latest checks, and required follow-up."
        >
          <button type="button" className="button button-primary" onClick={openNewRelease} data-testid="new-release-button">
            <Icon name="plus" size={16} /> New release
          </button>
        </PageHeading>
        <div className="directory-layout">
          {renderReleaseDirectory({ compact: true })}
          {renderDetailPanel({ standalone: true })}
        </div>
      </>
    )
  }

  function renderTestRuns() {
    const runs = releases.map((release) => ({ ...release.latestRun, release }))
    return (
      <>
        <PageHeading
          eyebrow="Workspace / Test runs"
          title="Test runs"
          description="Review the checks run for each release and their results."
        >
          <button type="button" className="button button-secondary" onClick={() => setActiveView('releases')}>
            Browse releases <Icon name="arrow" size={15} />
          </button>
        </PageHeading>
        <section className="panel runs-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">Verification history</div>
              <h2>Latest runs</h2>
            </div>
            <span className="panel-count">{runs.length} runs</span>
          </div>
          <div className="runs-list">
            {runs.map((run) => (
              <button
                type="button"
                className="run-row"
                key={run.id}
                onClick={() => { setSelectedId(run.release.id); setRunState(null); setActiveView('releases') }}
                data-testid={`run-row-${run.id}`}
              >
                <span className="run-row-status"><StatusPill status={run.status} compact /></span>
                <span className="run-row-release"><strong>{run.release.name}</strong><small>{run.release.version} · {run.trigger}</small></span>
                <span className="run-row-id">{run.id}</span>
                <span className="run-row-duration">{run.duration}</span>
                <span className="run-row-time">{run.time}</span>
                <Icon name="arrow" size={15} />
              </button>
            ))}
          </div>
          <div className="demo-disclaimer"><Icon name="shield" size={15} /> Sample history · no repository or CI connection is active.</div>
        </section>
      </>
    )
  }

  function renderSettings() {
    return (
      <>
        <PageHeading
          eyebrow="Workspace / Settings"
          title="Verification settings"
          description="Configure how this workspace reports results, retains history, and handles follow-up."
        />
        <div className="settings-grid">
          <section className="panel settings-panel">
            <div className="panel-kicker">Verification preferences</div>
            <h2>Release behavior</h2>
            <p className="panel-description">These settings apply only in this browser session and do not connect to a repository.</p>
            <div className="settings-list">
              <label className="setting-row">
                <span><strong>Archive successful bundles</strong><small>Retain verification evidence for each release.</small></span>
                <input type="checkbox" checked={autoArchive} onChange={(event) => setAutoArchive(event.target.checked)} data-testid="setting-auto-archive" />
              </label>
              <label className="setting-row">
                <span><strong>Notify on attention</strong><small>Show a local alert when a check fails.</small></span>
                <input type="checkbox" checked={slackAlerts} onChange={(event) => setSlackAlerts(event.target.checked)} data-testid="setting-alerts" />
              </label>
            </div>
            <div className="settings-note"><Icon name="shield" size={15} /> Settings are saved for this session only; no external service is connected.</div>
          </section>
          <section className="panel settings-panel settings-about">
            <span className="about-badge"><Icon name="pulse" size={15} /> LOOPLINE / LOCAL</span>
            <h2>About this workspace</h2>
            <p>This workspace displays sample release data. No repository or CI connection is active.</p>
            <button type="button" className="button button-secondary" onClick={() => showNotice('No external services are connected.')}>
              <Icon name="external" size={15} /> Integration status
            </button>
          </section>
        </div>
      </>
    )
  }

  function renderPage() {
    if (activeView === 'releases') return renderReleases()
    if (activeView === 'runs') return renderTestRuns()
    if (activeView === 'settings') return renderSettings()
    return renderOverview()
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <span className="brand-orbit" aria-hidden="true"><span /></span>
          <span className="brand-name">loopline</span>
          <span className="brand-version">v0.1</span>
        </div>
        <button type="button" className="workspace-switcher" onClick={() => showNotice('You are viewing a local sample workspace.')}>
          <span className="workspace-avatar">L</span>
          <span className="workspace-copy"><strong>Launchpad</strong><small>Local workspace</small></span>
          <Icon name="chevron" size={15} />
        </button>
        <nav className="primary-nav">
          <span className="nav-label">Workspace</span>
          <button type="button" className={`nav-item ${activeView === 'overview' ? 'nav-item-active' : ''}`} onClick={() => setActiveView('overview')} aria-current={activeView === 'overview' ? 'page' : undefined} data-testid="nav-overview">
            <Icon name="grid" size={17} /> <span>Overview</span>
          </button>
          <button type="button" className={`nav-item ${activeView === 'releases' ? 'nav-item-active' : ''}`} onClick={() => setActiveView('releases')} aria-current={activeView === 'releases' ? 'page' : undefined} data-testid="nav-releases">
            <Icon name="layers" size={17} /> <span>Releases</span><span className="nav-badge">{releases.length}</span>
          </button>
          <button type="button" className={`nav-item ${activeView === 'runs' ? 'nav-item-active' : ''}`} onClick={() => setActiveView('runs')} aria-current={activeView === 'runs' ? 'page' : undefined} data-testid="nav-test-runs">
            <Icon name="flask" size={17} /> <span>Test runs</span>
          </button>
           <span className="nav-label nav-label-spaced">Configure</span>
          <button type="button" className={`nav-item ${activeView === 'settings' ? 'nav-item-active' : ''}`} onClick={() => setActiveView('settings')} aria-current={activeView === 'settings' ? 'page' : undefined} data-testid="nav-settings">
            <Icon name="settings" size={17} /> <span>Settings</span>
          </button>
        </nav>
         <div className="sidebar-bottom">
           <div className="loop-status"><span className="live-dot" /> <span>Verification status</span><strong>Local</strong></div>
          <div className="sidebar-user">
            <span className="user-avatar">MC</span>
            <span><strong>Maya Chen</strong><small>Product engineering</small></span>
            <button type="button" className="icon-button icon-button-small" aria-label="Open account menu" onClick={() => showNotice('Account actions are unavailable in this local workspace.')}><Icon name="dots" size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex="-1">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-orbit" aria-hidden="true"><span /></span><strong>loopline</strong></div>
          <div className="topbar-breadcrumb"><span>Launchpad</span><span className="breadcrumb-slash">/</span><strong>{activeView === 'runs' ? 'Test runs' : activeView[0].toUpperCase() + activeView.slice(1)}</strong></div>
          <div className="topbar-actions">
            <span className="connection-note"><span className="live-dot" /> Local workspace</span>
            <button type="button" className="topbar-icon" aria-label="Notifications" onClick={() => showNotice('No new notifications.')}><Icon name="bell" size={17} /></button>
            <button type="button" className="topbar-icon" aria-label="Open help" onClick={() => showNotice('Open a verification bundle to review failed checks and suggested follow-up.')}><span className="help-mark">?</span></button>
          </div>
        </header>

        <div className="page-content">{renderPage()}</div>
       <footer className="app-footer"><span><span className="footer-pulse" /> Loopline workspace</span><span>Sample data · no live integration</span></footer>
      </main>

      {notice ? <div className="toast" role="status" aria-live="polite"><span className="toast-icon"><Icon name="check" size={15} /></span>{notice}</div> : null}

      {failureOpen ? (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFailureOpen(false) }}>
          <section className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="failure-title" data-testid="failure-drawer">
            <div className="drawer-header">
              <div><span className="drawer-kicker"><Icon name="alert" size={14} /> Verification bundle</span><h2 id="failure-title">Review failed checks.</h2></div>
              <button type="button" className="icon-button" onClick={() => setFailureOpen(false)} aria-label="Close verification bundle"><Icon name="close" size={19} /></button>
            </div>
            <p className="drawer-intro">This bundle groups the failed checks, likely cause, and suggested follow-up for <strong>{selectedRelease?.version}</strong>.</p>
            <div className="failure-context"><span className="failure-context-mark"><Icon name="pulse" size={17} /></span><span><strong>{selectedRelease?.name}</strong><small>{selectedRelease?.branch}</small></span><StatusPill status={selectedRelease?.status === 'passed' ? 'passed' : 'attention'} compact /></div>
            {selectedFailedChecks.length ? (
              <div className="failure-stack">
                {selectedFailedChecks.map((check) => (
                  <article className="failure-card" key={check.name}>
                    <div className="failure-card-heading"><span className="failure-card-icon"><Icon name="alert" size={15} /></span><strong>{check.name}</strong><span className="failure-pill">FAILED</span></div>
                    <p>Checkout confirmation waited longer than the journey budget on the payment retry path.</p>
                    <div className="failure-code"><span>Suggested change</span><code>increase retry settle window to 1200ms</code></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="resolved-state"><span><Icon name="check" size={20} /></span><strong>All checks passed</strong><p>Run verification again after the next release change.</p></div>
            )}
            <div className="drawer-footer">
              <div><span className="drawer-footer-label">Suggested action</span><span className="drawer-footer-copy">Apply the targeted fix, then verify the release again.</span></div>
              <button type="button" className="button button-primary" onClick={applySuggestedFix} disabled={!selectedFailedChecks.length} data-testid="apply-suggested-fix"><Icon name="wand" size={16} /> Apply suggested fix</button>
            </div>
            <p className="drawer-disclaimer"><Icon name="shield" size={14} /> Local action only · no code is changed.</p>
          </section>
        </div>
      ) : null}

      {newReleaseOpen ? (
        <div className="modal-layer modal-layer-centered" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewReleaseOpen(false) }}>
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="new-release-title" data-testid="new-release-modal">
            <div className="modal-header">
              <div><span className="drawer-kicker"><Icon name="plus" size={14} /> Release setup</span><h2 id="new-release-title">Add a release to verify.</h2></div>
              <button type="button" className="icon-button" onClick={() => setNewReleaseOpen(false)} aria-label="Close new release dialog"><Icon name="close" size={19} /></button>
            </div>
            <p className="modal-intro">Enter the release name, version, and source branch.</p>
            <form className="release-form" onSubmit={createRelease} noValidate>
              <label className="form-field">
                <span>Release name <b>*</b></span>
                <input type="text" value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="e.g. Billing portal" autoComplete="off" aria-invalid={Boolean(formErrors.name)} aria-describedby={formErrors.name ? 'name-error' : undefined} data-testid="new-release-name" />
                {formErrors.name ? <small id="name-error" className="form-error">{formErrors.name}</small> : null}
              </label>
              <div className="form-grid">
                <label className="form-field">
                  <span>Version <b>*</b></span>
                  <input type="text" value={form.version} onChange={(event) => updateForm('version', event.target.value)} placeholder="e.g. v2.19.0" autoComplete="off" aria-invalid={Boolean(formErrors.version)} aria-describedby={formErrors.version ? 'version-error' : undefined} data-testid="new-release-version" />
                  {formErrors.version ? <small id="version-error" className="form-error">{formErrors.version}</small> : null}
                </label>
                <label className="form-field">
                  <span>Source branch <b>*</b></span>
                  <input type="text" value={form.branch} onChange={(event) => updateForm('branch', event.target.value)} placeholder="release/..." autoComplete="off" aria-invalid={Boolean(formErrors.branch)} aria-describedby={formErrors.branch ? 'branch-error' : undefined} data-testid="new-release-branch" />
                  {formErrors.branch ? <small id="branch-error" className="form-error">{formErrors.branch}</small> : null}
                </label>
              </div>
               <div className="form-hint"><Icon name="shield" size={14} /> Required fields add a queued release. No repository access is used.</div>
              <div className="modal-actions">
                <button type="button" className="button button-quiet" onClick={() => setNewReleaseOpen(false)} data-testid="cancel-new-release">Cancel</button>
                <button type="submit" className="button button-primary" data-testid="create-release"><Icon name="plus" size={16} /> Create release</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
