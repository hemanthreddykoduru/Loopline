# Loopline — submission brief

## One-line pitch

**Loopline makes the write → verify → fix → verify release loop visible, so a failure comes with a next action instead of a vague red build.**

## Why this is a strong Season 4 entry

The TestSprite Discover gallery makes one thing clear: the strongest projects do not merely mention testing. They make the loop part of the product story, keep a durable record of what the checker found, and give judges a short path to the proof.

Loopline applies that pattern to release readiness:

- **Product quality:** a focused, responsive release cockpit with a clear failure-to-fix path.
- **Verification quality:** release gates, search/filter coverage, required-field validation, failure bundles, and a running-to-green state that TestSprite can exercise.
- **Innovation:** the failure bundle is presented as a decision surface — signal, likely cause, suggested change, and rerun — rather than a generic error page.
- **Proof:** the repo contains the reproducibility contract, public deployment workflow, PR history, and this evidence log. TestSprite results will be linked here only after they actually run.

## 60-second judge path

1. Open the [live app](https://hemanthreddykoduru.github.io/Loopline/).
2. Start on **Checkout refresh** in Overview.
3. Click **View verification bundle**.
4. Read the failed **Browser journeys** signal and the suggested settle-window change.
5. Click **Apply suggested fix**; the bundle closes and the release becomes verified.
6. Click **Run again** to see the verification state move through the loop.
7. Open **Test runs** and **Settings** to see the rest of the surface.
8. Open PR [#1](https://github.com/hemanthreddykoduru/Loopline/pull/1) and read the TestSprite comment/check once it is connected.

## Evidence links

- Repository: https://github.com/hemanthreddykoduru/Loopline
- Live app: https://hemanthreddykoduru.github.io/Loopline/
- Submission PR: https://github.com/hemanthreddykoduru/Loopline/pull/1
- Build/deploy workflow: [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)
- Verification log: [LOOP.md](LOOP.md)
- Local test command: `make test`

## Rubric map

| Rubric | What judges can verify |
| --- | --- |
| Project quality · 40 | The live release cockpit, responsive layout, accessible controls, and complete demo path. |
| Tests that run themselves · 40 | TestSprite suite and PR check after connection; local tests and deployment gate are already in the repository. |
| Innovation · 20 | A product that turns a failure bundle into an explainable recovery loop, not just a status dashboard. |
| Engagement bonus | Optional demo video, Discord post, and a short write-up showing the real failure → fix → green story. |

## Submission checklist

- [x] Public GitHub repository
- [x] Public live URL
- [x] README with app, URL, and suite scope
- [x] Open PR with a successful build/deploy workflow
- [ ] TestSprite project and browser suite created
- [ ] GitHub App connected to `hemanthreddykoduru/Loopline`
- [ ] TestSprite PR check/comment visible on PR #1
- [ ] TestSprite account name/email added to the Discord submission
- [ ] PR URL and live URL posted in `#hackathon-submissions`
- [ ] Optional demo video

## Important honesty rule

Never claim a TestSprite test count, pass rate, failure bundle, or account connection until the portal or PR visibly provides it. Append the real run link to [LOOP.md](LOOP.md) after the check completes.
