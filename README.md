# Loopline

Loopline is a release-verification cockpit built for **TestSprite Hackathon — Season 4**.
It turns the maker/checker loop into a small, legible product surface: select a release, inspect its gates, open a failure bundle, apply the suggested fix, and run verification again until the signal is green.

This build is intentionally a client-side demo. It does not claim a live GitHub, CI, or TestSprite connection; the public deployment is the surface that TestSprite explores and checks.

The interface uses a light theme with neutral surfaces, green actions, and distinct success, warning, and failure states.

## Submission details

- **Live URL:** https://hemanthreddykoduru.github.io/Loopline/
- **What the suite should cover:** release search and filtering, navigation, creating a release with required-field validation, opening a failure bundle, applying the suggested fix, running verification through the visible running state, and switching between the overview, release directory, test-run history, and settings views.
- **Primary demo path:** open **Checkout refresh** → **Failure bundle · 1** → **Apply suggested fix** → **Run again**.
- **Required before submitting:** connect the public GitHub repository in the TestSprite dashboard, generate a suite against the live URL, open at least one PR carrying a TestSprite comment or status check, and post the PR URL, live URL, and TestSprite account email in `#hackathon-submissions`.

## Local setup

Requirements:

- Node.js `22.11.0` (the version is pinned in `.nvmrc`)
- npm 10+

```bash
nvm install
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

## Checks

The single offline-friendly test command is:

```bash
make test
```

After `npm ci`, tests use only local dependencies and require no external service. The Node built-in test runner covers:

- **25 component-interaction tests:** the real React app, compiled in memory with Vite and mounted in JSDOM under StrictMode. Covers navigation, every button family, search/filter reset, invalid/valid creation, dialog focus and dismissal, failure/fix flows, concurrent verification, notification/archive preferences, full activity, and timer cleanup.
- **7 logic tests:** release filtering, required fields, normalized queue creation, honest simulated check resolution, and median run durations.
- **3 theme tests:** light defaults and representative text, status, icon, and focus token contrast.

JSDOM tests exercise component behaviour with controlled timers; they do **not** render layouts or prove browser keyboard defaults, animation smoothness, touch targeting, or complete accessibility. Token contrast checks are not a full WCAG audit. Rendered desktop/mobile checks remain a separate step; see [LOOP.md](LOOP.md) for actual evidence and gaps.

The production build can be checked with:

```bash
npm run build
```

## Docker

The Docker image installs the pinned npm lockfile, builds the app, and serves the production preview on port `4173`:

```bash
docker build -t loopline .
docker run --rm -p 4173:4173 loopline
```

Open `http://localhost:4173`.

## Deploy

Loopline is a static Vite app and can be deployed to Vercel, Netlify, Cloudflare Pages, or any static host.

Build command:

```bash
npm ci && npm run build
```

Publish directory: `dist`

For a Vercel deployment, install the Vercel CLI locally or use the Vercel dashboard, then run the platform's normal project import flow. Do not put tokens in this repository; use the platform's environment-variable settings.

## Product map

- **Overview:** metrics, release queue, selected-release verification, activity, and the three-step loop.
- **Releases:** searchable directory and detail surface for every release.
- **Test runs:** readable verification history with links back to a release.
- **Settings:** local demo controls and an explicit no-live-integration disclosure.

Utility controls open local workspace, profile, release, help, notification, activity, and integration-status dialogs. Verification runs belong to individual releases, so navigating or creating another candidate does not overwrite its result. Notification preferences gate local start/completion notices; auto-archive marks new successful bundles archived in memory. Nothing is sent externally or retained after reload.

## Hackathon execution checklist

For the judge-facing story, see [SUBMISSION.md](SUBMISSION.md). For the evidence log, see [LOOP.md](LOOP.md). Both files distinguish completed local/GitHub evidence from pending TestSprite cloud results.

1. Create a free TestSprite account with the same email used for submission.
2. Create or use a public GitHub repository for this source.
3. Deploy Loopline and keep the public URL live through judging.
4. In the TestSprite 3.0 portal, generate the test suite against the live URL.
5. Install the TestSprite GitHub App, select the repository, enable PR runs, and enable blocking checks if the repository workflow supports them.
6. Open a PR that carries the TestSprite check. Aim to show the loop catching an issue and a follow-up commit returning the check to green.
7. Post the PR link, live URL, and TestSprite account name/email in the required Discord channel before the deadline in the official rules.

The official requirements and deadlines are on [TestSprite Hackathon Season 4](https://www.testsprite.com/hackathon-s4). Dates and Discord instructions can change, so verify them immediately before submitting.
