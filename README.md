# Loopline

Loopline is a release-readiness workspace built for **TestSprite Hackathon — Season 4**.
It connects a signed-in user to public GitHub repositories, reads point-in-time commit checks, and keeps the selected evidence and bounded history visible while a release decision is made.

The connector is intentionally read-only. It does not install a GitHub App, access private repositories, run CI, push code, or claim that a stale or incomplete check is ready. When the public InsForge browser configuration is absent, the landing and auth surfaces remain usable but the workspace explains that the service is unavailable instead of falling back to sample repositories.

The interface uses a light theme with neutral surfaces, green actions, and distinct success, warning, and failure states.

## Submission details

- **Live URL:** https://hemanthreddykoduru.github.io/Loopline/
- **What the suite should cover:** public landing and auth routing, sign-in and reset-code handoff, empty authenticated workspace state, repository connection, branch/PR target selection, exact-commit evidence, stale/error states, disconnect confirmation, and the read-only disclosure.
- **Primary product path:** open the landing page → authenticate → connect a public repository → sync the default branch → choose an observed PR → sync that target and review its commit-linked checks.
- **Required before submitting:** configure the public Vite values in the deployment environment, generate a suite against the live URL, open at least one PR carrying a real TestSprite comment or status check, and post the PR URL, live URL, and TestSprite account email in `#hackathon-submissions`.

## Local setup

Requirements:

- Node.js `22.11.0` (pinned in `.nvmrc`, `package.json`, CI, and Docker)
- npm `10.x` (the supported major for the pinned Node release)
- `make` for the repository shortcuts below (or use the equivalent npm commands)

```bash
nvm install
nvm use
npm ci
cp .env.example .env
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

For a connected workspace, set these public browser values in `.env` before starting Vite:

```dotenv
VITE_INSFORGE_BASE_URL=https://<app-key>.<region>.insforge.app
VITE_INSFORGE_ANON_KEY=<public-anonymous-key>
VITE_INSFORGE_FUNCTIONS_URL=https://<app-key>.function2.insforge.app
```

The anonymous key is a browser public key, not a privileged InsForge or GitHub secret. Never put `INSFORGE_BASE_URL`, `API_KEY`, or `GITHUB_TOKEN` in a `VITE_*` variable. The server-side configuration and migration/deployment commands are documented in [backend/README.md](backend/README.md).

## Checks

The offline-friendly test command is:

```bash
make test
```

For the same test-plus-production-build gate used during local release checks:

```bash
make verify
```

After `npm ci`, tests use only local dependencies and require no external service or account. The Node built-in test runner covers the integrated route/auth/workspace smoke flow, the API adapter contract and nested backend errors, backend policy/security, retained legacy release helpers, and light-theme token contrast. `npm test` runs the repository's `tests/*.mjs` suite sequentially; do not interpret these offline tests as authenticated production persistence or real GitHub/TestSprite evidence.

JSDOM tests exercise component behaviour with controlled timers; they do **not** render layouts or prove browser keyboard defaults, animation smoothness, touch targeting, or complete accessibility. Token contrast checks are not a full WCAG audit. Rendered desktop/mobile checks remain a separate step; see [LOOP.md](LOOP.md) for actual evidence and gaps.

The production build can be checked with:

```bash
npm run build
```

The lockfile is the install contract: use `npm ci` on a clean checkout rather than `npm install` when reproducing CI or a release build.

## Docker

The Docker image installs the pinned npm lockfile, builds the app, and serves the production preview on port `4173`:

```bash
docker build -t loopline .
docker run --rm -p 4173:4173 loopline
```

Open `http://localhost:4173`. The container pins preview to port `4173` and reports healthy only after that URL returns a successful response.

The image also accepts optional build arguments for a connected static build. Omitting them still produces a reproducible build with the explicit unavailable-service state:

```bash
docker build \
  --build-arg VITE_INSFORGE_BASE_URL="https://<app-key>.<region>.insforge.app" \
  --build-arg VITE_INSFORGE_ANON_KEY="<public-anonymous-key>" \
  --build-arg VITE_INSFORGE_FUNCTIONS_URL="https://<app-key>.function2.insforge.app" \
  -t loopline .
```

These build arguments are public browser configuration. Do not pass `INSFORGE_BASE_URL`, `API_KEY`, or `GITHUB_TOKEN` to this image.

## Deploy

Loopline is a static Vite app and can be deployed to GitHub Pages or another static host whose origin is allowed by the backend. The InsForge values are compiled into the browser bundle, so provide only the public base URL, anonymous key, and direct functions URL at build time. For a new host, add its exact HTTPS origin to `ORIGINS` in `functions/loopline-api.mjs` and redeploy the function before enabling connected API calls.

Build command:

```bash
npm ci && npm run build
```

For GitHub Pages, set the repository up once before relying on connected features:

1. In **Settings → Pages**, set the source to **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_INSFORGE_BASE_URL` and `VITE_INSFORGE_FUNCTIONS_URL`.
3. In the same Actions settings, add `VITE_INSFORGE_ANON_KEY` as a repository secret. It is a public browser key after the build; storing it as a secret prevents accidental exposure in repository settings, but does not make it private at runtime.
4. Keep the deployment origin in the backend `ORIGINS` allowlist. For the published app the origin is `https://hemanthreddykoduru.github.io` (the `/Loopline/` path is not part of an origin).

The included workflow reads those names from the GitHub Actions variables/secret and runs `make test`, source/whitespace gates, and the production build before uploading `dist`. An unset value intentionally leaves the deployed app in its unavailable-service state. Pull requests run validation only; the Pages artifact is deployed from a `main` push or an explicitly approved workflow dispatch, so unreviewed PR code does not replace the public site.

Publish directory: `dist`

The local Vite server proxies `/api` and `/functions` to InsForge during development, so auth refresh cookies and the optional functions URL fallback remain same-origin. The Docker preview uses port `4173`, which is included in the backend origin allowlist. Add any new static-host origin to `ORIGINS` in `functions/loopline-api.mjs` and redeploy the function before enabling connected API calls there.

For a Vercel deployment, install the Vercel CLI locally or use the Vercel dashboard, then run the platform's normal project import flow. Do not put tokens in this repository; use the platform's environment-variable settings.

## Product map

- **Landing:** explains the evidence model and public read-only GitHub scope.
- **Auth:** email/password sign-up and sign-in, email verification, password reset, and clear unavailable-service states.
- **Workspace:** connected repositories, default-branch and observed-PR targets, exact commit SHA evidence, bounded snapshot history, and safe source links.
- **Connection flow:** validates repository identifiers, requires explicit TestSprite policy selection, and confirms disconnect before invoking the backend.

The frontend never accepts a user ID, GitHub token, check result, or arbitrary API URL from the browser. Private backend actions use the signed-in InsForge session; GitHub reads and bounded sync policy are enforced in `functions/loopline-api.mjs`. There is no automatic polling, code modification, CI execution, or frontend persistence claim beyond the SDK session it can actually restore.

## Hackathon execution checklist

For the judge-facing story, see [SUBMISSION.md](SUBMISSION.md). For the evidence log, see [LOOP.md](LOOP.md). Both files distinguish completed local/GitHub evidence from pending TestSprite cloud results.

1. Create a free TestSprite account with the same email used for submission.
2. Create or use a public GitHub repository for this source.
3. Deploy Loopline and keep the public URL live through judging.
4. In the TestSprite 3.0 portal, generate the test suite against the live URL.
5. If using Loopline’s TestSprite evidence policy, publish the official TestSprite App result to GitHub through your existing workflow; Loopline only reads that result.
6. Open a PR that carries the TestSprite check and keep the exact observed commit available for review.
7. Post the PR link, live URL, and TestSprite account name/email in the required Discord channel before the deadline in the official rules.

The official requirements and deadlines are on [TestSprite Hackathon Season 4](https://www.testsprite.com/hackathon-s4). Dates and Discord instructions can change, so verify them immediately before submitting.
