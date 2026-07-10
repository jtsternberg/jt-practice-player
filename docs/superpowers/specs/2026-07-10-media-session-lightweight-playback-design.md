# Media Session and Lightweight Playback Design

## Summary

Improve the practice player’s lock-screen, Bluetooth, and CarPlay experience while avoiding unnecessary waveform downloads and decoding during background playback.

The native audio element becomes the source of truth for transport. The default compact timeline supports seeking and drag-scrubbing without downloading waveform data. WaveSurfer loads only when the user explicitly enters loop edit mode, and it may attach without interrupting audio. Media Session metadata, actions, playback state, and position remain synchronized with the active player.

This design covers Media Session and lightweight/background playback. The broader keyboard-navigation and mobile-layout audit remains separate follow-up work.

## Goals

- Show the current song title, artist, playlist context, and artwork in CarPlay and other system media surfaces.
- Expose every relevant Media Session action supported by the browser and receiving device.
- Keep system progress, playback state, position, duration, and playback speed accurate.
- Avoid fetching and decoding waveform peaks until a visible user explicitly enters loop edit mode.
- Allow the waveform to initialize after playback begins without restarting or losing position.
- Make dragging scrub playback by default so users cannot accidentally create loop regions.
- Make loop creation and boundary changes an explicit, discoverable editing mode.
- Preserve playlist, queue, repeat, loop, speed, and persistence behavior.

## Non-goals

- Detecting whether audio is routed specifically to CarPlay, Bluetooth, headphones, or phone speakers. Browsers do not expose a reliable route signal.
- Dictating the exact controls or layout shown by CarPlay. The browser and vehicle decide which registered Media Session actions appear.
- Changing audio quality or bitrate.
- Redesigning the visible mobile player controls or keyboard navigation in this phase.

## Block data

Add an optional `playlistTitle` string attribute to the playlist block.

The playlist block sidebar exposes a text field labeled **Playlist title**. Its help text explains that the value identifies the playlist in CarPlay, the lock screen, and other system media controls.

The dynamic block renderer passes the sanitized value into the player payload as `options.playlistTitle`. Existing blocks have an empty value and require no migration.

Single-track blocks do not expose this field.

## Media metadata

When the active track changes, the active player assigns a new `MediaMetadata` object:

- `title`: current track title; fall back to the WordPress document title if empty.
- `artist`: current track artist; leave empty if unavailable.
- `album`, in order:
  1. Non-empty playlist title.
  2. Non-empty current-track album.
  3. `document.title`, which preserves the final WordPress/theme/SEO document title.
- `artwork`, in order:
  1. Current-track artwork.
  2. WordPress site icon supplied in the server-rendered player payload.
  3. No artwork.

Metadata updates immediately when a track is loaded, including track changes initiated from CarPlay.

## Media Session controls

Register handlers once and route them to the active player:

- `play`
- `pause`
- `previoustrack`
- `nexttrack`
- `seekbackward`
- `seekforward`
- `seekto`
- `stop`

Each registration is isolated in a `try` block because browser support varies by action. Unsupported actions do not break the player.

Seek backward and forward honor the action event’s `seekOffset`. When the device does not provide an offset, use the player’s existing 15-second default. `seekto` clamps the requested time to the current track duration. `stop` pauses and seeks to the beginning without clearing the playlist.

Previous and next use the existing checked practice queue and repeat/wrap behavior.

The player cannot require CarPlay to display any particular registered control.

## Playback state and position

The active player keeps these Media Session values synchronized:

- `playbackState`: `playing`, `paused`, or `none`.
- Position state: duration, current position, and playback rate.

Position state updates after metadata loads, play, pause, seek, playback-rate changes, track changes, and throttled time progress. Invalid or incomplete duration data is not sent. Position is always clamped into the valid range before calling `setPositionState()`.

Inactive player instances never overwrite the active player’s system metadata or position.

## Transport and waveform separation

Introduce a small native-audio transport boundary used by playback behavior and Media Session. The transport owns:

- Play and pause.
- Current time and duration.
- Seeking and playback rate.
- Volume.
- Playback events.
- Track source changes.

WaveSurfer receives the same native audio element through its `media` option, but is treated as a replaceable view. Destroying or detaching WaveSurfer must not pause, reset, replace, or unload the native audio element.

Loop enforcement and persisted playback state use transport time rather than requiring a mounted WaveSurfer instance. The waveform’s Regions plugin continues to create and edit loop boundaries when mounted.

## Timeline and loop interaction

### Normal playback mode

The compact timeline uses the hybrid visual direction: a thin, restrained animated gradient with clear playback progress and current/duration labels. Motion remains subtle and respects `prefers-reduced-motion`.

- Tapping positions the playhead.
- Dragging continuously scrubs the playhead.
- No pointer gesture creates or changes a loop.
- An existing loop can be enabled, disabled, restored from saved cues, or cleared without loading the waveform.
- A visible **Set loop** action appears when no loop exists.
- A visible **Edit loop** action appears when a loop exists.

There are no **Show waveform**, **Hide waveform**, **Restore waveform**, **Skip waveform loading**, or equivalent user-facing controls. Waveform loading is an implementation detail governed by user intent.

### Loop edit mode

Selecting **Set loop** or **Edit loop** enters loop edit mode and immediately begins loading the detailed waveform. Double-click may enter loop edit mode as an optional desktop shortcut, but it is not the primary or required path. Double-tap is not required.

While the waveform is loading, keep native audio controls usable and show a clear loading state in the timeline area. When ready, attach WaveSurfer to the existing native audio element without changing its source, playback position, rate, volume, loop state, or playing/paused state.

In loop edit mode:

- Dragging empty waveform space creates a loop selection.
- Dragging the selected region moves it.
- Dragging either boundary handle resizes it.
- Tapping positions the playhead without replacing or moving the selection.
- Helper text above the interaction area reads: **Drag to select a section. Tap to position the playhead.**
- A visible **Done** action exits loop edit mode.
- `Escape` exits loop edit mode when focus is within the player.

Exiting loop edit mode preserves the detailed waveform for the remainder of the page session. It does not fetch or decode it again for the same cached track. Changing tracks returns to the compact timeline; the new track waveform loads only if the user enters loop edit mode for that track.

## Waveform loading policy

Waveform work may begin only when all of these are true:

- The page is visible.
- The player is in or near the viewport.
- The user has explicitly entered loop edit mode.
- The current track still matches the pending request.

The compact timeline itself never requires waveform peaks. Use `IntersectionObserver` to determine whether a player is visible enough to begin requested waveform work. Entering loop edit mode while the player is visible satisfies the user-intent condition immediately.

When the page becomes hidden:

- Audio continues uninterrupted.
- No waveform is created for subsequent track changes.
- A pending peak-file fetch is aborted.
- Completed cached peaks remain available.
- An already-running `decodeAudioData()` operation may finish because the platform does not provide a reliable cancellation mechanism, but its result must not update a stale track or hidden waveform.

When the page becomes visible again, it remains on the compact timeline. A waveform requested before the page was hidden may resume or restart only if that same player is still in loop edit mode and near the viewport. Background and CarPlay track changes never initiate waveform work.

## Component boundaries

### Media Session adapter

A focused module owns metadata construction, supported-action registration, playback-state updates, and position-state validation. It receives an active-player interface rather than importing player internals.

### Native audio transport

A focused module or narrowly defined player-owned object wraps the native audio element. Both Media Session and visible controls use this interface.

### Waveform controller

Waveform creation, peak loading, abort handling, region hydration, and safe detachment live behind a lifecycle boundary. It consumes the native audio transport but does not own playback.

### Player coordinator

The existing `PracticePlayer` coordinates tracks, queue behavior, persistence, visible controls, loops, and the three boundaries above. It remains responsible for choosing the globally active player.

## Failure behavior

- Missing Media Session support: normal in-page playback continues.
- Unsupported Media Session action: skip that action only.
- Invalid artwork URL: omit that artwork candidate and retain other metadata.
- Waveform fetch or decode failure: audio playback and system controls continue; the visible player reports waveform unavailability.
- Position-state exception: ignore that update and retry on the next valid playback event.
- Detach or reattach failure: preserve native audio playback and show the existing waveform-unavailable state.

## Verification

### Unit tests

- Album fallback precedence: playlist title, track album, document title.
- Artwork fallback precedence: track artwork, site icon, none.
- Media Session action routing and unsupported-action isolation.
- Seek offset handling, exact seeks, clamping, and stop behavior.
- Position-state validation and playback-state mapping.
- Default timeline tap seeking and continuous drag-scrubbing.
- Loop regions cannot be created or modified outside loop edit mode.
- Set loop/Edit loop entry, Done/Escape exit, and helper-text state.
- Waveform eligibility from visibility, intersection, current track, and loop edit mode.
- Stale or aborted peak requests cannot update the current player.
- Waveform attachment does not pause or reset native audio.

### Browser verification

- Normal desktop and mobile playback uses the compact timeline; tap seeks and drag scrubs without creating a loop.
- Enter loop edit mode and confirm the waveform loads without interrupting playback.
- Create, move, and resize a loop; tap the waveform and confirm it seeks without replacing the loop.
- Exit with Done and Escape; confirm the loop remains active and can be toggled without edit mode.
- Start playback, hide/lock the page, and advance several tracks without additional waveform fetches.
- Return to the page and confirm it remains on the compact timeline until loop editing is requested.
- Confirm two player blocks do not fight over Media Session ownership.
- Confirm system metadata changes with the active track.
- Confirm play, pause, seek, previous, next, progress, and speed remain synchronized where supported.

### Device verification

On iPhone and CarPlay, verify the live `7.9.26 Practice` playlist shows the track title and artist, uses the configured playlist title as the album line, displays artwork, updates progress, and exposes every control the system chooses to render.
