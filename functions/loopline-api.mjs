// Single-file Deno ESM deployment; pure helpers also run in Node's offline test runner.
const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://hemanthreddykoduru.github.io']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;
export const LIMITS = Object.freeze({ bodyBytes: 4096, githubReads: 8, checks: 100, history: 10, pulls: 20, projects: 5,
  cacheSeconds: 600, minimumSyncSeconds: 10, freshSyncsPerWindow: 6, syncWindowSeconds: 600 });
// Pinned from https://api.github.com/apps/testsprite (2026-10-16), corroborated by
// https://docs.testsprite.com/web-portal/integrations/github-integration. A workflow name proves nothing.
export const TESTSPRITE_APP = Object.freeze({ id: 2756476, slug: 'testsprite', ownerId: 170984515 });

export class ApiError extends Error {
  constructor(status, code, message, retryAfterSeconds) {
    super(message);
    Object.assign(this, { status, code, retryAfterSeconds });
  }
}
const invalid = message => new ApiError(400, 'INVALID_REQUEST', message);
const upstream = () => new ApiError(502, 'GITHUB_UNAVAILABLE', 'GitHub could not be read. Retained evidence is not current; try again later.');
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : null;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function parseRepository(value) {
  if (typeof value !== 'string' || value.length > 300 || /[\x00-\x1f\x7f\\%]/.test(value)) throw invalid('Enter owner/repository or an exact https://github.com/owner/repository URL.');
  const input = value.trim();
  const match = input.match(/^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/?$/i) || input.match(/^([^/]+)\/([^/]+)$/);
  if (!match || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(match[1])
    || !/^[a-z\d_.-]{1,100}$/i.test(match[2]) || /^\.{1,2}$/.test(match[2])) throw invalid('Enter a public GitHub repository, without a branch, query, or extra path.');
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

export function safeEvidenceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\x7f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || host.endsWith('.')
      || host.startsWith('[') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
        || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) return null;
    }
    return url.href;
  } catch { return null; }
}

export function buildGitHubUrl(path) {
  if (typeof path !== 'string' || !path.startsWith('/repos/') || /[\\\s#]/.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) throw invalid('Invalid GitHub API path.');
  const url = new URL(path, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com' || !url.pathname.startsWith('/repos/')) throw invalid('Invalid GitHub API origin.');
  return url.href;
}

function officialTestSprite(app) {
  return app?.id === TESTSPRITE_APP.id && app?.slug === TESTSPRITE_APP.slug
    && app?.owner?.id === TESTSPRITE_APP.ownerId && app?.html_url === 'https://github.com/apps/testsprite';
}
const FAILURES = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure']);
const CONCLUSIONS = new Set(['success', ...FAILURES, 'neutral', 'skipped', 'stale']);
const PENDING = new Set(['queued', 'in_progress', 'pending', 'waiting', 'requested']);

export function normalizeChecks(headSha, checkRuns, commitStatus) {
  if (!SHA.test(headSha)) throw invalid('A full commit SHA is required.');
  let complete = Array.isArray(checkRuns?.check_runs) && Array.isArray(commitStatus?.statuses)
    && commitStatus.sha === headSha && Number.isInteger(checkRuns?.total_count) && Number.isInteger(commitStatus?.total_count)
    && checkRuns.total_count <= 100 && commitStatus.total_count <= 100
    && checkRuns.total_count === checkRuns.check_runs.length && commitStatus.total_count === commitStatus.statuses.length
    && !checkRuns.truncated && !commitStatus.truncated;
  const candidates = [];
  for (const run of (Array.isArray(checkRuns?.check_runs) ? checkRuns.check_runs : []).slice(0, 100)) {
    if (run?.head_sha !== headSha) { complete = false; continue; }
    if (!Number.isSafeInteger(run.id) || run.id <= 0 || !text(run.name, 255) || run.name.length > 255
      || !Number.isSafeInteger(run.app?.id) || run.app.id <= 0) { complete = false; continue; }
    const status = PENDING.has(run.status) ? (run.status === 'in_progress' ? 'in_progress' : 'queued')
      : run.status === 'completed' ? 'completed' : 'unknown';
    const conclusion = status !== 'completed' ? null : CONCLUSIONS.has(run.conclusion) ? run.conclusion : 'unknown';
    candidates.push({ id: `check:${run.id}`, sourceNumber: run.id, name: run.name,
      provider: text(run.app.slug, 150) || `github-app:${run.app.id}`, provider_key: `app:${run.app.id}`, app_id: run.app.id,
      verified_testsprite: officialTestSprite(run.app), status, conclusion, html_url: safeEvidenceUrl(run.html_url),
      head_sha: headSha, completed_at: date(run.completed_at) });
  }
  if (commitStatus?.sha !== headSha) complete = false;
  else for (const item of (Array.isArray(commitStatus.statuses) ? commitStatus.statuses : []).slice(0, 100)) {
    if (!Number.isSafeInteger(item?.id) || item.id <= 0 || !text(item.context, 255) || item.context.length > 255) { complete = false; continue; }
    const pending = item.state === 'pending';
    const conclusion = pending ? null : item.state === 'success' ? 'success'
      : ['failure', 'error'].includes(item.state) ? 'failure' : 'unknown';
    candidates.push({ id: `status:${item.id}`, sourceNumber: item.id, name: item.context,
      provider: `commit-status:${text(item.creator?.login, 100) || 'unknown'}`,
      provider_key: `status:${item.creator?.id || 'unknown'}`, app_id: null, verified_testsprite: false,
      status: pending ? 'in_progress' : 'completed', conclusion,
      html_url: safeEvidenceUrl(item.target_url) || safeEvidenceUrl(commitStatus.html_url), head_sha: headSha,
      completed_at: pending ? null : date(item.updated_at || item.created_at) });
  }
  const latest = new Map();
  // GitHub IDs order reruns even when a newly queued run has no started_at timestamp.
  for (const check of candidates) {
    const key = `${check.provider_key}\0${check.name}`;
    if (!latest.has(key) || check.sourceNumber > latest.get(key).sourceNumber) latest.set(key, check);
  }
  const checks = [...latest.values()].sort((a, b) => b.sourceNumber - a.sourceNumber);
  if (checks.length > LIMITS.checks) complete = false;
  return { checks: checks.slice(0, LIMITS.checks).map(({ sourceNumber, ...check }) => check), complete };
}

export function evaluateReadiness({ headSha, checkRuns, commitStatus, requireTestSprite = true, requiredChecks = [], policyKnown = true, evidenceComplete = true }) {
  const normalized = normalizeChecks(headSha, checkRuns, commitStatus);
  const checks = normalized.checks;
  const passed = checks.filter(c => c.status === 'completed' && c.conclusion === 'success' && c.completed_at && c.html_url).length;
  const failed = checks.filter(c => c.status === 'completed' && FAILURES.has(c.conclusion)).length;
  const pending = checks.filter(c => ['queued', 'in_progress'].includes(c.status)).length;
  const summary = { total: checks.length, passed, failed, pending };
  const missing = requiredChecks.some(required => !checks.some(c => c.name === required.name
    && (required.appId == null || c.app_id === required.appId)));
  const complete = normalized.complete && evidenceComplete && policyKnown && !missing;
  let conclusion = 'unverified';
  let reason;
  if (failed) { conclusion = 'blocked'; reason = `${failed} latest check(s) failed for this exact commit.`; }
  else if (pending) { conclusion = 'running'; reason = `${pending} latest check(s) are queued or running for this exact commit.`; }
  else if (!complete) reason = missing ? 'Required GitHub check evidence is missing for this commit.'
    : 'GitHub evidence or required-check policy is incomplete; readiness cannot be verified.';
  else if (!checks.length) reason = 'No GitHub check runs or commit statuses exist for this commit.';
  else if (requireTestSprite && !checks.some(c => c.verified_testsprite && c.conclusion === 'success' && c.completed_at && c.html_url))
    reason = 'A successful check from the verified TestSprite GitHub App is required for this commit. Workflow names and commit statuses do not establish that identity.';
  else if (passed !== checks.length) reason = 'Neutral, skipped, stale, unknown, or incomplete checks are not successful verification.';
  else { conclusion = 'ready'; reason = 'All latest reported checks and known required checks succeeded for this exact commit.'; }
  return { checks, summary, conclusion, reason, evidence_complete: complete };
}

async function boundedJson(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw invalid('A JSON body is required.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', 'The JSON body exceeds the size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw invalid('The request body must be valid JSON.'); }
}

// No polling. The cache is public data only; durable owner budgets/leases live in SQL.
export function createGitHubReader({ fetchImpl = globalThis.fetch, token, now = Date.now, timeoutMs = 7000, onRateLimit } = {}) {
  const cache = new Map();
  let blockedUntil = 0;
  return async function github(path, budget) {
    const url = buildGitHubUrl(path);
    if (!budget || ++budget.reads > LIMITS.githubReads) throw new ApiError(502, 'GITHUB_READ_LIMIT', 'The bounded GitHub read limit was reached.');
    if (blockedUntil > now()) throw new ApiError(429, 'GITHUB_RATE_LIMITED', 'GitHub public API rate limit reached. Try again after the reset.', Math.ceil((blockedUntil - now()) / 1000));
    // Repository visibility and mutable HEAD/PR metadata must be fetched for each new sync.
    const cacheable = path.includes('/commits/') || path.includes('/rules/branches/');
    const existing = cacheable && cache.get(url);
    if (existing && existing.expires > now()) return existing.promise;
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    const entry = { expires: now() + 90000 };
    entry.promise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Loopline-public-monitor', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (response.status === 429 || (response.status === 403
          && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) {
          const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          const retry = Number(response.headers.get('retry-after')) * 1000;
          blockedUntil = now() + Math.min(3600000, Math.max(60000, retry || reset - now() || 60000));
          if (onRateLimit) await onRateLimit(Math.ceil((blockedUntil - now()) / 1000));
          throw new ApiError(429, 'GITHUB_RATE_LIMITED', 'GitHub public API rate limit reached. Try again after the reset.', Math.ceil((blockedUntil - now()) / 1000));
        }
        if (response.status === 404) throw new ApiError(404, 'GITHUB_NOT_FOUND', 'The public repository, branch, or pull request was not found. Private repositories are not supported.');
        if (!response.ok) throw upstream();
        let data;
        try { data = await boundedJson(response, 2 * 1024 * 1024); }
        catch { throw upstream(); }
        return { data, truncated: /rel="next"/.test(response.headers.get('link') || '') };
      } catch (error) {
        cache.delete(url);
        if (controller.signal.aborted) throw new ApiError(504, 'GITHUB_TIMEOUT', 'GitHub timed out. Retained evidence is not current; try again later.');
        throw error instanceof ApiError ? error : upstream();
      } finally { clearTimeout(timeout); }
    })();
    if (cacheable) cache.set(url, entry);
    return entry.promise;
  };
}

function pullMetadata(pull) {
  if (!Number.isSafeInteger(pull?.number) || pull.number <= 0 || !SHA.test(pull.head?.sha)
    || !text(pull.head?.ref, 255) || !text(pull.title, 500)
    || !safeEvidenceUrl(pull.html_url)?.startsWith('https://github.com/')) throw upstream();
  return { number: pull.number, title: pull.title.slice(0, 500), head_sha: pull.head.sha,
    head_ref: pull.head.ref.slice(0, 255), html_url: safeEvidenceUrl(pull.html_url) };
}

export async function readGitHubSnapshot(github, repository, requireTestSprite, pullNumber = null) {
  const parsed = parseRepository(repository);
  const root = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const budget = { reads: 0 };
  const { data: repo } = await github(root, budget);
  if (repo?.private !== false || repo?.visibility && repo.visibility !== 'public')
    throw new ApiError(400, 'PUBLIC_REPOSITORY_REQUIRED', 'Only public GitHub repositories are supported.');
  const canonical = parseRepository(repo.full_name);
  if (canonical.fullName.toLowerCase() !== parsed.fullName.toLowerCase() || !text(repo.default_branch, 255)) throw upstream();
  const project = { full_name: canonical.fullName, description: text(repo.description, 4096),
    default_branch: repo.default_branch.slice(0, 255), html_url: `https://github.com/${canonical.fullName}`, require_testsprite: requireTestSprite };
  let pull = null;
  if (pullNumber !== null) {
    const response = await github(`${root}/pulls/${pullNumber}`, budget);
    pull = response.data;
    if (pull?.number !== pullNumber || pull?.base?.repo?.full_name?.toLowerCase() !== canonical.fullName.toLowerCase()) throw upstream();
  }
  const baseRef = pull ? text(pull.base?.ref, 255) : project.default_branch;
  if (!baseRef) throw upstream();
  const { data: branch } = await github(`${root}/branches/${encodeURIComponent(baseRef)}`, budget);
  const headSha = pull ? pullMetadata(pull).head_sha : branch?.commit?.sha;
  if (!SHA.test(headSha)) throw upstream();
  const [{ data: runs, truncated: runsTruncated }, { data: statuses, truncated: statusesTruncated }, { data: pulls }] = await Promise.all([
    github(`${root}/commits/${headSha}/check-runs?per_page=100&filter=all`, budget),
    github(`${root}/commits/${headSha}/status?per_page=100`, budget),
    github(`${root}/pulls?state=open&sort=updated&direction=desc&per_page=20`, budget),
  ]);
  const requiredChecks = [];
  const branchChecks = branch?.protection?.required_status_checks;
  let policyKnown = branch?.protected === false || Boolean(branchChecks && Array.isArray(branchChecks.contexts));
  for (const name of branchChecks?.contexts || []) requiredChecks.push({ name, appId: null });
  for (const check of branchChecks?.checks || []) requiredChecks.push({ name: check.context, appId: check.app_id });
  // Inaccessible public rule metadata is incomplete policy, never an inferred pass.
  try {
    const { data: rules, truncated } = await github(`${root}/rules/branches/${encodeURIComponent(baseRef)}`, budget);
    if (!Array.isArray(rules) || truncated || rules.length > 100) policyKnown = false;
    else for (const rule of rules) {
      if (rule.type === 'required_status_checks') {
        if (!Array.isArray(rule.parameters?.required_status_checks)) policyKnown = false;
        for (const check of rule.parameters?.required_status_checks || []) requiredChecks.push({ name: check.context, appId: check.integration_id });
      }
      if (rule.type === 'workflows' || rule.type === 'required_deployments') policyKnown = false;
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) policyKnown = false;
    else throw error;
  }
  if (!Array.isArray(pulls)) throw upstream();
  const evaluated = evaluateReadiness({ headSha, checkRuns: { ...runs, truncated: runsTruncated },
    commitStatus: { ...statuses, truncated: statusesTruncated, html_url: `${project.html_url}/commit/${headSha}` },
    requireTestSprite, requiredChecks, policyKnown });
  return { project, snapshot: { head_sha: headSha, ref_name: pull ? pullMetadata(pull).head_ref : baseRef,
    pr_number: pullNumber, pr_title: pull ? pullMetadata(pull).title : null,
    html_url: pull ? pullMetadata(pull).html_url : `${project.html_url}/commit/${headSha}`, ...evaluated },
    pullRequests: pulls.slice(0, LIMITS.pulls).map(pullMetadata) };
}

const PROJECT_COLUMNS = 'id,owner_id,full_name,description,default_branch,html_url,require_testsprite,created_at,last_synced_at,last_attempted_at,last_pull_number,last_error_code,last_error_message,pull_requests';
const SNAPSHOT_COLUMNS = 'id,head_sha,ref_name,pr_number,pr_title,html_url,conclusion,checked_at,total,passed,failed,pending,reason,evidence_complete,invalidated_at,sync_error_code,sync_error_message';
const CHECK_COLUMNS = 'id,name,provider,status,conclusion,html_url,head_sha,completed_at';

function storageResult(result) {
  if (!result.error) return result.data;
  const message = result.error.message || '';
  if (message.includes('LL_NOT_FOUND')) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'This connection was not found.');
  if (message.includes('LL_PROJECT_LIMIT')) throw new ApiError(409, 'PROJECT_LIMIT', 'A maximum of five public repository connections is supported per account.');
  if (message.includes('LL_COOLDOWN')) throw new ApiError(429, 'SYNC_COOLDOWN', 'Wait ten minutes before changing this connection’s verification policy.', LIMITS.cacheSeconds);
  if (message.includes('LL_LEASE_LOST')) throw new ApiError(409, 'SYNC_CONFLICT', 'Another operation changed this connection. Reload before trying again.');
  throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Persistent storage is unavailable. No verification result was saved.');
}

export function createSdkStore(admin) {
  const db = admin.database;
  return {
    async health() { return !((await db.from('loopline_projects').select('id').limit(0)).error); },
    async list(owner) { return storageResult(await db.from('loopline_projects').select(PROJECT_COLUMNS).eq('owner_id', owner).order('created_at', { ascending: false }).limit(LIMITS.projects)); },
    async find(owner, repository) { return storageResult(await db.from('loopline_projects').select(PROJECT_COLUMNS).eq('owner_id', owner).eq('repository_key', repository.toLowerCase()).maybeSingle()); },
    async project(owner, id) { return storageResult(await db.from('loopline_projects').select(PROJECT_COLUMNS).eq('owner_id', owner).eq('id', id).maybeSingle()); },
    async snapshots(owner, id) { return storageResult(await db.from('loopline_snapshots').select(SNAPSHOT_COLUMNS).eq('owner_id', owner).eq('project_id', id).order('checked_at', { ascending: false }).order('id', { ascending: false }).limit(LIMITS.history)); },
    async checks(owner, id) { return storageResult(await db.from('loopline_checks').select(CHECK_COLUMNS).eq('owner_id', owner).eq('snapshot_id', id).order('name').limit(LIMITS.checks)); },
    async mutate(action, owner, projectId, payload = {}) {
      return storageResult(await db.rpc('loopline_admin', { p_action: action, p_owner_id: owner, p_project_id: projectId, p_payload: payload }));
    },
  };
}

function publicProject(row) {
  return Object.fromEntries(['id', 'full_name', 'description', 'default_branch', 'html_url', 'created_at', 'last_synced_at', 'require_testsprite'].map(key => [key, row[key]]));
}
function publicSnapshot(row) {
  const { total, passed, failed, pending, evidence_complete, invalidated_at, sync_error_code, sync_error_message, ...snapshot } = row;
  return { ...snapshot, summary: { total, passed, failed, pending } };
}
async function ownedProject(store, owner, id) {
  const project = await store.project(owner, id);
  if (!project || project.owner_id !== owner) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'This connection was not found.');
  return project;
}
async function details(store, owner, project, now, { retained = false, snapshotId, pullNumber } = {}) {
  const rows = (await store.snapshots(owner, project.id)).slice(0, LIMITS.history);
  const history = rows.map(row => ({ ...publicSnapshot(row), current: false }));
  const row = snapshotId ? rows.find(item => item.id === snapshotId && (item.pr_number ?? null) === pullNumber) : rows[0];
  if (snapshotId && !row) throw new ApiError(409, 'SYNC_CONFLICT', 'The retained target snapshot changed. Reload before trying again.');
  let snapshot = row ? publicSnapshot(row) : null;
  if (snapshot) {
    // Invalidations are target-specific: a failed PR read must not relabel another target's evidence.
    const stale = Boolean(row.invalidated_at) || now() - Date.parse(snapshot.checked_at) >= LIMITS.cacheSeconds * 1000;
    snapshot = { ...snapshot, checks: await store.checks(owner, snapshot.id), stale,
      current: !stale && !retained, ...(stale ? { conclusion: 'unverified',
        reason: `Retained evidence is stale and is not current. ${row.sync_error_message || 'Sync again to verify the latest head.'} Last recorded result: ${snapshot.conclusion}.` }
        : retained ? { reason: `Retained evidence as of ${snapshot.checked_at}; current HEAD has not been re-read. ${snapshot.reason}` } : {}) };
  }
  return { project: publicProject(project), snapshot, pullRequests: (project.pull_requests || []).slice(0, LIMITS.pulls), history };
}

let servicesPromise;
async function runtimeServices() {
  if (!servicesPromise) servicesPromise = (async () => {
    const baseUrl = globalThis.Deno?.env.get('INSFORGE_BASE_URL');
    const apiKey = globalThis.Deno?.env.get('API_KEY');
    const githubToken = globalThis.Deno?.env.get('GITHUB_TOKEN');
    if (!baseUrl || !apiKey) throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'The backend service is not configured.');
    const { createClient, createAdminClient } = await import('npm:@insforge/sdk@1.5.2');
    const admin = createAdminClient({ baseUrl, apiKey, timeout: 7000, retryCount: 0 });
    const store = createSdkStore(admin);
    return { store, github: createGitHubReader({ token: githubToken,
      onRateLimit: retryAfterSeconds => store.mutate('rate_limit', null, null, { retryAfterSeconds }) }), tokenConfigured: Boolean(githubToken),
      async authenticate(token) {
        const client = createClient({ baseUrl, accessToken: token, timeout: 7000, retryCount: 0, auth: { detectOAuthCallback: false } });
        const { data, error } = await client.auth.getCurrentUser();
        if (error || !UUID.test(data?.user?.id || '')) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to access your repository connections.');
        return data.user.id;
      } };
  })().catch(error => { servicesPromise = undefined; throw error; });
  return servicesPromise;
}

function validatePayload(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw invalid('Provide a JSON object with an action.');
  const keys = { health: [], list: [], connect: ['repository', 'requireTestSprite'], get: ['projectId'], sync: ['projectId', 'pullNumber'], disconnect: ['projectId'] };
  if (typeof body.action !== 'string' || !Object.hasOwn(keys, body.action)) throw invalid('Unknown action.');
  if (Object.keys(body).some(key => key !== 'action' && !keys[body.action].includes(key))) throw invalid('Unexpected request field.');
  if (body.action === 'connect') {
    parseRepository(body.repository);
    if (body.requireTestSprite !== undefined && typeof body.requireTestSprite !== 'boolean') throw invalid('requireTestSprite must be a boolean.');
  }
  if (['get', 'sync', 'disconnect'].includes(body.action) && (typeof body.projectId !== 'string' || !UUID.test(body.projectId))) throw invalid('projectId must be a UUID.');
  if (body.action === 'sync' && body.pullNumber != null && (!Number.isSafeInteger(body.pullNumber) || body.pullNumber <= 0 || body.pullNumber > 2147483647)) throw invalid('pullNumber must be null or a positive integer.');
  return body;
}

export function createHandler({ getServices = runtimeServices, now = Date.now } = {}) {
  const connections = new Map();
  function deniedClaim(claim) {
    const message = claim.code === 'GITHUB_RATE_LIMITED' ? 'GitHub public API rate limit reached. Try again after the reset.'
      : claim.reason === 'budget' ? 'The fresh-sync budget is exhausted. Retained evidence remains available; wait before another fresh read.'
        : claim.reason === 'lease' ? 'A fresh GitHub read is already in progress. Try again shortly.'
          : 'Wait briefly before another fresh GitHub read.';
    return new ApiError(429, claim.code || 'SYNC_COOLDOWN', message, claim.retryAfterSeconds);
  }
  async function refresh(store, github, owner, project, pullNumber) {
    const claim = await store.mutate('claim_sync', owner, project.id, { pullNumber });
    if (!claim.claimed) {
      if (claim.cached && UUID.test(claim.snapshotId || '')) return details(store, owner,
        await ownedProject(store, owner, project.id), now, { retained: true, snapshotId: claim.snapshotId, pullNumber });
      throw deniedClaim(claim);
    }
    let result;
    try {
      const evidence = await readGitHubSnapshot(github, project.full_name, project.require_testsprite, pullNumber);
      result = await store.mutate('persist', owner, project.id, { ...evidence, token: claim.token });
    } catch (error) {
      const failure = error instanceof ApiError ? error : upstream();
      await store.mutate('fail_sync', owner, project.id, { token: claim.token, code: failure.code, message: failure.message });
      throw failure;
    }
    return details(store, owner, await ownedProject(store, owner, project.id), now,
      { snapshotId: result.snapshotId, pullNumber });
  }
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      ...(ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !ORIGINS.has(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (!['GET', 'POST'].includes(request.method)) {
        headers.Allow = 'GET, POST, OPTIONS';
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST for API actions or GET for health.');
      }
      const url = new URL(request.url);
      let body;
      if (request.method === 'GET') {
        if ([...url.searchParams.keys()].some(key => key !== 'action') || ![null, 'health'].includes(url.searchParams.get('action'))) throw invalid('GET supports health only.');
        body = { action: 'health' };
      } else {
        if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new ApiError(415, 'JSON_REQUIRED', 'Use Content-Type: application/json.');
        if (Number(request.headers.get('content-length')) > LIMITS.bodyBytes) throw new ApiError(413, 'BODY_TOO_LARGE', 'The JSON body exceeds the size limit.');
        body = validatePayload(await boundedJson(request, LIMITS.bodyBytes));
      }
      const bearer = request.headers.get('authorization')?.match(/^Bearer ([^\s]{1,8192})$/i)?.[1];
      if (body.action !== 'health' && !bearer) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to access your repository connections.');
      const { store, authenticate, github, tokenConfigured = false } = await getServices();
      if (body.action === 'health') {
        let available = false;
        try { available = await store.health(); } catch { /* nonsecret status only */ }
        return json({ service: { name: 'loopline-api', status: 'ok' }, storage: { status: available ? 'available' : 'unavailable' },
          source: { provider: 'github', status: 'configured', access: 'public-read-only', tokenConfigured, liveProbe: false } }, available ? 200 : 503);
      }
      const owner = await authenticate(bearer);
      if (!UUID.test(owner || '')) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to access your repository connections.');
      if (body.action === 'list') return json({ projects: (await store.list(owner)).filter(p => p.owner_id === owner).map(publicProject) });
      if (body.action === 'connect') {
        const repository = parseRepository(body.repository).fullName;
        const requireTestSprite = body.requireTestSprite ?? true;
        const existing = await store.find(owner, repository);
        if (existing && existing.owner_id !== owner) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'This connection was not found.');
        if (existing) {
          if (existing.require_testsprite !== requireTestSprite) throw new ApiError(409, 'CONNECTION_EXISTS', 'Disconnect this connection before changing its verification policy.');
          return json(await refresh(store, github, owner, existing, null));
        }
        if ((await store.list(owner)).filter(p => p.owner_id === owner).length >= LIMITS.projects)
          throw new ApiError(409, 'PROJECT_LIMIT', 'A maximum of five public repository connections is supported per account.');
        const key = `${owner}:${repository.toLowerCase()}:${requireTestSprite}`;
        if (!connections.has(key)) {
          if (connections.size >= 32) throw new ApiError(503, 'SERVICE_BUSY', 'The service is busy. Try again shortly.');
          connections.set(key, (async () => {
            const claim = await store.mutate('claim_connect', owner, null, { repository });
            if (!claim.claimed) {
              if (claim.existing) {
                const project = await ownedProject(store, owner, claim.projectId);
                if (project.require_testsprite !== requireTestSprite) throw new ApiError(409, 'CONNECTION_EXISTS', 'Disconnect this connection before changing its verification policy.');
                return refresh(store, github, owner, project, null);
              }
              throw deniedClaim(claim);
            }
            let result;
            try {
              const evidence = await readGitHubSnapshot(github, repository, requireTestSprite);
              result = await store.mutate('persist', owner, null, { ...evidence, token: claim.token });
            } catch (error) {
              const failure = error instanceof ApiError ? error : upstream();
              await store.mutate('fail_sync', owner, null, { token: claim.token, code: failure.code, message: failure.message });
              throw failure;
            }
            return details(store, owner, await ownedProject(store, owner, result.projectId), now,
              { snapshotId: result.snapshotId, pullNumber: null });
          })().finally(() => connections.delete(key)));
        }
        return json(await connections.get(key));
      }
      const project = await ownedProject(store, owner, body.projectId);
      if (body.action === 'get') return json(await details(store, owner, project, now, { retained: true }));
      if (body.action === 'disconnect') {
        await store.mutate('disconnect', owner, project.id);
        return json({ success: true });
      }
      return json(await refresh(store, github, owner, project, body.pullNumber ?? null));
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(503, 'SERVICE_UNAVAILABLE', 'The backend service is unavailable. Try again later.');
      if (failure.retryAfterSeconds) headers['Retry-After'] = String(failure.retryAfterSeconds);
      return json({ error: { code: failure.code, message: failure.message,
        ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}) } }, failure.status);
    }
  };
}

export default createHandler();
