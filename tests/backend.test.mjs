import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  ApiError, LIMITS, TESTSPRITE_APP, parseRepository, safeEvidenceUrl, buildGitHubUrl,
  normalizeChecks, evaluateReadiness, createGitHubReader, readGitHubSnapshot, createHandler, createSdkStore,
} from '../functions/loopline-api.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT = '44444444-4444-4444-8444-444444444444';
const TIME = '2026-10-16T12:00:00.000Z';
const NOW = Date.parse(TIME);
const URL_ROOT = 'https://github.com/octocat/project';
const app = { id: 15368, slug: 'github-actions', owner: { id: 9919 }, html_url: 'https://github.com/apps/github-actions' };
const testsprite = { id: TESTSPRITE_APP.id, slug: TESTSPRITE_APP.slug, owner: { id: TESTSPRITE_APP.ownerId }, html_url: 'https://github.com/apps/testsprite' };
const run = (overrides = {}) => ({ id: 10, name: 'CI', head_sha: HEAD, status: 'completed', conclusion: 'success',
  completed_at: TIME, html_url: `${URL_ROOT}/actions/runs/10`, app, ...overrides });
const status = (overrides = {}) => ({ id: 20, context: 'deploy', state: 'success', updated_at: TIME,
  target_url: 'https://example.com/build/20', creator: { id: 200, login: 'builder' }, ...overrides });
function readiness(runs = [], statuses = [], overrides = {}) {
  return evaluateReadiness({ headSha: HEAD, checkRuns: { total_count: runs.length, check_runs: runs },
    commitStatus: { sha: HEAD, total_count: statuses.length, statuses }, requireTestSprite: false, ...overrides });
}

test('repository parser accepts only GitHub repository identifiers and exact HTTPS repository URLs', () => {
  assert.deepEqual(parseRepository(' hemanthreddykoduru/Loopline '), { owner: 'hemanthreddykoduru', repo: 'Loopline', fullName: 'hemanthreddykoduru/Loopline' });
  assert.equal(parseRepository('https://github.com/octocat/project/').fullName, 'octocat/project');
  for (const value of ['http://github.com/o/r', 'https://evil.com/o/r', '//github.com/o/r', 'https://github.com.evil.com/o/r',
    'https://github.com@evil.com/o/r', 'https://user@github.com/o/r', 'https://github.com:443/o/r', 'https://github.com/o/r?x=1',
    'https://github.com/o/r#x', 'https://github.com/o/r/tree/main', 'https://github.com/o/../r', 'o/..', 'o/%2e%2e',
    'o/r\n', 'o/r\\x', 'o/r/x', '127.0.0.1/project', 'o/r with space', null, {}, '']) {
    assert.throws(() => parseRepository(value), ApiError, String(value));
  }
});

test('API origin is pinned and evidence links reject unsafe schemes, credentials and local addresses', () => {
  assert.equal(buildGitHubUrl('/repos/octocat/project/branches/feature%2Fx'), 'https://api.github.com/repos/octocat/project/branches/feature%2Fx');
  for (const path of ['https://evil.com', '//evil.com/repos/o/r', '/repos/../private', '/repos/o/r/%2e%2e/private', '/repos/o/r\\@evil.com', '/other/o/r'])
    assert.throws(() => buildGitHubUrl(path), ApiError);
  assert.equal(safeEvidenceUrl('https://github.com/o/r/actions/runs/1'), 'https://github.com/o/r/actions/runs/1');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com/a', 'https://user:password@example.com/a',
    'https://localhost/a', 'https://localhost./a', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://10.0.0.1/a', 'https://169.254.169.254/a',
    'https://172.20.1.1/a', 'https://192.168.1.1/a', 'https://[::1]/a', 'https://example.com:444/a']) assert.equal(safeEvidenceUrl(url), null, url);
});

test('zero, missing and stale SHA evidence never verifies a new commit', () => {
  assert.equal(readiness().conclusion, 'unverified');
  const staleRuns = readiness([run({ head_sha: OLD })]);
  assert.equal(staleRuns.conclusion, 'unverified');
  assert.equal(staleRuns.checks.length, 0);
  assert.equal(readiness([], [status()], { commitStatus: { sha: OLD, total_count: 1, statuses: [status()] } }).conclusion, 'unverified');
  assert.equal(readiness([run()], [], { requiredChecks: [{ name: 'security', appId: null }] }).conclusion, 'unverified');
  assert.equal(readiness([run()], [], { requiredChecks: [{ name: 'CI', appId: 42 }] }).conclusion, 'unverified');
  assert.equal(readiness([run()], [], { policyKnown: false }).conclusion, 'unverified');
});

test('real current success, failure and pending states aggregate conservatively', () => {
  const passed = readiness([run()], [status()]);
  assert.equal(passed.conclusion, 'ready');
  assert.deepEqual(passed.summary, { total: 2, passed: 2, failed: 0, pending: 0 });
  assert.equal(readiness([run({ conclusion: 'failure' })], [status({ state: 'pending' })]).conclusion, 'blocked');
  assert.equal(readiness([run({ status: 'queued', conclusion: null, completed_at: null })]).conclusion, 'running');
  assert.equal(readiness([], [status({ state: 'error' })]).conclusion, 'blocked');
  assert.equal(readiness([], [status({ state: 'pending' })]).conclusion, 'running');
  for (const conclusion of ['neutral', 'skipped', 'stale', 'unknown'])
    assert.equal(readiness([run({ conclusion })]).conclusion, 'unverified', conclusion);
  assert.equal(readiness([run({ completed_at: null })]).conclusion, 'unverified');
  assert.equal(readiness([run({ html_url: 'javascript:alert(1)' })]).conclusion, 'unverified');
});

test('a commit status without its own reported target URL cannot establish successful evidence', () => {
  const missingLink = status({ target_url: null });
  const result = readiness([], [missingLink], {
    commitStatus: { sha: HEAD, total_count: 1, statuses: [missingLink], html_url: `${URL_ROOT}/commit/${HEAD}` },
  });
  assert.equal(result.checks[0].html_url, null);
  assert.equal(result.conclusion, 'unverified');
});

test('reruns deduplicate by provider/name and new queued runs supersede old successes', () => {
  assert.equal(readiness([run({ id: 9, conclusion: 'failure' }), run({ id: 10 })]).conclusion, 'ready');
  const rerun = readiness([run({ id: 10 }), run({ id: 11, status: 'queued', conclusion: null, completed_at: null })]);
  assert.equal(rerun.conclusion, 'running');
  assert.equal(rerun.summary.total, 1);
  assert.equal(rerun.checks[0].id, 'check:11');
  const statuses = readiness([], [status({ id: 2, state: 'failure' }), status({ id: 3 })]);
  assert.equal(statuses.conclusion, 'ready');
  assert.equal(statuses.summary.total, 1);
  assert.equal(readiness([run(), run({ id: 11, app: testsprite })]).summary.total, 2);
});

test('TestSprite evidence requires the pinned app and publisher, never an arbitrary workflow/context name', () => {
  assert.equal(readiness([run({ name: 'TestSprite all passed' })], [], { requireTestSprite: true }).conclusion, 'unverified');
  assert.equal(readiness([], [status({ context: 'TestSprite' })], { requireTestSprite: true }).conclusion, 'unverified');
  assert.equal(readiness([run({ app: { ...testsprite, id: 1 } })], [], { requireTestSprite: true }).conclusion, 'unverified');
  assert.equal(readiness([run({ app: { ...testsprite, owner: { id: 1 } } })], [], { requireTestSprite: true }).conclusion, 'unverified');
  assert.equal(readiness([run({ app: testsprite })], [], { requireTestSprite: true }).conclusion, 'ready');
  assert.equal(readiness([run({ app: testsprite, head_sha: OLD })], [], { requireTestSprite: true }).conclusion, 'unverified');
});

test('truncated, malformed and excessive evidence cannot become ready', () => {
  assert.equal(readiness([run()], [], { checkRuns: { total_count: 101, check_runs: [run()] } }).conclusion, 'unverified');
  assert.equal(readiness([run()], [], { commitStatus: { sha: HEAD, total_count: 2, statuses: [] } }).conclusion, 'unverified');
  assert.equal(readiness([run()], [], { checkRuns: { total_count: 1, check_runs: [run()], truncated: true } }).conclusion, 'unverified');
  assert.equal(readiness([null]).conclusion, 'unverified');
  const many = Array.from({ length: 100 }, (_, i) => run({ id: i + 1, name: `job ${i}` }));
  const result = readiness(many, [status()]);
  assert.equal(result.conclusion, 'unverified');
  assert.equal(result.checks.length, LIMITS.checks);
  assert.throws(() => normalizeChecks('short', {}, {}), ApiError);
});

const respond = (data, statusCode = 200, headers = {}) => new Response(JSON.stringify(data), { status: statusCode, headers });

test('GitHub reader uses GET, fixed host, no redirects or public token requirement, and bounded caching', async () => {
  const calls = [];
  const github = createGitHubReader({ fetchImpl: async (url, options) => { calls.push({ url, options }); return respond({ statuses: [] }); } });
  const path = `/repos/octocat/project/commits/${HEAD}/status?per_page=100`;
  await Promise.all([github(path, { reads: 0 }), github(path, { reads: 0 })]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(new URL(calls[0].url).origin, 'https://api.github.com');
  await github('/repos/octocat/project/branches/main', { reads: 0 });
  await github('/repos/octocat/project/branches/main', { reads: 0 });
  assert.equal(calls.length, 3, 'mutable HEAD is not cached');
  await assert.rejects(() => github(path, { reads: 8 }), error => error.code === 'GITHUB_READ_LIMIT');
});

test('rate limits, redirects, upstream errors and timeouts become sanitized non-success errors', async () => {
  let calls = 0;
  const github = createGitHubReader({ now: () => NOW, fetchImpl: async () => { calls++; return respond({ private: 'never exposed' }, 403,
    { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 120) }); } });
  for (let i = 0; i < 2; i++) await assert.rejects(() => github('/repos/o/r', { reads: 0 }), error => error.status === 429 && error.retryAfterSeconds === 120 && !error.message.includes('private'));
  assert.equal(calls, 1, 'rate-limited requests do not keep hitting GitHub');
  for (const statusCode of [301, 500, 403]) {
    const failed = createGitHubReader({ fetchImpl: async () => respond({ secret: 'hidden' }, statusCode) });
    await assert.rejects(() => failed('/repos/o/r', { reads: 0 }), error => error.status === 502 && !error.message.includes('hidden'));
  }
  const slow = createGitHubReader({ timeoutMs: 5, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('network details')), { once: true });
  }) });
  await assert.rejects(() => slow('/repos/o/r', { reads: 0 }), error => error.status === 504 && error.code === 'GITHUB_TIMEOUT');
});

function fakeGitHub({ head = HEAD, prHead = OLD, runs, privateRepo = false, fullName = 'octocat/project', includeVisibility = true,
  now = Date.now, onRateLimit } = {}) {
  const paths = [];
  const github = createGitHubReader({ fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    assert.equal(options.method, 'GET');
    if (path === '/repos/octocat/project') return respond({ full_name: fullName, private: privateRepo,
      ...(includeVisibility ? { visibility: privateRepo ? 'private' : 'public' } : {}), default_branch: 'main', description: 'Public repository' });
    if (path.endsWith('/branches/main') && !path.includes('/rules/')) return respond({ commit: { sha: head }, protected: false });
    if (path.endsWith('/rules/branches/main')) return respond([]);
    const pullMatch = path.match(/\/pulls\/(\d+)$/);
    if (pullMatch) {
      const number = Number(pullMatch[1]);
      return respond({ number, title: 'Exact PR head', head: { sha: number === 7 ? prHead : number.toString(16).padStart(40, '0'), ref: `feature-${number}` },
        base: { ref: 'main', repo: { full_name: 'octocat/project' } }, html_url: `${URL_ROOT}/pull/${number}` });
    }
    if (path.endsWith('/pulls')) return respond([]);
    if (path.endsWith('/check-runs')) {
      const sha = path.split('/').at(-2);
      const data = runs ?? [run({ head_sha: sha })];
      return respond({ total_count: data.length, check_runs: data });
    }
    if (path.endsWith('/status')) return respond({ sha: path.split('/').at(-2), total_count: 0, statuses: [] });
    throw new Error(`Unexpected path ${path}`);
  }, now, onRateLimit });
  return { github, paths };
}

test('snapshot reads public metadata and evidence for exact default or PR HEAD, within the request budget', async () => {
  const { github, paths } = fakeGitHub();
  const branch = await readGitHubSnapshot(github, 'octocat/project', false);
  assert.equal(branch.snapshot.head_sha, HEAD);
  assert.equal(branch.snapshot.conclusion, 'ready');
  assert.equal(paths.length, 6);
  const pr = await readGitHubSnapshot(github, 'octocat/project', false, 7);
  assert.equal(pr.snapshot.head_sha, OLD);
  assert.equal(pr.snapshot.pr_number, 7);
  assert.equal(pr.snapshot.ref_name, 'feature-7');
  assert.ok(paths.includes(`/repos/octocat/project/commits/${OLD}/check-runs`));
  assert.ok(paths.length <= 13);
  const mismatched = fakeGitHub({ runs: [run({ head_sha: OLD })] });
  assert.equal((await readGitHubSnapshot(mismatched.github, 'octocat/project', false)).snapshot.conclusion, 'unverified');
  const missingVisibility = fakeGitHub({ includeVisibility: false });
  await assert.rejects(() => readGitHubSnapshot(missingVisibility.github, 'octocat/project', false), error => error.code === 'PUBLIC_REPOSITORY_REQUIRED');
  assert.equal(missingVisibility.paths.length, 1);
  const malformedMetadata = fakeGitHub({ fullName: 'octocat/project/tree/main' });
  await assert.rejects(() => readGitHubSnapshot(malformedMetadata.github, 'octocat/project', false), error => error.code === 'GITHUB_UNAVAILABLE');
  assert.equal(malformedMetadata.paths.length, 1);
  const privateSource = fakeGitHub({ privateRepo: true });
  await assert.rejects(() => readGitHubSnapshot(privateSource.github, 'octocat/project', false), error => error.code === 'PUBLIC_REPOSITORY_REQUIRED');
  assert.equal(privateSource.paths.length, 1);
});

function memoryBoundary({ foreignProject = false, githubFailure = false, guarded = false } = {}) {
  let clock = NOW;
  let failure = githubFailure ? new ApiError(502, 'GITHUB_UNAVAILABLE', 'GitHub is unavailable. Retained evidence is not current.') : null;
  let globalBlockedUntil = 0;
  const rows = new Map();
  const histories = new Map();
  const checkRows = new Map();
  const budgets = new Map();
  const claims = new Map();
  const mutations = [];
  const calls = [];
  const githubFixture = fakeGitHub({ now: () => clock });
  const store = {
    health: async () => true,
    list: async owner => [...rows.values()].filter(row => row.owner_id === owner),
    find: async (owner, name) => [...rows.values()].find(row => row.owner_id === owner && row.full_name.toLowerCase() === name.toLowerCase()),
    project: async (owner, id) => { calls.push(['project', owner, id]); return foreignProject ? rows.get(id) : rows.get(id)?.owner_id === owner ? rows.get(id) : null; },
    snapshots: async (owner, id) => { calls.push(['snapshots', owner, id]); return histories.get(id) || []; },
    checks: async (owner, id) => { calls.push(['checks', owner, id]); return checkRows.get(id) || []; },
    mutate: async (action, owner, id, payload = {}) => {
      mutations.push({ action, owner, id, payload });
      if (action === 'rate_limit') { globalBlockedUntil = Math.max(globalBlockedUntil, clock + payload.retryAfterSeconds * 1000); return { success: true }; }
      if (action === 'claim_sync' || action === 'claim_connect') {
        if (id) assert.equal(rows.get(id)?.owner_id, owner, 'claim must be owner-scoped');
        if (guarded && globalBlockedUntil > clock) return { claimed: false, code: 'GITHUB_RATE_LIMITED', retryAfterSeconds: Math.ceil((globalBlockedUntil - clock) / 1000) };
        if (action === 'claim_connect') {
          const existing = [...rows.values()].find(row => row.owner_id === owner && row.full_name.toLowerCase() === payload.repository.toLowerCase());
          if (existing) return { claimed: false, existing: true, projectId: existing.id };
        }
        const target = payload.pullNumber ?? null;
        const cached = (histories.get(id) || []).find(row => (row.pr_number ?? null) === target);
        if (guarded && cached && !cached.invalidated_at && clock - Date.parse(cached.checked_at) < LIMITS.cacheSeconds * 1000)
          return { claimed: false, cached: true, projectId: id, snapshotId: cached.id };
        const attempts = (budgets.get(owner) || []).filter(value => value > clock - 600000);
        if (guarded) {
          if (claims.has(owner)) return { claimed: false, code: 'SYNC_COOLDOWN', reason: 'lease', retryAfterSeconds: 120 };
          const intervalWait = Math.max(0, Math.ceil(((attempts.at(-1) ?? -Infinity) + 10000 - clock) / 1000));
          const budgetWait = attempts.length >= 6 ? Math.ceil((attempts[0] + 600000 - clock) / 1000) : 0;
          if (Math.max(intervalWait, budgetWait) > 0) return { claimed: false, code: 'SYNC_COOLDOWN',
            reason: budgetWait ? 'budget' : 'minimum_interval', retryAfterSeconds: Math.max(intervalWait, budgetWait) };
          budgets.set(owner, [...attempts, clock]);
        }
        const token = randomUUID();
        claims.set(owner, { token, id, target });
        if (id) {
          rows.get(id).last_attempted_at = new Date(clock).toISOString();
          for (const snapshot of histories.get(id) || []) if ((snapshot.pr_number ?? null) === target)
            Object.assign(snapshot, { invalidated_at: new Date(clock).toISOString(), sync_error_message: 'A read of this target has not completed.' });
        }
        return { claimed: true, token };
      }
      if (action === 'persist') {
        const projectId = id || PROJECT;
        const previous = rows.get(projectId);
        assert.equal(claims.get(owner)?.token, payload.token, 'persist must use the reserved lease');
        const checkedAt = new Date(clock).toISOString();
        const project = { ...payload.project, id: projectId, owner_id: owner, created_at: previous?.created_at || checkedAt,
          last_synced_at: checkedAt, last_attempted_at: checkedAt, last_error_code: null, last_error_message: null, pull_requests: payload.pullRequests };
        assert.ok(!previous || previous.owner_id === owner, 'mutation must retain ownership');
        rows.set(projectId, project);
        const { checks, summary, ...snapshot } = payload.snapshot;
        const snapshotId = randomUUID();
        histories.set(projectId, [{ ...snapshot, ...summary, id: snapshotId, checked_at: checkedAt }, ...(histories.get(projectId) || [])].slice(0, 10));
        checkRows.set(snapshotId, checks);
        claims.delete(owner);
        return { projectId, snapshotId, saved: true };
      }
      if (action === 'fail_sync') {
        const claim = claims.get(owner);
        assert.equal(claim?.token, payload.token);
        if (id) {
          assert.equal(rows.get(id)?.owner_id, owner);
          Object.assign(rows.get(id), { last_error_code: payload.code, last_error_message: payload.message });
          for (const snapshot of histories.get(id) || []) if ((snapshot.pr_number ?? null) === claim.target)
            Object.assign(snapshot, { invalidated_at: new Date(clock).toISOString(), sync_error_message: payload.message });
        }
        claims.delete(owner);
        return { success: true };
      }
      assert.equal(rows.get(id)?.owner_id, owner, 'all private writes must be owner-scoped');
      if (action === 'disconnect') { rows.delete(id); histories.delete(id); }
      return { success: true };
    },
  };
  const authenticate = async token => {
    calls.push(['authenticate', token]);
    if (token === 'alice') return OWNER;
    if (token === 'bob') return OTHER;
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in.');
  };
  const getServices = async () => ({ store, authenticate,
    github: async (...args) => { if (failure) throw failure; return githubFixture.github(...args); } });
  const newHandler = () => createHandler({ now: () => clock, getServices });
  const handler = newHandler();
  function seed() {
    rows.set(PROJECT, { id: PROJECT, owner_id: OWNER, full_name: 'octocat/project', description: 'Public repository', default_branch: 'main',
      html_url: URL_ROOT, require_testsprite: false, created_at: TIME, last_synced_at: TIME, last_attempted_at: TIME, pull_requests: [] });
    histories.set(PROJECT, [{ id: SNAPSHOT, head_sha: HEAD, ref_name: 'main', pr_number: null, pr_title: null,
      html_url: `${URL_ROOT}/commit/${HEAD}`, conclusion: 'ready', checked_at: TIME, total: 1, passed: 1, failed: 0, pending: 0, reason: 'Exact head passed.' }]);
    checkRows.set(SNAPSHOT, [run()]);
  }
  return { store, handler, newHandler, rows, histories, mutations, calls, seed, budgets, paths: githubFixture.paths,
    advance: seconds => { clock += seconds * 1000; }, failGitHub: error => { failure = error; },
    blockGitHub: seconds => { globalBlockedUntil = clock + seconds * 1000; } };
}
const request = (body, token, extras = {}) => new Request('https://service.example.com/functions/loopline-api', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extras },
});

test('anonymous and invalid-token private actions are denied before private reads or mutations', async () => {
  const fixture = memoryBoundary();
  for (const action of ['list', 'connect', 'get', 'sync', 'disconnect']) {
    const body = action === 'connect' ? { action, repository: 'octocat/project' } : action === 'list' ? { action } : { action, projectId: PROJECT };
    assert.equal((await fixture.handler(request(body))).status, 401, action);
    assert.equal((await fixture.handler(request(body, 'invalid'))).status, 401, action);
  }
  assert.equal(fixture.mutations.length, 0);
  assert.equal(fixture.paths.length, 0);
  assert.equal(fixture.calls.filter(call => call[0] === 'project').length, 0);
});

test('cross-user get/sync/disconnect reject foreign records even if a boundary returns the wrong owner', async () => {
  const fixture = memoryBoundary({ foreignProject: true });
  fixture.seed();
  for (const action of ['get', 'sync', 'disconnect']) {
    const response = await fixture.handler(request({ action, projectId: PROJECT }, 'bob'));
    assert.equal(response.status, 404, action);
    assert.equal((await response.json()).error.code, 'PROJECT_NOT_FOUND');
  }
  const list = await fixture.handler(request({ action: 'list' }, 'bob'));
  assert.deepEqual(await list.json(), { projects: [] });
  assert.equal(fixture.mutations.length, 0);
  assert.equal(fixture.paths.length, 0);
  assert.equal(fixture.calls.filter(call => ['snapshots', 'checks'].includes(call[0])).length, 0);
  assert.equal(fixture.rows.size, 1);
});

test('owner is derived from authentication; connect persists one atomic evidence bundle', async () => {
  const fixture = memoryBoundary();
  const spoof = await fixture.handler(request({ action: 'connect', repository: 'octocat/project', userId: OTHER }, 'alice'));
  assert.equal(spoof.status, 400);
  const response = await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.project.id, PROJECT);
  assert.equal(body.project.owner_id, undefined);
  assert.equal(body.snapshot.head_sha, HEAD);
  assert.equal(body.snapshot.conclusion, 'ready');
  assert.equal(body.history.length, 1);
  assert.deepEqual(fixture.mutations.map(item => item.action), ['claim_connect', 'persist']);
  assert.equal(fixture.mutations[1].owner, OWNER);
  assert.equal(fixture.mutations[1].payload.snapshot.checks[0].head_sha, HEAD);
  const retained = await fixture.handler(request({ action: 'get', projectId: PROJECT }, 'alice'));
  assert.equal((await retained.json()).snapshot.current, false);
  assert.equal(fixture.paths.length, 6, 'get does not poll GitHub');
});

test('default policy requires TestSprite and connects are deduplicated per verified owner', async () => {
  const fixture = memoryBoundary();
  const [first, second] = await Promise.all([
    fixture.handler(request({ action: 'connect', repository: 'octocat/project' }, 'alice')),
    fixture.handler(request({ action: 'connect', repository: 'octocat/project' }, 'alice')),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).project.require_testsprite, true);
  assert.equal((await second.json()).snapshot.conclusion, 'unverified');
  assert.deepEqual(fixture.mutations.map(item => item.action), ['claim_connect', 'persist']);
});

test('upstream failure stores a stale marker and never serves retained green as current', async () => {
  const fixture = memoryBoundary({ githubFailure: true });
  fixture.seed();
  const failed = await fixture.handler(request({ action: 'sync', projectId: PROJECT }, 'alice'));
  assert.equal(failed.status, 502);
  assert.deepEqual(fixture.mutations.map(m => m.action), ['claim_sync', 'fail_sync']);
  const retained = await fixture.handler(request({ action: 'get', projectId: PROJECT }, 'alice'));
  const body = await retained.json();
  assert.equal(body.snapshot.conclusion, 'unverified');
  assert.equal(body.snapshot.stale, true);
  assert.equal(body.snapshot.current, false);
  assert.match(body.snapshot.reason, /stale/);
  assert.equal(body.history[0].conclusion, 'ready', 'historical evidence is preserved');
  assert.equal(body.history[0].current, false);
});

test('interrupted sync, age expiry and durable cooldown do not imply a fresh verification', async () => {
  const fixture = memoryBoundary();
  fixture.seed();
  fixture.histories.get(PROJECT)[0].invalidated_at = '2026-10-16T12:00:01.000Z';
  let response = await fixture.handler(request({ action: 'get', projectId: PROJECT }, 'alice'));
  assert.equal((await response.json()).snapshot.conclusion, 'unverified');
  fixture.rows.get(PROJECT).last_attempted_at = TIME;
  fixture.rows.get(PROJECT).last_synced_at = '2026-10-16T11:40:00.000Z';
  fixture.rows.get(PROJECT).last_attempted_at = '2026-10-16T11:40:00.000Z';
  fixture.store.snapshots = async () => [{ id: SNAPSHOT, head_sha: HEAD, checked_at: '2026-10-16T11:40:00.000Z', conclusion: 'ready',
    total: 1, passed: 1, failed: 0, pending: 0, reason: 'Passed earlier.' }];
  response = await fixture.handler(request({ action: 'get', projectId: PROJECT }, 'alice'));
  assert.equal((await response.json()).snapshot.stale, true);
  fixture.store.mutate = async () => ({ claimed: false, cached: false, retryAfterSeconds: 100 });
  response = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '100');
  assert.equal(fixture.paths.length, 0);
});

test('disconnect deletes only the authenticated owner connection through the admin RPC boundary', async () => {
  const fixture = memoryBoundary();
  fixture.seed();
  const response = await fixture.handler(request({ action: 'disconnect', projectId: PROJECT }, 'alice'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(fixture.rows.size, 0);
  assert.equal(fixture.mutations[0].owner, OWNER);
});

test('CORS, JSON shape, method, UUID, PR number and body size are validated', async () => {
  const fixture = memoryBoundary();
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173', 'https://hemanthreddykoduru.github.io', 'https://loopline-self.vercel.app', 'https://loopline-hackathon.vercel.app']) {
    const response = await fixture.handler(new Request('https://service.example.com', { method: 'OPTIONS', headers: { origin } }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  assert.equal((await fixture.handler(request({ action: 'health' }, null, { origin: 'https://evil.com' }))).status, 403);
  for (const body of [{ action: 'sync', projectId: 'invalid' }, { action: 'sync', projectId: PROJECT, pullNumber: 1.5 },
    { action: 'sync', projectId: PROJECT, pullNumber: -1 }, { action: 'sync', projectId: PROJECT, pullNumber: '7' },
    { action: 'connect', repository: 'o/r', requireTestSprite: 'false' }, { action: '__proto__' },
    { action: ['health'] }, { action: 'get', projectId: [PROJECT] },
    { action: 'rate_limit', retryAfterSeconds: 3600 }, { action: 'claim_connect', repository: 'o/r' }, [], null]) {
    assert.equal((await fixture.handler(request(body, 'alice'))).status, 400, JSON.stringify(body));
  }
  assert.equal((await fixture.handler(request({ action: 'health', overflow: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await fixture.handler(new Request('https://service.example.com', { method: 'DELETE' }))).status, 405);
  assert.equal((await fixture.handler(new Request('https://service.example.com', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } }))).status, 400);
  assert.equal((await fixture.handler(new Request('https://service.example.com', { method: 'POST', body: '{}' }))).status, 415);
  const health = await fixture.handler(request({ action: 'health' }));
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.storage.status, 'available');
  assert.equal(body.source.liveProbe, false);
  assert.equal(body.projects, undefined);
});

test('SDK store owner-filters and bounds all reads and sends every mutation through the one narrow RPC', async () => {
  const traces = [];
  const db = {
    from(table) {
      const trace = { table, filters: [], limit: null };
      traces.push(trace);
      const builder = {
        select(columns) { trace.columns = columns; return builder; },
        eq(key, value) { trace.filters.push([key, value]); return builder; },
        order() { return builder; }, limit(value) { trace.limit = value; return builder; },
        maybeSingle() { trace.single = true; return builder; },
        then(resolve) { resolve({ data: trace.single ? null : [], error: null }); },
      };
      return builder;
    },
    async rpc(name, args) { traces.push({ rpc: name, args }); return { data: { success: true }, error: null }; },
  };
  const store = createSdkStore({ database: db });
  await store.list(OWNER);
  await store.find(OWNER, 'Octocat/project_with_underscores');
  await store.project(OWNER, PROJECT);
  await store.snapshots(OWNER, PROJECT);
  await store.checks(OWNER, SNAPSHOT);
  await store.mutate('disconnect', OWNER, PROJECT);
  for (const trace of traces.filter(t => t.table)) {
    assert.ok(trace.filters.some(([key, value]) => key === 'owner_id' && value === OWNER));
    assert.ok(trace.single || trace.limit <= 100);
    assert.notEqual(trace.columns, '*');
  }
  assert.ok(traces[1].filters.some(([key, value]) => key === 'repository_key' && value === 'octocat/project_with_underscores'));
  assert.equal(traces.at(-1).rpc, 'loopline_admin');
  assert.equal(traces.at(-1).args.p_owner_id, OWNER);
});

test('failed connect does not create a partial connection; cached sync avoids GitHub reads', async () => {
  const failed = memoryBoundary({ githubFailure: true });
  assert.equal((await failed.handler(request({ action: 'connect', repository: 'octocat/project' }, 'alice'))).status, 502);
  assert.deepEqual(failed.mutations.map(item => item.action), ['claim_connect', 'fail_sync']);
  assert.equal(failed.rows.size, 0);
  const cached = memoryBoundary();
  cached.seed();
  cached.store.mutate = async () => ({ claimed: false, cached: true, snapshotId: SNAPSHOT, retryAfterSeconds: 500 });
  const response = await cached.handler(request({ action: 'sync', projectId: PROJECT }, 'alice'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).snapshot.current, false);
  assert.equal(cached.paths.length, 0);
});

test('an upstream policy read failure returns an error rather than a successful current snapshot', async () => {
  const fixture = fakeGitHub();
  const github = async (path, budget) => {
    if (path.includes('/rules/branches/')) throw new ApiError(502, 'GITHUB_UNAVAILABLE', 'GitHub is unavailable.');
    return fixture.github(path, budget);
  };
  await assert.rejects(() => readGitHubSnapshot(github, 'octocat/project', false), error => error.status === 502);
});

test('branch to PR is available after ten seconds and revisiting either target returns its own retained checks', async () => {
  const fixture = memoryBoundary({ guarded: true });
  const connected = await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  assert.equal(connected.status, 200);
  const branch = await connected.json();
  const immediate = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'));
  assert.equal(immediate.status, 429);
  assert.equal(immediate.headers.get('retry-after'), '10');
  const error = (await immediate.json()).error;
  assert.deepEqual(Object.keys(error).sort(), ['code', 'message', 'retryAfterSeconds']);
  assert.equal(error.code, 'SYNC_COOLDOWN');
  const beforePr = fixture.paths.length;
  fixture.advance(10);
  const response = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'));
  assert.equal(response.status, 200);
  const pr = await response.json();
  assert.equal(pr.snapshot.pr_number, 7);
  assert.equal(pr.snapshot.head_sha, OLD);
  assert.ok(pr.snapshot.checks.every(check => check.head_sha === OLD));
  assert.equal(pr.snapshot.current, true);
  assert.ok(fixture.paths.length > beforePr);
  const afterPr = fixture.paths.length;
  const branchAgain = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: null }, 'alice'));
  const cachedBranch = await branchAgain.json();
  assert.equal(branchAgain.status, 200);
  assert.equal(cachedBranch.snapshot.id, branch.snapshot.id);
  assert.equal(cachedBranch.snapshot.head_sha, HEAD);
  assert.equal(cachedBranch.snapshot.pr_number, null);
  assert.ok(cachedBranch.snapshot.checks.every(check => check.head_sha === HEAD));
  assert.equal(cachedBranch.snapshot.current, false);
  assert.equal(cachedBranch.snapshot.checked_at, branch.snapshot.checked_at);
  assert.equal(cachedBranch.history[0].id, pr.snapshot.id, 'selection is not the latest different-target history entry');
  const prAgain = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'));
  const cachedPr = await prAgain.json();
  assert.equal(cachedPr.snapshot.id, pr.snapshot.id);
  assert.equal(cachedPr.snapshot.current, false);
  const connectAgain = await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  assert.equal((await connectAgain.json()).snapshot.id, branch.snapshot.id);
  assert.equal(fixture.paths.length, afterPr, 'target reuse performs no fresh GitHub reads');
  assert.equal(fixture.budgets.get(OWNER).length, 2);
});

test('rapid target switching is bounded and disconnect/reconnect or another handler cannot reset the durable budget', async () => {
  const fixture = memoryBoundary({ guarded: true });
  assert.equal((await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'))).status, 200);
  for (let number = 7; number <= 11; number++) {
    fixture.advance(10);
    const response = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: number }, 'alice'));
    assert.equal(response.status, 200, `fresh PR ${number}`);
    const reads = fixture.paths.length;
    const rapid = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: number + 1 }, 'alice'));
    assert.equal(rapid.status, 429);
    assert.equal(fixture.paths.length, reads, 'denied target changes never hit GitHub');
  }
  assert.equal(fixture.budgets.get(OWNER).length, LIMITS.freshSyncsPerWindow);
  fixture.advance(10);
  const exhausted = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 12 }, 'alice'));
  assert.equal(exhausted.status, 429);
  const error = (await exhausted.json()).error;
  assert.equal(error.retryAfterSeconds, 540);
  assert.match(error.message, /budget/);
  const reads = fixture.paths.length;
  const cached = await fixture.handler(request({ action: 'sync', projectId: PROJECT }, 'alice'));
  assert.equal(cached.status, 200, 'already-observed targets remain available without another fresh attempt');
  assert.equal((await cached.json()).snapshot.head_sha, HEAD);
  assert.equal(fixture.paths.length, reads);
  assert.equal((await fixture.handler(request({ action: 'disconnect', projectId: PROJECT }, 'alice'))).status, 200);
  const recreatedHandler = fixture.newHandler();
  for (const repository of ['octocat/project', 'octocat/another-project']) {
    const reconnect = await recreatedHandler(request({ action: 'connect', repository, requireTestSprite: false }, 'alice'));
    assert.equal(reconnect.status, 429);
    assert.equal((await reconnect.json()).error.retryAfterSeconds, 540);
  }
  assert.equal(fixture.paths.length, reads);
  assert.equal(fixture.rows.size, 0, 'denied reconnect leaves no partial connection');
  fixture.advance(540);
  const reopened = await recreatedHandler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  assert.equal(reopened.status, 200, 'the oldest attempt expires at the rolling-window boundary');
  assert.equal(fixture.budgets.get(OWNER).length, 6);
});

test('an in-flight lease blocks a different fresh target without blocking an existing target cache', async () => {
  const fixture = memoryBoundary({ guarded: true });
  await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  fixture.advance(10);
  const lease = await fixture.store.mutate('claim_sync', OWNER, PROJECT, { pullNumber: 7 });
  assert.equal(lease.claimed, true);
  const blocked = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 8 }, 'alice'));
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error.message, /in progress/);
  const cached = await fixture.handler(request({ action: 'sync', projectId: PROJECT }, 'alice'));
  assert.equal(cached.status, 200);
  assert.equal((await cached.json()).snapshot.current, false);
  assert.equal(fixture.budgets.get(OWNER).length, 2);
  await fixture.store.mutate('fail_sync', OWNER, PROJECT, { token: lease.token, code: 'GITHUB_TIMEOUT', message: 'Read timed out.' });
});

test('expired or failed target evidence is not reused after a different target succeeds', async () => {
  const fixture = memoryBoundary({ guarded: true });
  await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  fixture.advance(10);
  await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'));
  fixture.advance(601);
  const failure = new ApiError(502, 'GITHUB_UNAVAILABLE', 'GitHub is unavailable; this target is not current.');
  fixture.failGitHub(failure);
  assert.equal((await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'))).status, 502);
  const stale = await fixture.handler(request({ action: 'get', projectId: PROJECT }, 'alice'));
  const staleBody = await stale.json();
  assert.equal(staleBody.snapshot.pr_number, 7);
  assert.equal(staleBody.snapshot.stale, true);
  assert.equal(staleBody.snapshot.conclusion, 'unverified');
  assert.match(staleBody.snapshot.reason, /this target is not current/);
  fixture.advance(10);
  fixture.failGitHub(null);
  const other = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 8 }, 'alice'));
  assert.equal(other.status, 200);
  const otherBody = await other.json();
  fixture.advance(10);
  fixture.failGitHub(failure);
  assert.equal((await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'))).status, 502,
    'clearing the connection-level error on another success must not revive failed target cache');
  const otherAgain = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 8 }, 'alice'));
  const retainedOther = await otherAgain.json();
  assert.equal(otherAgain.status, 200);
  assert.equal(retainedOther.snapshot.id, otherBody.snapshot.id);
  assert.equal(retainedOther.snapshot.stale, false);
  assert.equal(retainedOther.snapshot.current, false);
});

test('known global GitHub rate limits return 429 even for an otherwise reusable target', async () => {
  const fixture = memoryBoundary({ guarded: true });
  await fixture.handler(request({ action: 'connect', repository: 'octocat/project', requireTestSprite: false }, 'alice'));
  fixture.blockGitHub(120);
  const reads = fixture.paths.length;
  for (const body of [{ action: 'sync', projectId: PROJECT }, { action: 'connect', repository: 'octocat/project', requireTestSprite: false },
    { action: 'connect', repository: 'octocat/another-project' }]) {
    const response = await fixture.handler(request(body, 'alice'));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '120');
    assert.equal((await response.json()).error.code, 'GITHUB_RATE_LIMITED');
  }
  assert.equal(fixture.paths.length, reads);
  assert.equal((await fixture.handler(request({ action: 'get', projectId: PROJECT }, 'alice'))).status, 200, 'explicit retained reads remain available');
  fixture.advance(120);
  assert.equal((await fixture.handler(request({ action: 'sync', projectId: PROJECT }, 'alice'))).status, 200);
});

test('rate-limit observations are persisted through the injectable boundary before returning 429', async () => {
  const receipts = [];
  const github = createGitHubReader({ now: () => NOW, onRateLimit: async seconds => { receipts.push(seconds); },
    fetchImpl: async () => respond({}, 403, { 'retry-after': '120', 'x-ratelimit-remaining': '30' }) });
  await assert.rejects(() => github('/repos/o/r', { reads: 0 }), error => error.code === 'GITHUB_RATE_LIMITED' && error.retryAfterSeconds === 120);
  assert.deepEqual(receipts, [120]);
  await assert.rejects(() => github('/repos/o/r', { reads: 0 }), error => error.status === 429);
  assert.deepEqual(receipts, [120], 'a cached backoff does not keep writing or calling GitHub');
});

test('a missing or mismatched cached snapshot fails rather than substituting the latest different target', async () => {
  const fixture = memoryBoundary();
  fixture.seed();
  fixture.store.mutate = async () => ({ claimed: false, cached: true, snapshotId: SNAPSHOT });
  const response = await fixture.handler(request({ action: 'sync', projectId: PROJECT, pullNumber: 7 }, 'alice'));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'SYNC_CONFLICT');
  assert.equal(body.snapshot, undefined);
  assert.equal(fixture.paths.length, 0);
});
