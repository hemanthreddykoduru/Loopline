# Loopline verification log

Loopline is built around the same loop the hackathon asks us to demonstrate:

```text
write → deploy → verify → read the evidence → fix the root cause → verify again
```

This file is an evidence index, not a claim that a check ran when it did not. Local and GitHub evidence is recorded below; TestSprite cloud evidence will be appended after the project is connected and the PR check has completed.

## Product loop

The current product makes the evidence loop legible without inventing a result:

1. Open the public landing page and review the read-only GitHub scope.
2. Authenticate through the configured InsForge email flow.
3. Connect a public repository and inspect the saved default-branch snapshot.
4. Choose an observed PR target and sync its current commit and published checks.
5. Review the exact SHA, check evidence, source links, stale/error state, and bounded history before making a release decision.

## Build iterations

| Iteration | Change | Evidence | Result |
| --- | --- | --- | --- |
| 0 | Built the first Loopline release cockpit, including the release queue, failure bundle, verification state machine, and settings surface. | Commit [`1cd59eb`](https://github.com/hemanthreddykoduru/Loopline/commit/1cd59eb) · `make test` · `npm run build` | 4 local tests passed; production build passed. |
| 1 | Added pinned runtime/dependencies, Dockerfile, Makefile, README, and GitHub Pages deployment. | Commits [`cde81ed`](https://github.com/hemanthreddykoduru/Loopline/commit/cde81ed), [`68eba84`](https://github.com/hemanthreddykoduru/Loopline/commit/68eba84), [`10f0801`](https://github.com/hemanthreddykoduru/Loopline/commit/10f0801) · [deploy workflow](.github/workflows/deploy-pages.yml) | Public URL returned HTTP 200; GitHub Actions deployment passed. |
| 2 | Added the release-directory clear-filters path and opened the submission PR. | PR [#1](https://github.com/hemanthreddykoduru/Loopline/pull/1) · commit [`ff3bc1d`](https://github.com/hemanthreddykoduru/Loopline/commit/ff3bc1d) | PR build and deploy passed. |
| 3 | Hardened motion performance and made the PR workflow run `make test` before deployment. | Commits [`441fbc0`](https://github.com/hemanthreddykoduru/Loopline/commit/441fbc0), [`d211fc1`](https://github.com/hemanthreddykoduru/Loopline/commit/d211fc1) | PR build, tests, and deploy passed. |
| 4 | Reworked the product system for a more authored, production-ready finish: clearer copy, stronger navigation semantics, a skip link, reduced-transparency support, tactile states, system z-index tokens, metadata, and a branded favicon. | Commit [`6c7bfc1`](https://github.com/hemanthreddykoduru/Loopline/commit/6c7bfc1) · `make test` · `npm run build` | 4 local tests passed; production build passed. |
| 5 | Replaced the green-heavy visual language with a graphite and cobalt system. Cobalt now carries brand and interaction emphasis; green is reserved for verified states, with amber and rose kept for their semantic meanings. Removed the decorative grid and simplified the verification mark. | Commit [`9dabf3c`](https://github.com/hemanthreddykoduru/Loopline/commit/9dabf3c) · `make test` · `npm run build` | 4 local tests passed; production build passed. |
| 6 | Aligned the interface with the TestSprite Season 4 visual language: neutral `#131313` / `#181818` surfaces, green `#54B365` primary states, thin borders, 16px cards, compact mono metadata, and no gradients or glow effects. | Commit [`c65ab45`](https://github.com/hemanthreddykoduru/Loopline/commit/c65ab45) · `make test` · `npm run build` | 4 local tests passed; production build passed. |
| 7 | Converted the entire interface to light mode, including drawers, dialogs, forms, disabled actions, status badges, browser theme colour, and favicon. Added offline light-theme and contrast regression checks. | [Theme tests](tests/theme.test.mjs) · `make test` · `npm run build` | 7 local tests passed; production build passed. Rendered browser checks remain unverified. |
| 8 | Audited controls and responsive CSS; fixed release-owned verification timers, misleading queued/passed copy and icons, filtered creation, dialog focus/dismissal, local settings effects, complete activity, and utility dialogs. Added real-component regression coverage. | [Interaction tests](tests/interactions.test.mjs) · [Logic tests](tests/loopline.test.mjs) · `make test` · normal and Pages builds | 35 local tests passed. Narrow overview rendered at 310 × 685; browser actions and other viewport checks remain unverified. |
| 9 | Replaced the demo entrypoint with the public/auth/workspace flow; added the InsForge browser adapter, direct functions URL support, authenticated repository actions, target-aware evidence UI, deployment configuration, and backend/API regression coverage. | [Frontend adapter](src/loopline-api.js) · [Workspace](src/Workspace.jsx) · [Backend contract](backend/README.md) · `make test` · `npm run build` | **48 local tests passed.** Authenticated persistence, live GitHub evidence, and rendered browser flows still require an authorised runtime and deployment configuration. |
| 10 | Applied the installed UI skills across landing, auth, dialogs, repository navigation, evidence states, check rows, history, and responsive workspace layout. Added state-aware auth styling, evidence-first hierarchy, skeleton-like loading states, and reduced-motion-safe transform/opacity motion. | [Public/auth surfaces](src/PublicPages.jsx) · [Workspace surfaces](src/Workspace.jsx) · `make test` · `npm run build` | **49 local tests passed.** The cross-page system is implemented; rendered desktop/mobile browser QA remains the final visual check. |
| 11 | Hardened auth bootstrap so a transient session refresh or public-config request cannot disable the public signup, login, or password-reset forms; added regression cases for the observed browser network failure. | [Auth bootstrap](src/App.jsx) · [Interaction tests](tests/interactions.test.mjs) · `make test` · `npm run build` | **52 local tests passed.** Direct InsForge SDK probes now reach public config and current-user endpoints; rendered browser QA and email verification remain pending. |
| 12 | Fixed local refresh logout by routing development InsForge auth through a same-origin Vite proxy, allowing the httpOnly refresh cookie to remain usable after a reload; added proxy/config regression coverage. | [Vite proxy](vite.config.js) · [Runtime config](src/loopline-api.js) · [API tests](tests/loopline-api.test.mjs) · `make test` · `npm run build` | **53 local tests passed.** The code path and proxy configuration are verified locally; a live authenticated reload still depends on the browser reaching InsForge. |
| 13 | Hardened the current workspace and release contract: stale saved evidence remains visibly stale after reload, API cooldown hints reach the user, frontend repository validation matches the backend, optional local function calls use the Vite proxy, Docker preview origins are allowed, and CI checks the edge source and whitespace. | [Workspace](src/Workspace.jsx) · [Backend](functions/loopline-api.mjs) · [Vite proxy](vite.config.js) · [CI](.github/workflows/deploy-pages.yml) · `npm test` · `npm run build` | **57 local tests passed.** Backend source syntax, production build, and whitespace checks passed. Real browser refresh, live deployment of the current branch, Docker daemon execution, and TestSprite cloud evidence remain pending. |

## UI audit evidence — 2026-10-16

The four initial component regressions failed against the prior implementation: queued cards claimed success, filters hid a new release, a background run marked another release passed, and the new-release dialog did not receive focus. They pass after the fixes.

| Surface | Repeatable local coverage |
| --- | --- |
| Navigation | All four views and current-page semantics; Browse releases; every sample release card and run-row selection. |
| Release discovery | Name/version/branch/commit search, combined status filtering, empty-state action, and Clear filters. |
| Creation | Three required-field errors, error correction/focus, normalized valid submission, visible selected candidate, cleared filters, unique IDs, and a reset form. |
| Dialogs | Shared boundary-focus trapping, background isolation, scroll lock/cleanup, Escape, backdrop, Cancel, Close, Done, and opener-focus restoration. |
| Verification | Queued/running/completed progress semantics, duplicate-run blocking, independent concurrent runs, navigation/creation during a run, reruns, and unmount cleanup. |
| Bundles | Failure detail, simulated suggested fix, state-consistent icons, queued/running/success copy, and disabled unavailable fixes. |
| Preferences | Both settings persist across views and affect local start/completion notifications and new successful bundle archive markers, including changes during a run. |
| Utility controls | Workspace/profile/release information, help, notifications, integration status, full retained activity, and notice expiry. |

`make test` runs the current JSDOM/React route/auth/workspace smoke cases, API-adapter cases, backend policy cases, retained logic cases, and token/theme cases. It compiles the actual component in memory with existing Vite tooling and makes no network requests. It does not substitute offline tests for authenticated production persistence, live GitHub evidence, or external TestSprite results.

Responsive CSS now wraps narrow headers/actions and long metadata, uses flexible grid tracks, keeps mobile navigation internally scrollable, and lets short-height dialogs scroll. Essential small text and coarse-pointer targets were enlarged. Motion remains transform/opacity-based, with reduced-motion and reduced-transparency rules preserved. These are source-level checks, not measured animation-performance results.

A local built-in-browser image confirmed the updated light overview at **310 × 685** with the heading and primary actions fitting inside the viewport. An attempted New release click timed out; a fresh observation showed the unchanged overview. No browser-interaction success is claimed. Desktop/tablet/other mobile widths, zoom, short-screen overlays, real keyboard/touch behaviour, and rendered animation smoothness remain unverified.

These are local audit results, not a fresh Linux CI run or a deployment of this iteration. The pinned runtime remains Node `22.11.0`; this machine's latest checks used Node `26.12.0` / npm `11.20.0`. Docker execution is still blocked by the unavailable local daemon.

## Live deployment evidence — 2026-10-22

- InsForge function `loopline-api` was redeployed successfully and its public health action returned HTTP 200 with storage available.
- Direct function CORS preflights returned 204 for GitHub Pages and both Docker preview origins; an unlisted origin returned 403.
- GitHub Pages deployment for commit [`a793c17`](https://github.com/hemanthreddykoduru/Loopline/commit/a793c17) completed successfully. The bundle produced from that deployed commit contains the repository workspace, same-origin auth refresh path, and configured InsForge endpoints; the old release-demo bundle is no longer served.
- Built-in browser observation at 1280 × 800 confirmed the live landing page, login form, signup form, and unauthenticated `/app` redirect. No credentials or verification codes were entered during this check.
- The earlier live PR deployment checks `build` and `deploy` passed. The workflow is now hardened so pull requests validate without publishing to the public Pages environment; deployment is reserved for `main` or an explicitly approved dispatch. GitGuardian still reports two historical generic-password findings from commit `9d3b756`; those findings are false positives in validation/URL-regex source, but they keep that external check red until dismissed or the branch history is rewritten by an authorized maintainer.

## Current checkout verification — 2026-10-22

- `npm ci --ignore-scripts` completed from the committed lockfile.
- `npm test`: **59 passed**, including 29 backend cases; no failures, skips, or todos.
- `npm run build`: passed with the production Vite bundle.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities** after updating Vite to the patched `6.4.5` release.
- `node --check functions/loopline-api.mjs`: passed.
- `git diff --check`: passed for the checkout changes.
- These local checks used Node `26.12.0` / npm `11.20.0`. The supported release runtime remains Node `22.11.0` with npm `10.x`, and CI/Docker are pinned to that release. A local Node 22 run was not available during this check.
- Docker image execution remains unverified because the local Docker daemon was unavailable. The image definition pins preview to port `4173` and includes a container health check.
- Evidence-boundary source changes in the current checkout were redeployed to `loopline-api` on 2026-10-22; live health and direct function CORS were rechecked after deployment. Frontend Pages deployment remains governed by the main-only workflow change above.
- Commit [`bfd541c`](https://github.com/hemanthreddykoduru/Loopline/commit/bfd541c) is pushed to the open PR. Its GitHub Actions build passed with the 59-test suite, backend syntax check, and diff check; the deploy job correctly skipped because this is a pull request. The existing GitGuardian historical false-positive check remains the only red PR signal.

## TestSprite cloud evidence

**Status: pending project connection.**

Do not replace this section with invented counts. After the TestSprite project is created and the GitHub Pull Request trigger runs, append:

```text
Project: <TestSprite project URL or ID>
Account: <submitting account name/email>
PR run: <run URL>
Verdict: <passed/failed/blocked>
Tests: <passed>/<total>
Failure caught: <what the checker found, if any>
Root-cause fix: <commit or PR comment>
Rerun: <run URL and final verdict>
```

The final submission should show at least one real check on PR [#1](https://github.com/hemanthreddykoduru/Loopline/pull/1). If the first run catches a real issue, preserve the failure comment and the follow-up fix commit so judges can see the complete loop.

## Planned browser coverage

The generated suite should cover the current observable product surface:

- Landing page copy, public read-only disclosure, navigation, and auth-route links.
- Sign-up, sign-in, verification-code handoff, forgot-password, and reset-password validation.
- Auth bootstrap with no session, a restored session, and a transient refresh/config failure.
- Authenticated workspace empty state, sign-out, and refresh/session restoration.
- Connect-repository dialog validation, TestSprite policy selection, success, failure, and retry guidance.
- Repository list loading/error/retry, selected repository detail, and disconnect confirmation.
- Default-branch and observed-PR target selection, exact SHA display, source links, and saved history.
- Ready, blocked, running, unverified, stale, sync-failure, cooldown, and missing-evidence states.
- Keyboard focus, Escape/backdrop dialog dismissal, responsive desktop/tablet/mobile layouts, short viewports, zoom, touch targets, and reduced-motion behavior.

## Honest limitations

- The app reads public GitHub evidence through a deployed InsForge function; it does not write to GitHub, run CI, install an App, or change code.
- The deployed InsForge auth endpoints currently echo arbitrary credentialed origins; the project function CORS allowlist is strict, but production auth/session restoration still needs a platform-side auth CORS allowlist or documented configuration. This was reported to InsForge as feedback `bd69ce63-4b90-4826-a9ea-b478d33381a5`.
- Authenticated persistence and two-user isolation were not exercised with created test users in the recorded backend verification.
- The recorded branch deployment was rebuilt with the three public `VITE_INSFORGE_*` values and served the workspace from its deployed commit. Main-branch promotion remains tied to the open pull request.
- Light-theme regression tests validate CSS tokens and representative contrast pairs, not rendered desktop/mobile layouts or complete browser accessibility.
- Component interaction tests validate the real React app in JSDOM, not browser layout, native event defaults, or animation performance.
- The Docker image definition is present and reproducible; local Docker image execution remains to be verified once the Docker daemon is running.
