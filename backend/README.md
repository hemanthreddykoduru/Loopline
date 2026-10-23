# Loopline backend

Loopline monitors **public GitHub repositories, read-only**. It stores each signed-in user's connections, exact-commit check evidence, and bounded history in the linked InsForge project. The first suggested repository is `hemanthreddykoduru/Loopline`; suggestions are not seeded connections or simulated results.

## Source and deployment

- Edge source: `functions/loopline-api.mjs`, a self-contained Deno ESM module. There are no relative runtime imports. The server lazily imports `npm:@insforge/sdk@1.5.2`.
- Schema: immutable bootstrap `migrations/20261016161926_loopline-bootstrap.sql`, target-aware policy `migrations/20261016165440_loopline-target-sync.sql`, and finite-backoff correction `migrations/20261016170512_loopline-finite-backoff.sql`.
- Offline behavior tests: `tests/backend.test.mjs`, using Node's built-in runner and injected boundaries. Test fixtures are confined to tests.
- Linked project: `120163ce-4cf1-4901-9a8b-219b2876ad3e`.
- API base: `https://umgm5h3b.us-east.insforge.app`.
- Function slug: `loopline-api`.
- Compat endpoint: `https://umgm5h3b.us-east.insforge.app/functions/loopline-api`.
- Direct deployment endpoint: `https://umgm5h3b.function2.insforge.app/loopline-api`.

Use the root `.nvmrc` and lockfile. From the repository root:

```sh
nvm install
nvm use
npm ci
node --test tests/backend.test.mjs
make test
make build
git diff --check
```

After `npm ci`, tests run offline without an InsForge account, GitHub credentials, or network access. The production edge function runs on InsForge's managed Deno runtime; its SDK version is pinned in source.

The CLI is project-local and pinned to `0.2.8`. For this already-linked project, do not create or link another backend. Source checks must pass before deployment:

```sh
npx -y @insforge/cli db migrations list --json
# On a clean backend, apply only migrations that are still pending, in this order:
npx -y @insforge/cli db migrations up 20261016161926_loopline-bootstrap.sql --json
npx -y @insforge/cli db migrations up 20261016165440_loopline-target-sync.sql --json
npx -y @insforge/cli db migrations up 20261016170512_loopline-finite-backoff.sql --json
npx -y @insforge/cli functions deploy loopline-api --file functions/loopline-api.mjs
npx -y @insforge/cli functions list --json
npx -y @insforge/cli functions invoke loopline-api --data '{"action":"health"}' --json
```

These migrations have already been applied to the linked backend. Do not edit applied history or run it twice. Future schema changes use `db migrations new <lowercase-hyphenated-name>` followed by inspection, tests, and exact-file apply. No paid branch or additional infrastructure is required.

### Server configuration

The runtime reads existing InsForge-managed `INSFORGE_BASE_URL` and `API_KEY` secrets through `Deno.env`. The privileged client is created only with `createAdminClient({baseUrl, apiKey})`. These credentials never belong in a `VITE_*` variable, response, log, source file, or Git commit.

`GITHUB_TOKEN` is an **optional server secret** for higher public GitHub API limits. It is not configured for the initial deployment. Public unauthenticated reads work without it. The frontend must never request or store a personal GitHub token. Even with a server token, repository metadata must explicitly report public visibility before any evidence is fetched.

The function verifies bearer tokens with a separate SDK client and `auth.getCurrentUser()` on every private request. The owner UUID comes exclusively from that verified response. No body `userId`, `owner_id`, check result, or arbitrary API URL is accepted. Email signup, verification, sign-in, and reset stay with the existing InsForge auth code flows; this function does not change auth configuration.

## JSON API

Use the user's authenticated SDK client:

```js
const { data, error } = await insforge.functions.invoke('loopline-api', {
  body: { action: 'connect', repository: 'hemanthreddykoduru/Loopline', requireTestSprite: true },
})
```

The HTTP JSON is returned **raw** as SDK `data`; there is no additional `{data: ...}` envelope inside it. Check the SDK error on non-2xx responses. The HTTP error contract remains exactly `{error:{code,message,retryAfterSeconds?}}`; the parent handles the SDK's nested `error.error` object. For private actions the SDK must send the signed-in user's bearer token, not the anon key as a substitute for a user session. The parent configures SDK `functionsUrl` to `https://umgm5h3b.function2.insforge.app` so requests use the direct host and preserve matching CORS headers.

| Action | Request fields besides `action` | Success JSON |
| --- | --- | --- |
| `health` | None; public POST or GET `?action=health` | `{service:{name,status},storage:{status},source:{provider,status,access,tokenConfigured,liveProbe}}` |
| `list` | None | `{projects:[Project]}` |
| `connect` | `repository`, optional `requireTestSprite` boolean, default `true` | `{project,snapshot,pullRequests,history}` |
| `get` | `projectId` UUID | Same detail shape, using retained evidence and PR metadata; no GitHub reads |
| `sync` | `projectId` UUID, optional `pullNumber:null` or positive integer | Same detail shape after reading the current default-branch HEAD or the requested PR's latest head |
| `disconnect` | `projectId` UUID | `{success:true}`; removes only this user's connection and cascades its snapshots/checks |

The frontend must confirm disconnect with the user before invoking it. Connecting an existing repository selects the default-branch target, reusing that target's recent retained observation or obtaining a budgeted fresh read. To change its TestSprite policy, disconnect and reconnect with the desired flag. Disconnect does not reset the account's fresh-read budget or active lease.

```ts
type Project = {
  id: string; full_name: string; description: string | null; default_branch: string;
  html_url: string; created_at: string; last_synced_at: string | null; require_testsprite: boolean;
}
type Check = {
  id: string; name: string; provider: string;
  status: 'queued' | 'in_progress' | 'completed' | 'unknown';
  conclusion: string | null; html_url: string | null; head_sha: string; completed_at: string | null;
}
type Snapshot = {
  id: string; head_sha: string; ref_name: string; pr_number: number | null; pr_title: string | null;
  html_url: string; conclusion: 'ready' | 'blocked' | 'running' | 'unverified'; checked_at: string;
  checks: Check[]; summary: {total:number; passed:number; failed:number; pending:number}; reason: string;
  stale: boolean; current: boolean;
}
type PullRequest = {number:number; title:string; head_sha:string; head_ref:string; html_url:string}
```

Snapshot is `null` only when no retained snapshot exists. History contains the latest **10 snapshot summaries**, with the same persisted snapshot fields and `summary`; `checks`, `stale` are omitted and `current:false` identifies historical evidence. Results are point-in-time observations, never a guarantee that HEAD remains unchanged. A retained `get` or target-cache response sets `snapshot.current:false` and explains that HEAD has not been re-read. A cached `sync` selects the retained snapshot **for the requested branch/PR target**, including that snapshot's own normalized checks and original timestamp, even if a different target is the latest history entry. It never substitutes a different target if a retained ID disappears; that race returns 409. `pullRequests` is the bounded list observed at the last successful sync, not a live subscription.

Use `snapshot.checked_at` for the selected target's observation time. `project.last_synced_at` describes the latest successful read across the connection's targets. `get` has no target selector and returns the latest retained observation; `sync` with `pullNumber` selects a specific target.

Failed or interrupted reads invalidate retained observations of **that target**, and evidence at least ten minutes old is stale. Such retained detail is `conclusion:'unverified', stale:true, current:false`. Success on another target does not revive invalidated evidence, and failure on a different target does not relabel a valid observation. Original evidence remains in history with its original SHA, timestamp, and historical conclusion. A sync failure itself is non-2xx; it never returns success-shaped replacement results.

Failures use non-2xx status with:

```json
{"error":{"code":"UNAUTHENTICATED","message":"Sign in to access your repository connections."}}
```

Rate-limit/cooldown errors also include `retryAfterSeconds` and a `Retry-After` header. Main codes include `INVALID_REQUEST` (400), `JSON_REQUIRED` (415), `BODY_TOO_LARGE` (413), `UNAUTHENTICATED` (401), `ORIGIN_NOT_ALLOWED` (403), `PROJECT_NOT_FOUND`/`GITHUB_NOT_FOUND` (404), `PROJECT_LIMIT`/`CONNECTION_EXISTS`/`SYNC_CONFLICT` (409), `SYNC_COOLDOWN`/`GITHUB_RATE_LIMITED` (429), `GITHUB_UNAVAILABLE` (502), `GITHUB_TIMEOUT` (504), and storage/service errors (503). Raw upstream/auth/database error payloads are never returned.

Allowed browser origins in the handler source are `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`, `https://hemanthreddykoduru.github.io`, `https://loopline-self.vercel.app`, and `https://loopline-hackathon.vercel.app`. The handler handles OPTIONS, validates Origin on actual requests, and returns matching CORS headers. InsForge's compat proxy currently overwrites `Access-Control-Allow-Origin` to `*`; live tests confirmed the handler still rejects an unlisted origin with 403. The direct deployment endpoint preserves the exact origin header. Any new static-host origin must be added to `ORIGINS` and the function must be redeployed before the browser can use it.

## Evidence and readiness

GitHub reads use only GET requests to fixed `https://api.github.com/repos/...` endpoints, with redirects rejected, seven-second timeouts, and bounded response bodies. Repository inputs accept `owner/repository` or an exact HTTPS `github.com` repository URL. Extra paths, credentials, queries, encodings, and non-GitHub hosts are rejected. Repository metadata must explicitly report both `private:false` and `visibility:"public"`; missing or malformed upstream metadata is rejected before branch or evidence reads. Evidence links must be safe HTTPS URLs; local/private-address links and unsafe schemes are removed.

Each successful read resolves an exact full SHA, then combines that commit's GitHub check runs and commit statuses. The status envelope SHA must match; check runs with a different SHA are discarded and mark evidence incomplete. Reruns are deduplicated by provider/name using the newest GitHub ID, including new queued reruns with no start timestamp. Actual reported links and timestamps are retained; missing links/timestamps cannot produce success, and a commit status cannot inherit a synthetic snapshot URL.

The conservative Loopline policy requires all latest observed checks, plus known branch/ruleset required contexts and app IDs, to succeed. Unknown protected-branch policy, required workflows/deployments that cannot be mapped safely, truncation, missing required evidence, and unknown results prevent readiness. `ready` describes check evidence, not complete GitHub mergeability or approval status.

- Any latest failed/cancelled/timed-out/action-required/startup-failure check: **blocked**.
- Otherwise any queued/running check or pending status: **running**.
- No checks, old-SHA-only evidence, missing required checks, neutral/skipped/stale/unknown/incomplete evidence: **unverified**.
- With `require_testsprite:true`, a successful check must come from the pinned official TestSprite GitHub App: app ID `2756476`, slug `testsprite`, publisher organization ID `170984515`, and `https://github.com/apps/testsprite`. A GitHub Actions job named TestSprite or a similarly named commit status is insufficient.
- Only complete successful evidence for the exact head can be **ready**.

Publisher identity was checked against [GitHub's public App metadata](https://api.github.com/apps/testsprite) and [TestSprite's GitHub integration documentation](https://docs.testsprite.com/web-portal/integrations/github-integration). A different/unverifiable provider stays unverified until its official identity is independently established. Loopline only reads the checks TestSprite has already reported; it does not install a GitHub App, authorize private repositories, run TestSprite, rerun workflows, modify code, merge, or claim fixes.

### Bounds

- Five connections per user; SQL serializes owner quota/connect races.
- At most eight GitHub reads per sync (normally six for a branch, seven for a PR).
- At most 100 normalized checks per snapshot; larger/truncated evidence is unverified.
- At most 20 open PR metadata records and 10 durable snapshots per connection.
- Ten-minute **per-target observation reuse**, not a connection-wide ten-minute lock. A completed GitHub read of any readiness conclusion can be reused for that exact target while retained and not invalidated. Cached replies explicitly use `current:false` and do not consume a fresh attempt.
- New or expired targets can obtain a fresh read after a **10-second minimum interval**, measured from the prior fresh-read reservation. Connecting the default branch then selecting a PR therefore waits at most the remaining short interval, rather than ten minutes.
- A durable **account-wide budget of at most six fresh attempts in any rolling ten-minute window** includes initial connections, all projects/targets, and failed attempts. This is deliberately stricter than a per-connection allowance and survives process restarts, disconnect/reconnect, and repository/name changes. Only the six recent timestamps are retained, in one bounded row per account. Switching/alternating targets cannot reset it; attempts are not refunded after failures. Denials return 429 `SYNC_COOLDOWN` with the actual minimum-interval, lease, or window retry time.
- A two-minute account-wide lease serializes fresh reads, with the existing project lease and owner/quota/atomic-write boundaries preserved. Matching valid target caches remain available during another read's lease, without obtaining another fresh attempt.
- Ninety-second, 64-entry in-memory cache/dedup for public commit evidence and rule metadata. Repository visibility, branch HEAD, and PR metadata are always fetched for each new sync. Same-owner concurrent connects are deduplicated.
- Known GitHub backoff is stored in a server-only singleton shared by all users/instances. It takes priority over target-cache reuse: `connect` and `sync` return 429 `GITHUB_RATE_LIMITED`/`retryAfterSeconds` while blocked. Explicit retained `get` reads remain available. The server records an upstream rate-limit observation before returning it; local backoff also stops repeated GitHub calls.
- No automatic polling or scheduled jobs. Public GitHub's shared-IP 60/hour allowance can still be exhausted before the account budget; the actual upstream limit/reset remains authoritative.

## Database contract

All objects are app-owned in `public`. No system schemas are modified; only the allowed `auth.users(id)` FK and `auth.uid()` identity helper are referenced.

| Table | Stored fields and constraints |
| --- | --- |
| `loopline_projects` | UUID PK, owner FK, canonical repository name + generated lowercase key unique per owner, description, default branch, canonical GitHub URL, TestSprite policy, creation/sync/attempt times, last PR target, sanitized last error, bounded PR metadata JSON, sync lease/token |
| `loopline_snapshots` | UUID PK, project/owner composite FK, 40-character head SHA, branch/PR reference and title, source URL, readiness, server timestamp, typed counts, reason, evidence completeness; target-specific invalidation/error metadata |
| `loopline_checks` | UUID PK, snapshot/owner/SHA composite FK, original GitHub source ID, name, provider/key/app ID, verified-provider flag, normalized status/conclusion, safe source URL, completion time; unique snapshot/provider/name |
| `loopline_sync_budgets` | Server-only owner PK/FK, at most six recent attempt timestamps, owner lease/token, reserved repository/project/PR target; independent of project deletion |
| `loopline_source_state` | Server-only singleton PK constrained to 1, finite GitHub backoff timestamp |

Ownership and lookup/FK columns are indexed, including owner/project/target/time lookup for reuse. All five tables have RLS enabled. The original three evidence tables retain a single authenticated SELECT policy `owner_id = (SELECT auth.uid())`, with authenticated SELECT only. Budget and shared source-state tables have no anon/authenticated access at all. Default `PUBLIC`, `anon`, and `authenticated` table privileges are explicitly revoked before narrow grants. There are no frontend INSERT/UPDATE/DELETE grants or policies and no cross-table RLS policy joins. Composite FKs prevent foreign-owner children and wrong-SHA checks.

`public.loopline_admin(p_action text,p_owner_id uuid,p_project_id uuid,p_payload jsonb)` is the application mutation RPC. Only `project_admin` can execute it; PUBLIC/anon/authenticated EXECUTE are revoked. It is `SECURITY INVOKER` with a pinned `search_path`, using the already-privileged server client. Narrow server actions are `claim_connect`, `claim_sync`, `persist`, `fail_sync`, `disconnect`, `rate_limit`, and side-effect-free `source_state`; these internal actions are not accepted by the public HTTP action parser. Existing-project actions filter both UUID and verified owner. Owner advisory locks serialize quota/budget reservations.

The immutable bootstrap's writer was retained under the internal admin-only name `loopline_admin_base`; the new wrapper requires a valid owner/repository/project/target lease before invoking its atomic writer. `persist` creates/updates the connection, inserts the snapshot and all normalized checks, stores bounded PR metadata, prunes history, and releases the budget lease in **one transaction**. Any failed child/constraint rolls back the whole RPC; partially saved green results are not returned. Failed-connect reservations leave no partial connection. `loopline_sync_window` is a pure admin-only SQL helper used by the RPC for rolling-budget/minimum-interval/lease decisions, permitting real read-only SQL checks without creating users.

## Verification receipts and remaining coverage

- Migration `20261016161926_loopline-bootstrap.sql` applied successfully at `2026-10-16T16:33:44.754Z`.
- Migration `20261016165440_loopline-target-sync.sql` applied successfully at `2026-10-16T17:03:55.397Z`. The bootstrap file was not edited.
- Read-only source-state inspection caught PostgreSQL's rejection of subtracting an infinite inactive timestamp. Migration `20261016170512_loopline-finite-backoff.sql` applied successfully at `2026-10-16T17:05:58.599Z`, normalizing only the inactive singleton sentinel to the Unix epoch and enforcing finite timestamps. Active backoffs and user data were preserved; no applied migration was rewritten.
- Read-only calls of the real SQL `loopline_sync_window` returned: new target after 10 seconds **allowed**, one-second repeat **retry 9s**, six attempts followed by a seventh at +60s **retry 540s**, expired window **allowed**, and an active lease **retry 10s**. `source_state` returned `limited:false,retryAfterSeconds:0` after the correction. These calls exercised actual SQL policy math without any app user or persisted fixture.
- Latest function deployment ID **`pkrppcyv4zs5`**, function ID `d018ac20-86ac-44ff-af70-463b4b377bf1`; latest source update **`2026-10-16T17:09:11.311Z`**, status **active**, runtime **running**. Earlier deployments were `3zph9ffz1t94` and `0j2yvde7dps9`. The platform retains the initial `deployedAt` field.
- Live public health returned HTTP 200, storage `available`, public-read-only GitHub source, `tokenConfigured:false`. Health deliberately reports `liveProbe:false`; it does not spend GitHub reads or expose user data.
- After the latest deployment, truly anonymous and invalid-user-token HTTP `list` requests returned 401 `UNAUTHENTICATED` at the direct host with matching GitHub Pages CORS. Internal HTTP action `rate_limit` returned 400 `INVALID_REQUEST`, confirming server guard actions are not public API actions. The HTTP error envelope remained unchanged.
- Direct and compat endpoints accepted an allowed origin and rejected an unlisted origin. All three permitted direct-endpoint OPTIONS preflights returned 204 and the matching origin. The compat proxy's CORS-header override was reported as InsForge feedback `082f5154-47d6-43e7-a997-d1706a67c6eb`.
- Live public source helper read `hemanthreddykoduru/Loopline` default HEAD `669b8fd5b8a229b1af73fd2b15ec864ca430dac2`: two real passing GitHub Actions checks, one open PR, **unverified** because genuine TestSprite evidence was absent. No connection was created by this read-only probe.
- Inspected live table grants, RLS policies, composite ownership FKs, and RPC EXECUTE privileges. The new state tables had no anon/authenticated SELECT or writes; all three app RPC/helper functions denied anon/authenticated EXECUTE and allowed project_admin. These are structural checks, not evidence of real cross-user runtime isolation.
- The backend had **zero app users** during verification. Authenticated persistence, actual two-user RLS reads/cross-user denial, quota races, and database history pruning still need an authorized real-user exercise. No test users were created. Offline boundary mocks cover ownership enforcement, auth denial, atomic RPC usage, exact-SHA readiness, stale failures, cooldown, and input/network boundaries.
- `node --test tests/backend.test.mjs`: **29 passed**, including branch→PR availability, target-matching cache/check selection, rapid switching, budget retention through reconnect/new handler, leases, target-scoped invalidation, global-rate-limit priority, Docker-preview CORS origins, explicit public-visibility gating, malformed-upstream sanitization, missing-link evidence rejection, and the unchanged error envelope. The current root suite `npm test`: **59 passed**; `npm run build`, `node --check functions/loopline-api.mjs`, and `git diff --check` passed. Local test runtime was Node `26.12.0`; the repository deployment runtime remains pinned by `.nvmrc` to `22.11.0`.
- The evidence-boundary hardenings were redeployed to `loopline-api` on 2026-10-22 with the pinned command above. Live health returned HTTP 200, and direct CORS preflights still allow GitHub Pages and Docker preview origins while rejecting an unlisted origin.

Root setup, Docker/frontend deployment, authentication UI, SDK initialization, and end-to-end integration are maintained by the parent task.
