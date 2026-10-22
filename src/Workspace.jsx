import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  CircleDashed,
  Clock,
  GitBranch,
  GithubLogo,
  GitPullRequest,
  Plus,
  SignOut,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { Brand, Dialog } from './ui.jsx'
import './workspace.css'

const defaultRepository = 'hemanthreddykoduru/Loopline'
const conclusionLabels = {
  ready: 'Ready',
  blocked: 'Blocked',
  running: 'Checks in progress',
  unverified: 'Not verified',
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error, fallback) {
  const message = typeof error?.message === 'string' && error.message.trim() ? error.message : fallback
  const nested = error?.error
  const retryAfterSeconds = error?.retryAfterSeconds ?? (nested !== null && typeof nested === 'object' ? nested.retryAfterSeconds : undefined)
  const seconds = Number(retryAfterSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return message
  const roundedSeconds = Math.ceil(seconds)
  return `${message} Try again in ${roundedSeconds} second${roundedSeconds === 1 ? '' : 's'}.`
}

function sourceUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

function SourceLink({ href, children, className = '' }) {
  const url = sourceUrl(href)
  if (!url) return <span className="ws-muted">Source unavailable</span>
  return (
    <a className={`ws-source-link ${className}`} href={url} target="_blank" rel="noopener noreferrer">
      {children}<ArrowSquareOut size={14} aria-hidden="true" /><span className="ws-sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function Timestamp({ value, fallback = 'Time not reported', ...props }) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(timestamp)) return <span {...props}>{fallback}</span>
  return <time dateTime={value} title={value} {...props}>{new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
}

function snapshotAge(value) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(timestamp)) return 'Age unavailable'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < -60) return 'Capture time is ahead of this device’s clock'
  if (seconds < 60) return 'Less than a minute old'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} old`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} old`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} old`
}

function repositoryName(value) {
  if (typeof value !== 'string' || value.length > 300 || /[\x00-\x1f\x7f\\%]/.test(value)) return null
  const input = value.trim()
  const match = input.match(/^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/?$/i) || input.match(/^([^/]+)\/([^/]+)$/)
  if (!match || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(match[1])
    || !/^[a-z\d_.-]{1,100}$/i.test(match[2]) || /^\.{1,2}$/.test(match[2])) return null
  return `${match[1]}/${match[2]}`
}

function readDetail(value, expectedId) {
  if (!value?.project?.id || (expectedId != null && String(value.project.id) !== String(expectedId))) {
    throw new Error('The server did not return the selected repository. Retry to load its saved evidence.')
  }
  return {
    project: value.project,
    snapshot: isRecord(value.snapshot) ? value.snapshot : null,
    pullRequests: Array.isArray(value.pullRequests) ? value.pullRequests.filter(isRecord) : [],
    history: Array.isArray(value.history) ? value.history.filter(isRecord) : [],
  }
}

function CheckSymbol({ check, matchesCommit }) {
  const outcome = String(check.conclusion || check.status || '').toLowerCase()
  const passed = matchesCommit && ['success', 'passed'].includes(outcome)
  const failed = ['failure', 'failed', 'cancelled', 'timed_out', 'action_required', 'error'].includes(outcome)
  const Icon = passed ? CheckCircle : failed ? WarningCircle : CircleDashed
  return <Icon size={20} className={`ws-check-symbol${passed ? ' ws-check-symbol-passed' : failed ? ' ws-check-symbol-failed' : ''}`} aria-hidden="true" />
}

function Summary({ summary }) {
  const values = ['total', 'passed', 'failed', 'pending'].filter((key) => Number.isFinite(summary?.[key]) && summary[key] >= 0)
  if (!values.length) return null
  return <p className="ws-check-summary">{values.map((key) => <span key={key}><strong>{summary[key]}</strong> {key}</span>)}</p>
}

export function EvidencePanel({ project = null, snapshot = null, onConnect, compact = false, stale = false }) {
  const headingId = useId()
  const checks = Array.isArray(snapshot?.checks) ? snapshot.checks.filter(isRecord) : []
  const hasCommit = typeof snapshot?.head_sha === 'string' && Boolean(snapshot.head_sha.trim())
  const missingEvidence = !checks.length || !hasCommit || checks.some((check) => !check.status || !check.head_sha || check.head_sha !== snapshot.head_sha || !['success', 'passed', 'neutral', 'skipped'].includes(String(check.conclusion || check.status).toLowerCase()))
  const recordedConclusion = Object.hasOwn(conclusionLabels, snapshot?.conclusion) ? snapshot.conclusion : 'unverified'
  const conclusion = recordedConclusion === 'ready' && missingEvidence ? 'unverified' : recordedConclusion
  const status = stale && snapshot ? 'stale' : conclusion
  const StatusIcon = status === 'ready' ? CheckCircle : ['blocked', 'stale'].includes(status) ? WarningCircle : status === 'running' ? Clock : CircleDashed

  return (
    <section className={`ws-evidence${compact ? ' ws-evidence-compact' : ''}${stale ? ' ws-evidence-stale' : ''}`} aria-labelledby={headingId} data-testid="evidence-panel">
      <header className="ws-evidence-heading">
        <div>
          <p className="ws-eyebrow">Commit evidence</p>
          <h2 id={headingId}>{snapshot ? 'Latest saved snapshot' : 'No evidence yet'}</h2>
        </div>
        <span className={`ws-status ws-status-${status}`} data-testid="evidence-status" data-conclusion={status} role="status">
          <StatusIcon size={16} aria-hidden="true" />{status === 'stale' ? 'Stale · sync required' : conclusionLabels[conclusion]}
        </span>
      </header>

      {!snapshot ? (
        <div className="ws-evidence-empty" data-testid="evidence-empty">
          <GithubLogo size={29} aria-hidden="true" />
          <h3>{project ? 'This target has no saved checks.' : 'Start with a repository.'}</h3>
          <p>{project ? 'Sync from GitHub to read the current commit and its published check results. No checks are assumed to have passed.' : 'Connect a public GitHub repository to review real checks against a specific commit. Nothing has been verified yet.'}</p>
          {onConnect ? <button type="button" className="ws-button ws-button-primary" onClick={onConnect} data-testid="evidence-connect"><Plus size={16} aria-hidden="true" />Connect repository</button> : null}
          <p className="ws-caption">Public repositories · read-only access</p>
        </div>
      ) : (
        <>
          {stale ? <p className="ws-stale-note">This is previous evidence, not a current readiness result. Sync successfully before relying on it.</p> : null}
          <dl className="ws-snapshot-context">
            {project?.full_name ? <div><dt>Repository</dt><dd>{project.full_name}</dd></div> : null}
            <div><dt>{snapshot.pr_number != null ? 'Pull request' : 'Branch'}</dt><dd>{snapshot.pr_number != null ? `#${snapshot.pr_number}${snapshot.pr_title ? ` · ${snapshot.pr_title}` : ''}` : snapshot.ref_name || 'Ref not reported'}{snapshot.pr_number != null && snapshot.ref_name ? <span className="ws-context-subline">{snapshot.ref_name}</span> : null}</dd></div>
            <div className="ws-context-commit"><dt>Commit SHA</dt><dd><code data-testid="evidence-sha">{snapshot.head_sha || 'Commit not reported'}</code></dd></div>
            <div><dt>Captured</dt><dd><Timestamp value={snapshot.checked_at} data-testid="evidence-checked-at" /><span className="ws-context-subline">{snapshotAge(snapshot.checked_at)}</span></dd></div>
          </dl>
          {snapshot.reason ? <p className="ws-evidence-reason" data-testid="evidence-reason">{snapshot.reason}</p> : null}
          {recordedConclusion === 'ready' && missingEvidence ? <p className="ws-stale-note">The saved conclusion says ready, but complete passing evidence for this commit was not returned. Readiness is not verified.</p> : null}
          <div className="ws-checks-heading">
            <h3>Published checks</h3>
            {sourceUrl(snapshot.html_url) ? <SourceLink href={snapshot.html_url}>Open GitHub source</SourceLink> : null}
          </div>
          {checks.length ? <Summary summary={snapshot.summary} /> : null}
          <ul className="ws-check-list" data-testid="evidence-checks" aria-label="Published check results">
            {checks.map((check, index) => {
              const matchesCommit = hasCommit && check.head_sha === snapshot.head_sha
              return (
                <li className="ws-check-row" key={check.id || `${check.name}-${index}`} data-testid={`evidence-check-${check.id || index}`}>
                  <div className="ws-check-name"><CheckSymbol check={check} matchesCommit={matchesCommit} /><div><strong>{check.name || 'Unnamed check'}</strong><span>{check.provider || 'Provider not reported'}</span></div></div>
                  <dl className="ws-check-fields">
                    <div><dt>Status</dt><dd><code>{check.status || 'Not reported'}</code></dd></div>
                    <div><dt>Conclusion</dt><dd><code>{check.conclusion || 'Not reported'}</code></dd></div>
                    <div className="ws-check-sha"><dt>Commit SHA</dt><dd><code>{check.head_sha || 'Not reported'}</code>{!matchesCommit ? <span className="ws-commit-warning">{check.head_sha ? 'Different commit · not evidence for this SHA' : 'Commit not reported · cannot verify this check'}</span> : null}</dd></div>
                  </dl>
                  <div className="ws-check-result"><SourceLink href={check.html_url}>Open result</SourceLink><span><span className="ws-sr-only">Completed: </span><Timestamp value={check.completed_at} fallback="Completion not reported" /></span></div>
                </li>
              )
            })}
          </ul>
          {!checks.length ? <p className="ws-no-checks">No published checks were returned for this snapshot. An empty check list does not establish readiness.</p> : null}
          <p className="ws-evidence-footnote"><Clock size={15} aria-hidden="true" />Point-in-time evidence, not live polling. Sync from GitHub refreshes this view; it does not start CI or run tests.</p>
        </>
      )}
    </section>
  )
}

function EvidenceLedger({ history }) {
  const entries = history.slice(0, 10)
  return (
    <section className="ws-ledger" aria-labelledby="ws-ledger-heading" data-testid="evidence-history">
      <header className="ws-ledger-heading"><div><p className="ws-eyebrow">Evidence ledger</p><h2 id="ws-ledger-heading">Saved snapshots</h2></div><span className="ws-caption">Latest {entries.length} · limited to 10</span></header>
      {!entries.length ? <p className="ws-ledger-empty">No snapshots have been saved yet.</p> : (
        <ol className="ws-history-list">
          {entries.map((entry, index) => (
            <li className="ws-history-row" key={entry.id || index} data-testid={`evidence-history-${entry.id || index}`}>
              <div className="ws-history-when"><Timestamp value={entry.checked_at} /><span className="ws-caption">Recorded conclusion: <strong>{entry.conclusion || 'Not reported'}</strong></span></div>
              <div className="ws-history-context"><strong>{entry.pr_number != null ? `PR #${entry.pr_number}` : entry.ref_name || 'Ref not reported'}</strong>{entry.pr_number != null && entry.ref_name ? <span>{entry.ref_name}</span> : null}<code>{entry.head_sha || 'Commit not reported'}</code>{entry.reason ? <p>{entry.reason}</p> : null}</div>
              <SourceLink href={entry.html_url}>Open source</SourceLink>
            </li>
          ))}
        </ol>
      )}
      <p className="ws-caption ws-ledger-note">Historical conclusions are recorded as returned. Open the source to inspect a historical result; the check details above belong to the latest saved snapshot only.</p>
    </section>
  )
}

export function Workspace({ user, api, onSignOut, navigate }) {
  return <WorkspaceSession key={user.id} user={user} api={api} onSignOut={onSignOut} navigate={navigate} />
}

function WorkspaceSession({ user, api, onSignOut, navigate }) {
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState('')
  const [listRevision, setListRevision] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [pullNumber, setPullNumber] = useState('branch')
  const [stale, setStale] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [operation, setOperation] = useState(null)
  const [notice, setNotice] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  const [repository, setRepository] = useState(defaultRepository)
  const [requireTestSprite, setRequireTestSprite] = useState(true)
  const [repositoryError, setRepositoryError] = useState('')
  const [connectError, setConnectError] = useState('')
  const [disconnectTarget, setDisconnectTarget] = useState(null)
  const [disconnectError, setDisconnectError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const alive = useRef(false)
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const selectedRef = useRef(null)
  const operationRef = useRef(null)
  const signOutPending = useRef(false)
  const repositoryInput = useRef(null)
  const formId = useId()

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      listRequest.current += 1
      detailRequest.current += 1
      operationRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const request = ++listRequest.current
    setProjectsLoading(true)
    setProjectsError('')
    async function loadProjects() {
      try {
        const items = await api.listProjects()
        if (!alive.current || cancelled || request !== listRequest.current) return
        if (!Array.isArray(items)) throw new Error('The repository list could not be read. Retry to load it again.')
        setProjects(items)
        const current = items.find((project) => project.id === selectedRef.current)
        void loadProject(current?.id || items[0]?.id || null)
      } catch (error) {
        if (alive.current && !cancelled && request === listRequest.current) setProjectsError(errorMessage(error, 'Could not load your repositories.'))
      } finally {
        if (alive.current && !cancelled && request === listRequest.current) setProjectsLoading(false)
      }
    }
    void loadProjects()
    return () => { cancelled = true }
  }, [api, listRevision])

  function updateProject(project) {
    setProjects((current) => current.some((item) => item.id === project.id)
      ? current.map((item) => item.id === project.id ? project : item)
      : [project, ...current])
  }

  function showDetail(next) {
    setDetail(next)
    setDetailError('')
    setDetailLoading(false)
    setPullNumber(next.snapshot?.pr_number != null ? String(next.snapshot.pr_number) : 'branch')
    setStale(next.snapshot?.stale === true)
    setSyncError('')
    updateProject(next.project)
  }

  async function loadProject(projectId) {
    const request = ++detailRequest.current
    selectedRef.current = projectId
    setSelectedId(projectId)
    setDetail(null)
    setDetailError('')
    setDetailLoading(Boolean(projectId))
    setPullNumber('branch')
    setStale(false)
    setSyncError('')
    setDisconnectError('')
    setDisconnectTarget(null)
    if (!projectId) return
    try {
      const value = await api.getProject(projectId)
      if (!alive.current || request !== detailRequest.current || selectedRef.current !== projectId) return
      showDetail(readDetail(value, projectId))
    } catch (error) {
      if (alive.current && request === detailRequest.current && selectedRef.current === projectId) setDetailError(errorMessage(error, 'Could not load this repository’s saved evidence.'))
    } finally {
      if (alive.current && request === detailRequest.current && selectedRef.current === projectId) setDetailLoading(false)
    }
  }

  function beginOperation(kind, projectId = null) {
    if (operationRef.current) return null
    const next = { kind, projectId }
    operationRef.current = next
    setOperation(next)
    setNotice('')
    return next
  }

  function finishOperation(current) {
    if (!alive.current || operationRef.current !== current) return
    operationRef.current = null
    setOperation(null)
  }

  function openConnect() {
    if (operationRef.current?.kind !== 'connect') {
      setRepository(defaultRepository)
      setRequireTestSprite(true)
      setRepositoryError('')
      setConnectError('')
    }
    setConnectOpen(true)
  }

  async function connectRepository(event) {
    event.preventDefault()
    if (operationRef.current || projectsLoading) return
    const name = repositoryName(repository)
    if (!name) {
      setRepositoryError('Enter owner/repository or an HTTPS github.com repository URL, without extra paths, query parameters, or a fragment.')
      repositoryInput.current?.focus()
      return
    }
    const current = beginOperation('connect')
    if (!current) return
    const selectedAtStart = selectedRef.current
    const selectionRequest = detailRequest.current
    setRepositoryError('')
    setConnectError('')
    try {
      const value = await api.connectProject(name, { requireTestSprite })
      if (!alive.current || operationRef.current !== current) return
      const next = readDetail(value)
      if (selectedRef.current === selectedAtStart && detailRequest.current === selectionRequest) {
        detailRequest.current += 1
        selectedRef.current = next.project.id
        setSelectedId(next.project.id)
        showDetail(next)
      } else updateProject(next.project)
      setConnectOpen(false)
      setNotice(`${next.project.full_name} connected to your account.`)
    } catch (error) {
      if (alive.current && operationRef.current === current) setConnectError(errorMessage(error, 'Could not connect this public repository. Check its name and try again.'))
    } finally {
      finishOperation(current)
    }
  }

  async function syncProject() {
    const projectId = selectedRef.current
    if (!projectId || !detail || detailLoading || operationRef.current) return
    const requestedPullNumber = pullNumber === 'branch' ? null : Number(pullNumber)
    if (requestedPullNumber !== null && (!Number.isInteger(requestedPullNumber) || requestedPullNumber < 1)) return
    const current = beginOperation('sync', projectId)
    if (!current) return
    const request = ++detailRequest.current
    setSyncError('')
    setStale(true)
    try {
      const value = await api.syncProject(projectId, { pullNumber: requestedPullNumber })
      if (!alive.current || operationRef.current !== current || request !== detailRequest.current || selectedRef.current !== projectId) return
      const next = readDetail(value, projectId)
      if (next.snapshot && (requestedPullNumber === null ? next.snapshot.pr_number != null : Number(next.snapshot.pr_number) !== requestedPullNumber)) {
        throw new Error('GitHub did not return evidence for the requested target. Retry to read that branch or pull request.')
      }
      showDetail(next)
      setPullNumber(requestedPullNumber === null ? 'branch' : String(requestedPullNumber))
      setNotice(next.snapshot ? 'GitHub evidence synced. Review the saved conclusion and individual checks below.' : 'GitHub returned no evidence snapshot for this target. Nothing has been verified.')
    } catch (error) {
      if (alive.current && operationRef.current === current && request === detailRequest.current && selectedRef.current === projectId) {
        setSyncError(errorMessage(error, 'Could not sync from GitHub.'))
        setStale(true)
      }
    } finally {
      finishOperation(current)
    }
  }

  async function disconnectProject() {
    if (!disconnectTarget || selectedRef.current !== disconnectTarget.id || operationRef.current) return
    const target = disconnectTarget
    const current = beginOperation('disconnect', target.id)
    if (!current) return
    setDisconnectError('')
    try {
      const result = await api.disconnectProject(target.id)
      if (!alive.current || operationRef.current !== current) return
      if (result?.success !== true) throw new Error('The server did not confirm disconnection. The repository is still shown in your account.')
      setProjects((items) => items.filter((project) => project.id !== target.id))
      setDisconnectTarget(null)
      if (selectedRef.current === target.id) void loadProject(projects.find((project) => project.id !== target.id)?.id || null)
      setNotice(`${target.full_name} disconnected from your account.`)
    } catch (error) {
      if (alive.current && operationRef.current === current) setDisconnectError(errorMessage(error, 'Could not disconnect this repository. It has not been removed from this view.'))
    } finally {
      finishOperation(current)
    }
  }

  async function signOut() {
    if (signOutPending.current) return
    signOutPending.current = true
    setSigningOut(true)
    setSignOutError('')
    try {
      await onSignOut()
      if (alive.current && typeof navigate === 'function') navigate('/')
    } catch (error) {
      if (alive.current) setSignOutError(errorMessage(error, 'Could not sign out. Try again.'))
    } finally {
      signOutPending.current = false
      if (alive.current) setSigningOut(false)
    }
  }

  const selectedProject = detail?.project || projects.find((project) => project.id === selectedId) || null
  const profileName = [user.profile?.display_name, user.profile?.name].find((name) => typeof name === 'string' && name.trim())
  const snapshotMatchesTarget = detail?.snapshot && (pullNumber === 'branch' ? detail.snapshot.pr_number == null : Number(detail.snapshot.pr_number) === Number(pullNumber))
  const visibleSnapshot = snapshotMatchesTarget ? detail.snapshot : null
  const savedPullRequest = detail?.snapshot?.pr_number != null && !detail.pullRequests.some((pull) => pull.number === detail.snapshot.pr_number) ? detail.snapshot : null
  const selectedPull = detail?.pullRequests.find((pull) => Number(pull.number) === Number(pullNumber))
  const currentSync = operation?.kind === 'sync' && operation.projectId === selectedId
  const connecting = operation?.kind === 'connect'
  const disconnecting = operation?.kind === 'disconnect'
  const operationProject = projects.find((project) => project.id === operation?.projectId)?.full_name
  const operationCopy = operation?.kind === 'connect' ? 'Connecting repository…' : operation?.kind === 'sync' ? `Reading published GitHub evidence${operationProject ? ` for ${operationProject}` : ''}…` : operation?.kind === 'disconnect' ? `Disconnecting ${operationProject || 'repository'}…` : ''

  return (
    <div className="ws-workspace" data-testid="workspace">
      <a className="ws-skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to repository evidence</a>
      <header className="ws-topbar">
        <div className="ws-topbar-brand"><Brand /><span className="ws-topbar-divider" aria-hidden="true" /><span>Workspace</span></div>
        <div className="ws-account">
          <div className="ws-identity">{profileName ? <strong>{profileName}</strong> : null}<span data-testid="workspace-user-email">{user.email || user.id}</span></div>
          <button className="ws-button ws-button-quiet" type="button" onClick={signOut} disabled={signingOut} data-testid="workspace-signout"><SignOut size={17} aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </header>

      <div className="ws-layout">
        <aside className="ws-sidebar" aria-labelledby="ws-projects-heading">
          <div className="ws-sidebar-heading"><h2 id="ws-projects-heading">Repositories</h2>{!projectsLoading && !projectsError ? <span className="ws-caption">{projects.length}</span> : null}</div>
          <button type="button" className="ws-button ws-button-primary ws-connect-button" onClick={openConnect} data-testid="connect-repository-open" aria-haspopup="dialog"><Plus size={16} aria-hidden="true" />Connect repository</button>
          {projectsLoading ? <p className="ws-sidebar-message" role="status" data-testid="projects-loading">Loading your repositories…</p> : null}
          {projectsError ? <div className="ws-sidebar-error" role="alert" data-testid="projects-error"><p>Could not load all repositories.</p><p>{projectsError}</p><button type="button" className="ws-button ws-button-secondary" disabled={projectsLoading || Boolean(operation)} onClick={() => setListRevision((value) => value + 1)} data-testid="projects-retry">Retry repository list</button></div> : null}
          {!projectsLoading && !projectsError && !projects.length ? <p className="ws-sidebar-message" data-testid="projects-empty">No repositories connected. Add a public repository to start collecting evidence.</p> : null}
          <ul className="ws-project-list" data-testid="project-list" aria-label="Connected repositories">
            {projects.map((project) => (
              <li key={project.id}>
                <button type="button" className={`ws-project-button${selectedId === project.id ? ' ws-project-selected' : ''}`} onClick={() => { if (selectedRef.current !== project.id) void loadProject(project.id) }} aria-pressed={selectedId === project.id} aria-label={`Select ${project.full_name}`} data-testid={`project-select-${project.id}`} data-project-id={project.id}>
                  <GithubLogo size={18} aria-hidden="true" /><span><strong>{project.full_name}</strong><span><GitBranch size={13} aria-hidden="true" />{project.default_branch || 'Default branch not reported'}</span></span>
                </button>
              </li>
            ))}
          </ul>
          <p className="ws-access-note">Public GitHub repositories, read-only. Private repository and GitHub App access are not connected.</p>
        </aside>

        <main className="ws-main" id="main-content" tabIndex={-1}>
          <div className="ws-page-heading"><p className="ws-eyebrow">Repository workspace</p><h1>Repository evidence</h1><p>Read the checks that were actually published for a commit, then follow them back to their source.</p></div>
          <div className={`ws-operation${operationCopy || notice ? '' : ' ws-sr-only'}`} role="status" aria-live="polite" aria-atomic="true" data-testid="workspace-operation">{operationCopy || notice}</div>
          {signOutError ? <p className="ws-alert" role="alert" data-testid="signout-error">{signOutError}</p> : null}
          {connectError && !connectOpen ? <div className="ws-alert" role="alert" data-testid="connect-repository-error-closed"><p>Connection failed. {connectError}</p><button type="button" className="ws-button ws-button-secondary" onClick={() => setConnectOpen(true)}>Review connection</button></div> : null}
          {disconnectError && !disconnectTarget ? <p className="ws-alert" role="alert" data-testid="disconnect-project-error-closed">Disconnection failed. {disconnectError}</p> : null}

          {selectedProject ? (
            <section className="ws-project-detail" aria-labelledby="ws-project-name" data-testid="selected-project" data-project-id={selectedProject.id}>
              <header className="ws-project-heading">
                <div><p className="ws-eyebrow">Selected repository</p><h2 id="ws-project-name">{selectedProject.full_name}</h2>{selectedProject.description ? <p>{selectedProject.description}</p> : null}</div>
                <SourceLink href={selectedProject.html_url}>Repository</SourceLink>
              </header>
              <dl className="ws-project-metadata">
                <div><dt>Default branch</dt><dd><GitBranch size={14} aria-hidden="true" />{selectedProject.default_branch || 'Not reported'}</dd></div>
                <div><dt>Connected</dt><dd><Timestamp value={selectedProject.created_at} /></dd></div>
                <div><dt>Last GitHub sync</dt><dd><Timestamp value={selectedProject.last_synced_at} fallback="Not synced yet" /></dd></div>
                <div><dt>TestSprite evidence</dt><dd>{selectedProject.require_testsprite === true ? 'Required for readiness' : selectedProject.require_testsprite === false ? 'Not required' : 'Requirement not reported'}</dd></div>
              </dl>

              {detailLoading ? <div className="ws-detail-message" role="status" data-testid="project-loading">Loading saved repository evidence…</div> : detailError ? <div className="ws-alert" role="alert" data-testid="project-error"><p>{detailError}</p><button type="button" className="ws-button ws-button-secondary" onClick={() => void loadProject(selectedId)} disabled={Boolean(operation)} data-testid="project-retry">Retry repository evidence</button></div> : detail ? (
                <>
                  <div className="ws-target-toolbar">
                    <label className="ws-field ws-target-field" htmlFor={`${formId}-target`}><span><GitPullRequest size={16} aria-hidden="true" />Evidence target</span><select id={`${formId}-target`} value={pullNumber} onChange={(event) => { setPullNumber(event.target.value); setSyncError('') }} disabled={Boolean(operation)} aria-describedby={`${formId}-target-help`} data-testid="pull-request-select">
                      <option value="branch">Default branch · {selectedProject.default_branch || 'not reported'}</option>
                      {detail.pullRequests.map((pull) => <option key={pull.number} value={String(pull.number)}>PR #{pull.number} · {pull.title}</option>)}
                      {savedPullRequest ? <option value={String(savedPullRequest.pr_number)}>Saved PR #{savedPullRequest.pr_number}{savedPullRequest.pr_title ? ` · ${savedPullRequest.pr_title}` : ''} (not in current PR list)</option> : null}
                    </select></label>
                    <button type="button" className="ws-button ws-button-primary" onClick={() => void syncProject()} disabled={Boolean(operation)} aria-busy={currentSync} data-testid="sync-project"><ArrowsClockwise size={17} aria-hidden="true" />{currentSync ? 'Syncing GitHub…' : operation?.kind === 'sync' ? 'Syncing another repository…' : 'Sync from GitHub'}</button>
                  </div>
                  <p className="ws-target-help" id={`${formId}-target-help`}>Pull requests reflect the last GitHub read. Choose a target, then sync to fetch its current commit and checks.</p>
                  {pullNumber !== 'branch' ? <div className="ws-selected-pr">{selectedPull ? <><span>Head ref: {selectedPull.head_ref || 'Not reported'}</span><span>PR head: <code>{selectedPull.head_sha || 'Not reported'}</code></span><SourceLink href={selectedPull.html_url}>Open PR #{selectedPull.number}</SourceLink></> : <SourceLink href={detail.snapshot?.html_url}>Open saved PR #{pullNumber}</SourceLink>}</div> : null}
                  {detail.snapshot && !snapshotMatchesTarget ? <p className="ws-target-note">This target has not been synced in this view. Evidence for other targets remains in the ledger.</p> : null}
                  {syncError ? <div className="ws-alert" role="alert" data-testid="sync-error"><p><strong>GitHub sync failed.</strong> {syncError}</p><p>Previous evidence is not current. A failed sync does not establish readiness.</p><button type="button" className="ws-button ws-button-secondary" onClick={() => void syncProject()} disabled={Boolean(operation)} data-testid="sync-retry">Retry GitHub sync</button></div> : null}
                  <EvidencePanel project={selectedProject} snapshot={visibleSnapshot} stale={stale} />
                  <EvidenceLedger history={detail.history} />
                </>
              ) : null}

              <div className="ws-project-footer"><p>Disconnect removes this repository connection from your account. It does not change GitHub.</p><button type="button" className="ws-button ws-button-danger-quiet" onClick={() => { setDisconnectError(''); setDisconnectTarget(selectedProject) }} disabled={Boolean(operation)} data-testid="disconnect-project-open" aria-haspopup="dialog"><Trash size={16} aria-hidden="true" />Disconnect</button></div>
            </section>
          ) : projectsLoading ? <div className="ws-detail-message">Waiting for your repository list…</div> : projectsError ? <div className="ws-detail-message">Retry the repository list to load your saved evidence, or connect a public repository.</div> : <EvidencePanel onConnect={openConnect} />}
          <footer className="ws-workspace-footer">Signing in to Loopline does not grant GitHub repository permissions. This connector reads public data only.</footer>
        </main>
      </div>

      {connectOpen ? (
        <Dialog title="Connect a public repository" description="Loopline reads published GitHub checks. It does not install a GitHub App, access private repositories, or start test runs." onClose={() => setConnectOpen(false)} testId="connect-repository-dialog" initialFocus="[data-testid='connect-repository-input']">
          <form className="ws-form" onSubmit={connectRepository} noValidate aria-busy={connecting}>
            <label className="ws-field" htmlFor={`${formId}-repository`}><span>GitHub repository</span><input ref={repositoryInput} id={`${formId}-repository`} type="text" value={repository} onChange={(event) => { setRepository(event.target.value); setRepositoryError(''); setConnectError('') }} placeholder="owner/repository or https://github.com/owner/repository" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={connecting} aria-invalid={Boolean(repositoryError)} aria-describedby={`${formId}-repository-help${repositoryError ? ` ${formId}-repository-error` : ''}${connectError ? ` ${formId}-connect-error` : ''}`} data-testid="connect-repository-input" /></label>
            <p className="ws-field-help" id={`${formId}-repository-help`}>Use a public repository you can open on GitHub without signing in. Confirm the prefilled repository or enter your own.</p>
            {repositoryError ? <p className="ws-field-error" id={`${formId}-repository-error`} role="alert" data-testid="connect-repository-field-error">{repositoryError}</p> : null}
            <div className="ws-check-option"><input id={`${formId}-testsprite`} type="checkbox" checked={requireTestSprite} onChange={(event) => setRequireTestSprite(event.target.checked)} disabled={connecting} aria-describedby={`${formId}-testsprite-help`} data-testid="connect-repository-require-testsprite" /><label htmlFor={`${formId}-testsprite`}>Require TestSprite evidence for readiness</label><p id={`${formId}-testsprite-help`}>When enabled, readiness requires passing TestSprite evidence for the same commit. Connecting does not install TestSprite; publish its results to GitHub through your existing test workflow.</p></div>
            {connectError ? <p className="ws-alert" id={`${formId}-connect-error`} role="alert" data-testid="connect-repository-error">{connectError}</p> : null}
            {projectsLoading ? <p className="ws-field-help" role="status">Loading your existing repositories before connecting…</p> : null}
            {connecting ? <p className="ws-field-help" role="status">Connecting and saving your repository… You can close this dialog while the request finishes.</p> : null}
            <div className="ws-dialog-actions"><button type="button" className="ws-button ws-button-secondary" onClick={() => setConnectOpen(false)} data-testid="connect-repository-cancel">{connecting ? 'Close dialog' : 'Cancel'}</button><button type="submit" className="ws-button ws-button-primary" disabled={Boolean(operation) || projectsLoading} data-testid="connect-repository-submit"><Plus size={16} aria-hidden="true" />{connecting ? 'Connecting…' : 'Connect repository'}</button></div>
          </form>
        </Dialog>
      ) : null}

      {disconnectTarget ? (
        <Dialog title="Disconnect repository?" description="This removes the selected repository and its saved evidence from your Loopline account. The GitHub repository and its checks are not changed." onClose={() => setDisconnectTarget(null)} testId="disconnect-project-dialog" initialFocus="[data-testid='disconnect-project-cancel']">
          <form className="ws-form" onSubmit={(event) => { event.preventDefault(); void disconnectProject() }} aria-busy={disconnecting}>
            <p className="ws-disconnect-name"><GithubLogo size={20} aria-hidden="true" /><strong>{disconnectTarget.full_name}</strong></p>
            {disconnectError ? <p className="ws-alert" role="alert" data-testid="disconnect-project-error">{disconnectError}</p> : null}
            {disconnecting ? <p className="ws-field-help" role="status">Disconnecting… Closing this dialog does not cancel the request.</p> : null}
            <div className="ws-dialog-actions"><button type="button" className="ws-button ws-button-secondary" onClick={() => setDisconnectTarget(null)} data-testid="disconnect-project-cancel">{disconnecting ? 'Close dialog' : 'Cancel'}</button><button type="submit" className="ws-button ws-button-danger" disabled={Boolean(operation) || selectedId !== disconnectTarget.id} data-testid="disconnect-project-confirm"><Trash size={16} aria-hidden="true" />{disconnecting ? 'Disconnecting…' : 'Disconnect repository'}</button></div>
          </form>
        </Dialog>
      ) : null}
    </div>
  )
}

export default Workspace
