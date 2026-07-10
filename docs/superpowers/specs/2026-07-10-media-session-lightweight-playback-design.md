# Media Session and Lightweight Playback Design

## Summary

Improve the practice player’s lock-screen, Bluetooth, and CarPlay experience while avoiding unnecessary waveform downloads and decoding during background playback.

The native audio element becomes the source of truth for transport. WaveSurfer remains the interactive waveform and loop-region view, but it may attach or detach without interrupting audio. Media Session metadata, actions, playback state, and position remain synchronized with the active player.

This design covers Media Session and lightweight/background playback. The broader keyboard-navigation and mobile-layout audit remains separate follow-up work.

## Goals

- Show the current song title, artist, playlist context, and artwork in CarPlay and other system media surfaces.
- Expose every relevant Media Session action supported by the browser and receiving device.
- Keep system progress, playback state, position, duration, and playback speed accurate.
- Avoid fetching and decoding waveform peaks while the page is hidden or while the user has disabled waveform loading.
- Allow the waveform to initialize after playback begins without restarting or losing position.
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

## Waveform loading policy

Waveform work may begin only when all of these are true:

- The page is visible.
- The player is in or near the viewport.
- The user has not enabled **Skip waveform loading**.
- The current track still matches the pending request.

Use `IntersectionObserver` with a modest preloading margin so the waveform is ready shortly before the player scrolls onscreen.

When the page becomes hidden:

- Audio continues uninterrupted.
- No waveform is created for subsequent track changes.
- A pending peak-file fetch is aborted.
- Completed cached peaks remain available.
- An already-running `decodeAudioData()` operation may finish because the platform does not provide a reliable cancellation mechanism, but its result must not update a stale track or hidden waveform.

When the page becomes visible again, the waveform initializes only when its player is near the viewport. It attaches to the existing audio element and reflects the current time, rate, loop, and playback state.

## User preference

Expose a persistent player control labeled **Skip waveform loading** with this explanation:

> Play audio without downloading and processing the interactive waveform.

This preference affects waveform fetching and rendering only. It does not change audio quality, Media Session integration, playback controls, or saved loop enforcement.

Store the preference locally and apply it across practice-player blocks on the same browser. Enabling it aborts pending waveform fetches and detaches the waveform without interrupting audio. Disabling it allows lazy initialization when the visibility and viewport conditions are satisfied.

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
- Waveform eligibility from visibility, intersection, and user preference.
- Stale or aborted peak requests cannot update the current player.
- Waveform detachment does not pause or reset native audio.

### Browser verification

- Normal desktop and mobile playback with the waveform mounted.
- Start playback, hide/lock the page, and advance several tracks without additional waveform fetches.
- Return to the page and confirm lazy waveform initialization at the current position.
- Toggle **Skip waveform loading** during playback in both directions without interruption.
- Confirm two player blocks do not fight over Media Session ownership.
- Confirm system metadata changes with the active track.
- Confirm play, pause, seek, previous, next, progress, and speed remain synchronized where supported.

### Device verification

On iPhone and CarPlay, verify the live `7.9.26 Practice` playlist shows the track title and artist, uses the configured playlist title as the album line, displays artwork, updates progress, and exposes every control the system chooses to render.
