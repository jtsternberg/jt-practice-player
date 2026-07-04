# JT Practice Player — Design Spec

**Date:** 2026-07-03
**Status:** Approved direction (sections 1–2 reviewed in conversation; 3–7 written per same requirements)
**Branch:** `feature/practice-player`

## Purpose

A standalone WordPress plugin providing Gutenberg blocks for band-practice audio playback. The signature feature: a **waveform display with a draggable A–B loop region**, so musicians can visually select a section of a song (a bridge, a fill, a transition) and put it on repeat while practicing. Inspired by Planning Center's mobile player (loop region on the scrubber), improved by using a real waveform for visual cues.

## Requirements (validated with JT)

- Two blocks sharing one player component:
  - **Practice Playlist** — flat list of audio tracks; clicking/tapping a track loads it into the shared player panel below the list (Planning Center layout: list on top, player at bottom).
  - **Practice Track** — standalone single-track player (a playlist of one, internally).
- Audio sources: **WP Media Library** attachments (m4a/mp3/etc.). No external-URL support in v1.
- Player features:
  - Waveform rendering with click/tap-to-seek.
  - **A–B section looping**: drag on the waveform to create a loop region, resizable via handles, with a loop on/off toggle. When looping and playhead reaches region end, jump to region start.
  - Playback **speed control** (pitch preserved — browser default for `playbackRate`).
  - **±15s skip** buttons; prev/next track buttons in playlist context.
  - **Loop/position persistence** per visitor per track (`localStorage`).
  - **Keyboard shortcuts** (scoped to the focused player).
  - **Practice queue** (playlist only): a checkbox on each track row selects which tracks are in the rotation ("just give me songs 1, 3, and 5"); prev/next and auto-advance traverse only checked tracks. Inspired by Planning Center's web player.
  - **Volume slider** (desktop-oriented; phones use hardware volume).
  - **Per-track download icon** so band members can grab the file offline.
- **Portability is a hard requirement**: the plugin must be fully self-contained (no dependencies on this repo's themes/plugins), usable on any WordPress site, and ready to extract into its own repository later. All docs (this spec, the implementation plan) live inside the plugin directory so they travel with it.

## Approach decision

Three approaches were considered:

- **A (chosen): wavesurfer.js v7 + Regions plugin, blocks built with `@wordpress/scripts`.** The Regions plugin provides drag-to-create/resize loop regions with mouse *and touch* support — precisely the highest-risk interaction in this project — as a mature, maintained solution (~50KB, zero transitive runtime deps, BSD-3 licensed / GPL-compatible).
- B (rejected): no-build, hand-rolled Web Audio + canvas waveform with custom drag handles. Zero deps but re-implements the hardest, fiddliest part (touch drag/resize/seek) for no user-visible gain.
- C (rejected): core `[playlist]`/MediaElement.js with bolt-on loop UI. No waveform — fails the core requirement.

Build output (`build/`) is **committed to git**, so the deployed site (and any future consumer of the plugin) needs no Node tooling. The build step exists only at dev time.

## 1. Plugin architecture

Location: `wp-content/plugins/jt-practice-player/`

```
jt-practice-player/
├── jt-practice-player.php        # bootstrap: registers both blocks from build/
├── readme.txt                    # standard WP plugin readme
├── package.json                  # @wordpress/scripts + wavesurfer.js
├── .wp-env.json                  # standalone local dev environment
├── docs/
│   ├── 2026-07-03-practice-player-design.md   # this file
│   └── 2026-07-03-practice-player-plan.md     # implementation plan
├── src/
│   ├── blocks/
│   │   ├── playlist/             # block.json, index.js, edit.js, render.php
│   │   └── single-track/         # block.json, index.js, edit.js, render.php
│   └── player/
│       ├── view.js               # front-end entry: mounts players (block.json viewScript)
│       ├── player.js             # Player class: wavesurfer + regions + controls
│       ├── persistence.js        # localStorage load/save module
│       └── player.scss           # player styles (front end + editor list styles)
└── build/                        # compiled output — COMMITTED
```

- **Dynamic blocks** (`render.php` via `block.json` `"render"`): post content stores only attachment IDs + options; PHP resolves URLs/titles at render time so media-library changes never strand stale URLs.
- One shared **viewScript** for both blocks; it queries for player root elements and mounts the `Player` class on each. Track data is passed via a JSON `<script type="application/json">` payload inside the block wrapper (robust against attribute-escaping issues, no global state).
- Multiple player blocks on one page are supported; starting playback in one pauses the others.
- **Requirements:** WordPress ≥ 6.1 (block.json `render`), PHP ≥ 7.4. Text domain: `jt-practice-player`. Prefix for all PHP symbols/handles: `jtpp_` / `jtpp-`. License: GPL-2.0-or-later.

## 2. Blocks (editor experience)

**Practice Playlist** (`jtpp/playlist`)

- Attributes:
  - `tracks`: `[{ "id": <attachment id>, "customTitle": <string, optional> }]`
  - `showSkipButtons`: bool, default `true`
  - `showSpeedControl`: bool, default `true`
- Editor UI: `MediaPlaceholder`/`MediaUpload` (multiple, `allowedTypes: ['audio']`); track rows with move up/down + remove buttons; `RichText`-style inline editing of the track title (default = attachment title). Display toggles in the Inspector sidebar.
- No live audio player in the editor for v1 — a clean track-list representation only. Keeps the editor bundle small and avoids loading audio while writing.

**Practice Track** (`jtpp/track`)

- Attributes: `id`, `customTitle?`, same display toggles.
- Same picker (single). Internally rendered as a playlist of one; no track-list UI on the front end.

**Front-end markup (both blocks, from render.php):**

- Playlist: `<div class="jtpp-player" >` containing an ordered track list (each row: a **queue checkbox**, a `button` with title + duration for a11y, and a **download icon** linking to the file with the `download` attribute) + a player panel: track title, waveform container, time display (current / duration), controls row: prev · −15s · play/pause · +15s · next · loop toggle · speed menu · **volume slider** (a `range` input; hidden on narrow viewports where hardware volume rules). Prev/next omitted for single-track; single-track keeps the download icon next to the title.
- Deleted/missing attachments are skipped at render; if a playlist ends up empty (or the single-track attachment is gone), render nothing on the front end and an editor-visible notice in the editor.

## 3. Front-end player behavior

Built on **wavesurfer.js v7** with the **Regions plugin**.

- **Waveform**: rendered from the audio file client-side (wavesurfer decodes via Web Audio). Click/tap seeks. Progress overlay shows played portion.
- **Loop region**: `regions.enableDragSelection()` lets the user drag horizontally on the waveform to create the region; drag its edges to resize; drag its body to move. Exactly **one region max** — creating a new one replaces the old. A dedicated **loop toggle button** (and keyboard `L`) arms/disarms looping; a small **✕ clear** affordance on the region removes it. Region visually distinct (Planning Center-style bracket handles, translucent fill).
- **Loop engine**: on `timeupdate`/`audioprocess`, if looping is armed and `currentTime >= region.end`, set `currentTime = region.start`. Also handles seek-past-end and track-end edge cases (natural `finish` inside an armed loop restarts at region start).
- **Speed control**: menu of 0.5 / 0.6 / 0.7 / 0.75 / 0.8 / 0.9 / 1.0×, `preservesPitch` left at browser default (pitch-preserving). Current rate shown on the button (e.g. "0.8×").
- **Skips**: −15s/+15s buttons (clamped to track bounds).
- **Playlist behavior**: tapping a track row loads it into the single shared player instance (destroy/re-init wavesurfer media, keep UI mounted), highlights the active row, auto-plays. Prev/next buttons wrap the list. Only one wavesurfer instance per playlist block.
- **Practice queue**: every row's checkbox starts checked; unchecking removes the track from the rotation. Prev/next and end-of-track auto-advance skip unchecked tracks (wrapping within the checked set). Tapping an unchecked track's title still plays it directly — the queue governs *advancement*, not what you may tap; advancement afterward resumes from the nearest checked track. If every box is unchecked, prev/next/auto-advance are inert (current track just stops at its end). Checkboxes get `aria-label="Include in practice rotation"`.
- **Volume**: a horizontal `range` slider (0–1, step .05) applied via `ws.setVolume()`; hidden below the small breakpoint.
- **Keyboard shortcuts** (active when focus is within the player, via `focusin`/`focusout` — never global):
  - `Space` play/pause · `L` toggle loop · `←`/`→` seek ±5s · `Shift+←/→` ±15s · `↑`/`↓` speed up/down one step.
- **A11y**: all controls are real `<button>`s with `aria-label`s; loop toggle uses `aria-pressed`; track list rows announce active state via `aria-current`; time display is `aria-live="off"` (polled UI, not announced).

## 4. Persistence

`localStorage` key per track: `jtpp:<attachmentId>` →

```json
{ "loopStart": 62.1, "loopEnd": 94.3, "loopOn": true, "position": 63.0, "rate": 0.8, "updatedAt": 1751500000 }
```

- Restored when a track loads (region recreated, loop state re-armed, position and rate restored).
- The practice-queue selection persists per playlist under `jtpp:queue:<joined attachment ids>` → array of checked attachment IDs (the key self-invalidates when the playlist's tracks change). Volume persists globally under `jtpp:volume`.
- Saved debounced (~1s) on any change and flushed on `pause` and `visibilitychange`/`pagehide`.
- Storage failures (private mode, quota) are silently ignored — persistence is an enhancement, never load-bearing.
- Entries older than 90 days are pruned lazily on write.

## 5. Error handling

- **Load/decode failure** (unsupported codec, 404, network): the waveform area collapses to a message ("Couldn't load waveform — playing without it") and the player falls back to a native `<audio controls>` element so the track remains playable. Loop feature unavailable in fallback mode (v1).
- **Missing attachment**: handled at render time (section 2).
- **No JS**: render.php includes a `<noscript>` native `<audio>` element per track.

## 6. Portability & extraction plan

- No references to anything outside the plugin directory. No theme assumptions (styles use plugin-scoped classes and CSS custom properties for theme-ability: `--jtpp-accent`, `--jtpp-bg`, etc., with sensible defaults that work on light and dark themes).
- `.wp-env.json` in the plugin dir gives it a standalone dev/test environment (`npx wp-env start` from the plugin directory) — no dependence on this repo's hosting setup.
- Extraction to its own repo later = `git mv`/filter of `wp-content/plugins/jt-practice-player/`; nothing else in this repo will reference it.

## 7. Testing & verification

- **Dev environment**: `wp-env` (Docker) from the plugin dir; test posts with a playlist block (3+ tracks incl. an m4a) and a single-track block.
- **JS unit tests**: `persistence.js` and the loop-engine boundary logic (pure functions extracted for testability) via the `wp-scripts test-unit-js` (Jest) setup. The wavesurfer integration itself is verified manually/by browser automation, not unit-tested.
- **Manual/browser checklist** (executed via Claude-driven browser or by JT): create region by drag (mouse + touch), resize both edges, toggle loop, loop boundary jump is seamless-ish, speed change persists, ±15s clamps, playlist track switching, persistence across reload, keyboard shortcuts scoped correctly, two blocks on one page don't fight, editor: add/reorder/remove/rename tracks, missing-file behavior.
- **Quality gates**: `wp-scripts lint-js`, `wp-scripts lint-style`, PHP lint (`php -l`); build succeeds and `build/` committed.

## Out of scope for v1 (noted for later)

- Server-side pre-generated waveform peaks (client decode is fine for practice-length files; revisit if large files feel slow).
- Multiple named loop regions per track ("verse", "bridge").
- Per-track key/BPM metadata badges (Planning Center shows key + BPM per song — nice later; `customTitle` covers it manually for now).
- Loop points shared/saved server-side per user account.
- External URL sources; Planning Center integration; download button.
