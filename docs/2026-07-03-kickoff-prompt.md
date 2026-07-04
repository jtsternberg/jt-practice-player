# Kickoff prompt — JT Practice Player implementation

Copy everything below the rule into a fresh agent session.

---

You are implementing the **JT Practice Player** WordPress plugin from an approved spec and plan. The design phase is done — do not redesign; execute.

## Context

- Source of truth: https://github.com/jtsternberg/jt-practice-player — a local checkout lives at `/home/jtsternberg/Code/wpengine-jtsternberg/wp-content/plugins/jt-practice-player`. It is a git-submodule checkout, but treat it as a standalone repository: its `origin` is the plugin repo, an SSH push URL is already configured, and all work happens inside this directory.
- Read these first, in order, before writing anything:
  1. `docs/2026-07-03-practice-player-design.md` — the approved design spec
  2. `docs/2026-07-03-practice-player-plan.md` — the implementation plan: 9 tasks with checkbox steps, exact file paths, test code, and commit messages
- Hard constraints (also in the plan's Global Constraints — they win over any instinct you have): the plugin is fully self-contained, no references outside its directory; WordPress ≥ 6.1, PHP ≥ 7.4; prefix `jtpp_`/`jtpp-`; text domain `jt-practice-player`; tabs for indentation; `build/` output is committed.

## How to execute

- Use the superpowers:subagent-driven-development skill: a fresh subagent per plan task, review each task's diff yourself before moving on.
- **Model routing** — each task carries a `**Model:**` annotation; honor it when dispatching:
  - Sonnet: tasks 1, 2, 3, 4, 5, 7, 8 (code is specified nearly line-for-line in the plan)
  - Opus: task 6 (wavesurfer player core — real integration judgment) and task 9 (end-to-end verification)
- Ordering: task 1 first; tasks 2–5 are independent after it (parallelize if convenient); task 8 anytime after 1; tasks 6–7 need 2–5; task 9 last.
- TDD as written: the plan contains the failing tests verbatim. Run them, watch them fail, implement, watch them pass. Don't skip the failing run.
- Commit at the end of every task using the plan's commit message; push to `origin main` after each task. Run `npm run build` before any commit that touched `src/`.
- Task 6's one explicit judgment call: verify the wavesurfer v7 API against `node_modules/wavesurfer.js/dist/types.d.ts` (exact `setPlaybackRate` signature, Regions plugin event names) instead of assuming.

## Environment

- Node 22 and npm are installed. `wp-env` requires Docker — check `docker info` early; if Docker is unavailable, complete everything else and explicitly defer task 9's live checks in your report rather than faking them.
- `agent-browser` (v0.27+) is installed for task 9's browser verification — run it headless and save screenshots as evidence.
- Git: commit as the repo's configured user. Do **not** push to any remote other than this plugin repo's `origin`.
- The parent directory (`/home/jtsternberg/Code/wpengine-jtsternberg`) is a separate production-site repo. Do not modify it, with one exception: after ALL tasks pass, you may bump this plugin's submodule gitlink on its `feature/practice-player` branch and push that branch ONLY to its `github` remote — **never** to its `origin` remote, which deploys straight to WP Engine production.

## Definition of done

- All 9 tasks committed and pushed to the plugin repo's `main`.
- Quality gates clean: `npm run test:unit`, `npm run lint:js`, `npm run lint:css`, `npm run build`, and `php -l` on every PHP file.
- Task 9's checklist executed in wp-env with results (including queue, volume, download, loop-region, persistence, and keyboard items) summarized in the final commit body — or explicitly deferred with the reason if Docker was unavailable.
- Final report to the user: what shipped, what was deferred, and any deviation from the spec/plan with its justification. If you discover a genuine flaw in the plan, fix forward and record the deviation — don't silently diverge.
