# Handoff → Codex: central "track" registry for the jtpp playlist plugin (design phase)

**For:** a fresh Codex instance picking up a **design-only** task (recommend + plan; do not implement yet).
**From:** Claude Code session, 2026-07-07. Combines the original task prompt, a code-grounded review, JT's decisions on the open questions, and concrete transpose examples pulled from the media-hosting workspace.
**Repo:** `jt-practice-player` (this repo). **Site:** breakfreeband.vip. **Media host:** Cloudflare Pages at `media.jtsternberg.com`.

Original prompt this supersedes/extends: `/tmp/collab-tools/jtpp-central-track-cpt-prompt-2026-07-07.md`.

**Need more context?** You can dial the originating Claude Code session over **hotline** for background/history on this plugin — how the editor evolved (front-end-style preview, quick-edit drawer, debounced fields, the block-selection fix), the loop-cue/REST design, prior decisions and why, and the reasoning behind this brief:

- Session ID: `6e0803c6-5221-485d-968c-e7c46530da73` (workspace: this repo, `jt-practice-player`).
- Use the `hotline:dial` skill with that session ID (fork it — quick-call) to ask contextual questions. It also has fresh recall of the `resolve_tracks` seam and the transpose incident.
- That session can itself hotline-dial the media-hosting workspace (`break-free-practice-tracks`, session `27c1b3d1-9b7b-4f59-aa98-061fc075c690`) for more transpose/filename-convention examples if needed.

---

## Goal

Restore the legacy attachment-mode property **"edit once → propagates everywhere"** for **externally-hosted** tracks (mp3s on `media.jtsternberg.com`, intentionally NOT in the WP media library). Today external tracks are stored fully denormalized inline in every playlist block, so any change (retranspose, rename, fix title/duration/artwork, remove) leaves every other block silently stale and 404-ing.

The proposed direction — **evaluate before building** — is a central `track` custom post type (CPT) as the single source of truth, with playlist blocks referencing tracks by ID and `resolve_tracks()` resolving the rest at render time. This handoff confirms the direction is sound and pins down the decisions that were open.

**Deliverable for this phase:** a short written design proposal + recommendation, then an implementation plan broken into reviewable steps. Produce HTML UI mockups (see Decision 3). Flag remaining product questions rather than guessing.

---

## Read these first (the entire integration surface is 3 functions)

In `jt-practice-player.php`:
- `resolve_tracks( array $refs )` — the seam. Iterates refs; if `id` resolves to a WP attachment → `resolve_attachment_track()`, else → `resolve_external_track()`. **Everything downstream consumes the normalized output of this one function.**
- `resolve_external_track( array $ref )` — reads `url,title,artist,album,artwork,duration`; assigns `id => 'url:' . substr( md5( $url ), 0, 16 )` after `sanitize_external_url()` (which does `esc_url_raw` + `set_url_scheme` + `wp_http_validate_url`).
- `normalize_loop_track_id( $track_id )` — the saved-loop-cue id namespace. Currently accepts `^\d+$` (attachment id) OR `^url:[a-f0-9]{16}$` (external hash). Saved loops live in user meta `jtpp_saved_loop_cues` (const `USER_LOOP_CUES_META_KEY`), synced via REST `jtpp/v1/saved-loops`.

Editor side: `src/blocks/playlist/edit.js` (preview + quick-edit drawer + `NEW_EXTERNAL_TRACK` shape) and `src/blocks/single-track/edit.js` (media/external source switch). Block attribute shape for a playlist track today: `{ id, customTitle }` (attachment) or `{ url, title, artist, album, artwork, duration }` (external, no `id`).

---

## Why this change is LOW blast radius (state this in the proposal)

The front-end contract is denormalized **at the `resolve_tracks()` seam**. The block stores a *reference*; `resolve_tracks()` looks up the CPT and emits the **same** `jtpp-data` JSON shape. So the player JS, `<noscript>` `<audio>` fallback, tracklist markup, and loop-cue REST need **zero changes**. The prompt's Q6 "blast radius" mostly collapses to: *nothing downstream of `resolve_tracks` moves.* Adding a third ref type (a CPT id) is a localized change in that trio of functions.

---

## Recommendation on the storage primitive: **CPT (confirmed)**

Not over-engineering — the pain is real and recurring (see the live incident below), and the seam makes it cheap. Rationale to include:
- **CPT wins:** small N (dozens–low hundreds of tracks), needs a real edit UI + search-by-title/artist for a picker, wants free REST/export/portability.
- **Custom table:** reimplements admin UI + REST + export for no benefit at this scale.
- **Taxonomy:** wrong primitive — terms classify, they don't hold rich records (url/artist/artwork as term meta is awkward).
- **Options registry:** no per-item UI, no revisions, poor query.

Suggested registration to avoid CPT downsides: `public=false`, `publicly_queryable=false` (no `/track/foo` pages), `show_in_rest=true` (picker needs it), minimal `supports` (title; consider disabling revisions to kill noise), fields as post meta. See Decision 4 for the admin-UI nuance.

---

## JT's decisions on the open questions

### Decision 1 — ID disambiguation (do NOT overload `id`)
Attachment id and CPT post id are **both integers**; `resolve_tracks` treats a bare int `id` as an attachment. Use a **distinct reference** for CPT tracks — e.g. a new block attribute `trackId` (integer, the CPT post id), or a typed `id: "track:123"`. Do not reuse the ambiguous `id` field. Update `resolve_tracks` to branch on the ref type and `normalize_loop_track_id` accordingly.

### Decision 2 — Saved-loop key = an immutable "guid hash" (JT's call — CONFIRMED as elegant)
> JT: "key by url-hash, but use the `guid` concept — store the url-hash from the first time a URL is set, and never change it. It's the guid hash basically. This survives a transpose URL swap."

**Yes, this works — and it's the cleanest possible answer.** Mechanics:
- On track-post **creation**, compute `guid = 'url:' . substr( md5( sanitize_external_url( firstUrl ) ), 0, 16 )` using the **exact same normalization/hashing as today's `resolve_external_track`**, and store it as **immutable** post meta (e.g. `_jtpp_track_guid`). **Never recompute on URL edit.**
- `resolve_tracks()` emits this **stored** guid as the track `id` in `jtpp-data` (instead of hashing the current URL).
- Saved loop cues keyed by the guid therefore **survive a retranspose/URL swap** (URL changes; guid doesn't) — a genuine UX win over today (where changing the URL orphans the loops).
- **Backward-compat bonus that makes migration nearly free:** because the guid is computed *identically* to today's inline `url:<hash>` id, migrating an existing inline track using its *current* URL as the "first url" yields the **same hash** → existing saved loops (localStorage **and** the `jtpp_saved_loop_cues` user meta) keep matching with **zero loop-data migration**. Two inline blocks sharing a URL converge on one track post with the one matching guid — consistent.
- **Requirements to preserve the property:** identical normalization (`set_url_scheme`, `esc_url_raw`, `substr(md5,0,16)`); compute-once-at-creation immutability; if you ever change the hashing you break every existing loop key, so freeze it.

### Decision 3 — Authoring UX: produce HTML mockups (`/temp-draft`)
JT wants **UI ideas as HTML mockups** before committing. Generate self-contained HTML mocks (use the temp-draft flow) for at least:
1. **Block-editor track picker** — search existing track posts by title/artist, insert into the current playlist.
2. **Paste-a-URL → find-or-create** — the current muscle-memory flow ("Add external URL"), but it finds an existing track post by URL or creates one (auto-dedup).
3. **"Add the same song to this week's practice page"** — the core repeated flow; show how you'd drop an existing track into a new dated practice-session player quickly.
4. **Editing/updating a track** — show both options so JT can compare: (a) native WP CPT edit screen, (b) in-block editing modal. This ties into Decision 4.
Present the mocks for JT to react to before any implementation.

### Decision 4 — Admin visibility: hidden-ish, but native edit screen is probably right for *updates*
JT: "admin-only/hidden — only to support the player. Ideally the admin UI is hidden, delegated to the block editor UI (see #3). But that may be unrealistic, and native WP post-type edit views may actually be **better** for song *updates*."

**Recommended hybrid (flag for JT's final call):**
- Register `public=false` + `show_in_rest=true` for the picker.
- **Keep a native WP edit screen** (`show_ui=true`) for editing a track record (title/url/artist/album/duration/artwork) — the retranspose/update flow (change title **and** url together) is exactly what native post edit does well, for free. Possibly tuck it under the plugin's menu rather than a top-level menu.
- Use the **block editor only for referencing** (picker + paste-URL find-or-create + optional per-block `customTitle` override), not for full record editing.
- Fully-hidden/in-block-only editing is achievable but costs a custom modal and re-implements what WP gives free — call out the tradeoff and let JT decide. The mocks in Decision 3 should make this concrete.

### Decision 5 — Migration metadata conflicts
"Dedup identical URLs into one track post" must handle the same URL carrying **different** inline metadata across blocks (someone fixed a title in only one place — and note titles legitimately drift, e.g. `(½ step down)` vs `(½-step down)`). Pick a policy: most-complete-wins, first-wins, or flag conflicts for manual review. A registry is also the chance to **canonicalize** the drifting title suffixes.

### Decision 6 — Duration/artwork sourcing
Keep **manual for v1** (don't gate the design on it). A server-side range-read of the remote mp3 for duration is doable later as a background-job nicety; YouTube `hqdefault.jpg` artwork stays manual/heuristic. Flag as future, not a blocker.

---

## Live incident that motivates this (concrete, from the media workspace)

A transpose changes **both** the display title **and** the mp3 filename/URL, and the old file is **deleted** on sync (so the old URL 404s everywhere it's still referenced). Real examples:

1. **Wonderwall — whole step down (−2):**
   - Title: `Wonderwall` → `Wonderwall (whole-step down)`
   - File: `35-oasis-wonderwall-official-video.mp3` → `35-oasis-wonderwall-official-video--2-whole-step-down.mp3`
2. **Survival — half step down (−1):**
   - Title: `Survival` → `Survival (½-step down)`
   - File: `06-needtobreathe-survival-...-video.mp3` → `06-needtobreathe-survival-...-video--1-half-step-down.mp3`

Filename suffix convention: `--<n>-<half|whole>-step-down` (`<n>` = absolute semitone count). This single Wonderwall+Survival transpose had to be **hand-patched across 3 separate playlist blocks (pages 100, 133, 134)**; a 4th stale copy was only spared because it was in the trash. That is the exact pain the registry removes: update the one track post (new title + new url), every player re-renders correct, and the guid keeps saved loops intact.

(Source: hotline dial into the `break-free-practice-tracks` workspace, session `27c1b3d1-9b7b-4f59-aa98-061fc075c690`.)

---

## Resolution logic (Q3 from the prompt — for the proposal)

- `resolve_tracks()` gains a branch: ref has `trackId` → load the CPT post, read its meta into the same normalized array (emit the stored `_jtpp_track_guid` as `id`), apply optional per-block `customTitle` override.
- **Cache** CPT lookups (transient keyed by post id + `post_modified`, or an in-request memo) so N players don't each query.
- **Fail gracefully:** missing track post or empty/invalid url → skip the row (don't emit a broken `<li>`/`jtpp-data` entry); consider a subtle editor-only warning. A referenced-but-404 URL still renders (we can't HEAD every url at render time) — that's acceptable and is precisely what the registry lets you fix in one place.
- Let a block **mix** CPT-referenced and inline tracks during rollout.

---

## Backward compatibility (must-hold)

- Existing inline-URL blocks keep rendering unchanged (leave the inline path in `resolve_tracks`).
- Existing attachment-`id` blocks keep rendering unchanged.
- New `trackId` refs are additive.
- Migration (WP-CLI command and/or admin action) converts inline-URL tracks → CPT references, dedupes by normalized URL, and — because of the Decision-2 guid — preserves saved loops automatically.

---

## Next steps (for Codex)

1. Read `resolve_tracks` / `resolve_external_track` / `normalize_loop_track_id` and the two block `edit.js` files; confirm the seam analysis above.
2. Write the **design proposal**: primitive recommendation (CPT + config), the `trackId` ref shape, the guid-hash mechanism (Decision 2) with the identical-hashing requirement called out, resolution + caching + graceful-failure, migration/dedup with the conflict policy (Decision 5), and the admin-visibility hybrid (Decision 4).
3. Produce the **HTML UI mockups** (Decision 3) via temp-draft and surface them to JT.
4. Only after the proposal is green-lit: an **implementation plan** in reviewable steps (CPT registration → resolve_tracks branch + guid emit → editor picker/find-or-create → migration CLI → tests).
5. Flag remaining product questions (final admin-UI shape; title-canonicalization rules; whether to auto-populate duration later).

## Constraints (unchanged)
- Media is external on purpose — never assume WP attachments or pull files into the media library.
- Preserve the rendered front-end contract (`jtpp-data` JSON, tracklist markup, `<noscript>` `<audio>`, loop-cue REST).
- Match plugin conventions (naming, block attribute style, the `resolve_tracks()` seam, `jt-practice-player` textdomain). Read the codebase first.

## State of the repo at handoff
- Branch `main`, HEAD `908af16`. Editor is at the "front-end-style preview + quick-edit drawer + debounced fields + block-select-on-interaction" milestone (see recent commits). No code for this task written yet — design phase only.
- Working tree has unrelated beads/config churn (`.beads/*`, `.gitignore`, untracked `AGENTS.md`/`.env.example`) — not part of this task.
