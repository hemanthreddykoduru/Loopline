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

These are local audit results, not a fresh Linux CI run or a deployment of this iteration. The pinned runtime remains Node `22.11.0`; this machine's checks used Node `26.7.0` / npm `11.19.0`. Docker execution is still blocked by the unavailable local daemon.

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

The generated suite should cover the observable product surface:

- Overview loads with release metrics and the selected release.
- Sidebar navigation switches between Overview, Releases, Test runs, and Settings.
- Release search filters by name, version, branch, and commit.
- Status filtering and **Clear filters** restore the full queue.
- New release validation shows all three required-field errors.
- A valid new release appears as queued and becomes selected.
- The Checkout refresh verification bundle exposes the failed browser journey.
- Applying the suggested fix closes the bundle and turns the release green.
- Running verification exposes the running state, then the passed state.
- Settings toggles are interactive and the demo disclosure remains visible.
- Dialog keyboard/backdrop dismissal, local utility controls, retained notifications/activity, and independent background verification behave as described in the UI audit above.

## Honest limitations

- The app reads public GitHub evidence through a deployed InsForge function; it does not write to GitHub, run CI, install an App, or change code.
- Authenticated persistence and two-user isolation were not exercised with created test users in the recorded backend verification.
- The public deployment must be rebuilt with the three public `VITE_INSFORGE_*` values before the connected workspace can be exercised there.
- Light-theme regression tests validate CSS tokens and representative contrast pairs, not rendered desktop/mobile layouts or complete browser accessibility.
- Component interaction tests validate the real React app in JSDOM, not browser layout, native event defaults, or animation performance.
- The Docker image definition is present and reproducible; local Docker image execution remains to be verified once the Docker daemon is running.
