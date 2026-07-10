# Media Session and Explicit Loop Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the practice player rich CarPlay/lock-screen metadata and controls while replacing accidental drag-to-loop behavior with default drag-scrubbing and an explicit waveform-backed loop edit mode.

**Architecture:** Native `<audio>` becomes the transport source of truth. Focused `audio-transport.js` and `media-session.js` modules isolate system playback behavior, while a compact gradient timeline handles normal seeking and scrubbing. WaveSurfer attaches to the same audio element only for an explicitly requested, visible loop edit session.

**Tech Stack:** WordPress dynamic blocks, `@wordpress/scripts`, vanilla JavaScript, WaveSurfer.js 7 Regions plugin, SCSS, Jest/jsdom, PHPUnit.

## Global Constraints

- Do not expose Show waveform, Hide waveform, Restore waveform, Skip waveform loading, or equivalent controls.
- Normal timeline tap seeks; normal timeline drag continuously scrubs and never changes loop boundaries.
- Set loop/Edit loop explicitly enters loop edit mode; Done or `Escape` exits it.
- Loop edit helper copy is exactly: `Drag to select a section. Tap to position the playhead.`
- Existing loops can be toggled, restored, or cleared without entering loop edit mode.
- Never fetch or decode waveform data during hidden/background/CarPlay track changes.
- Media Session action support is best-effort; one unsupported action must not block other actions.
- Run `npm run build` after every task that changes `src/` so committed `build/` assets remain synchronized.
- Do not push unless JT explicitly requests it.

---

## File Structure

- Create `src/player/audio-transport.js`: native audio wrapper and transport event contract.
- Create `src/player/media-session.js`: metadata fallback resolution, action registration, playback state, and position state.
- Create `src/player/timeline.js`: pure pointer-to-time and waveform eligibility helpers.
- Create focused tests beside existing player tests.
- Modify `src/player/player.js`: coordinate transport, compact timeline, explicit loop edit mode, and lazy WaveSurfer lifecycle.
- Modify `jt-practice-player.php`: render compact timeline/loop-edit controls and pass site-icon metadata.
- Modify playlist block editor/render files: persist and render `playlistTitle`.
- Modify `src/player/player.scss`: hybrid gradient timeline and loop edit states.
- Regenerate `build/` through `npm run build`; never hand-edit compiled assets.

---

### Task 1: Playlist Metadata Contract

**Files:**
- Modify: `src/blocks/playlist/block.json`
- Modify: `src/blocks/playlist/edit.js`
- Modify: `src/blocks/playlist/render.php`
- Modify: `jt-practice-player.php`
- Modify: `tests/php/bootstrap.php`
- Create: `tests/php/PlayerRenderTest.php`
- Regenerate: `build/blocks/playlist/*`, `build/view.*`

**Interfaces:**
- Produces: `options.playlistTitle: string` and `options.siteIcon: string` in the `.jtpp-data` payload.
- Consumes: existing track fields `title`, `artist`, `album`, and `artwork`.

- [ ] **Step 1: Write the failing PHP payload test**

```php
public function test_render_player_includes_playlist_title_and_site_icon(): void {
	$html = JTPP\render_player(
		array(
			array(
				'id' => 'track-1', 'title' => 'Heavy', 'artist' => 'Birdtalker',
				'album' => 'One', 'artwork' => '', 'duration' => '4:24',
				'url' => 'https://media.example.test/heavy.mp3',
			),
		),
		array(
			'playlist' => true, 'skip' => true, 'speed' => true,
			'fullscreen' => true, 'playlistTitle' => '7.9.26 Practice',
			'siteIcon' => 'https://example.test/icon.png',
		)
	);

	preg_match( '#<script[^>]+jtpp-data[^>]*>(.*?)</script>#s', $html, $matches );
	$data = json_decode( $matches[1], true );
	$this->assertSame( '7.9.26 Practice', $data['options']['playlistTitle'] );
	$this->assertSame( 'https://example.test/icon.png', $data['options']['siteIcon'] );
}
```

Add `get_site_icon_url()` to `tests/php/bootstrap.php` so the renderer test can run outside WordPress.

- [ ] **Step 2: Run the PHP test and verify it fails**

Run: `npm run test:php -- --filter PlayerRenderTest`

Expected: FAIL because the playlist renderer does not yet add the metadata options.

- [ ] **Step 3: Add the playlist attribute and sidebar field**

Add to `src/blocks/playlist/block.json`:

```json
"playlistTitle": { "type": "string", "default": "" }
```

Destructure `playlistTitle` with the other attributes in `edit.js`, then add this first inside the Player options panel:

```jsx
<TextControl
	label={ __( 'Playlist title', 'jt-practice-player' ) }
	help={ __( 'Shown in CarPlay, the lock screen, and other system media controls.', 'jt-practice-player' ) }
	value={ playlistTitle }
	onChange={ ( value ) => setAttributes( { playlistTitle: value } ) }
/>
```

Import `TextControl` from `@wordpress/components` if it is not already imported.

- [ ] **Step 4: Pass sanitized metadata through the dynamic renderer**

In `src/blocks/playlist/render.php`, extend the options array:

```php
'playlistTitle' => sanitize_text_field( $attributes['playlistTitle'] ?? '' ),
'siteIcon'      => esc_url_raw( get_site_icon_url( 512 ) ?: '' ),
```

For the single-track renderer, pass an empty `playlistTitle` and the same `siteIcon` so `player.js` receives one stable options shape.

- [ ] **Step 5: Run tests, lint, and build**

Run:

```bash
npm run test:php -- --filter PlayerRenderTest
npm run lint:js
npm run build
```

Expected: PHP test PASS, lint exits 0, webpack compiles successfully.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/playlist/block.json src/blocks/playlist/edit.js src/blocks/playlist/render.php jt-practice-player.php tests/php/bootstrap.php tests/php/PlayerRenderTest.php build/blocks/playlist build/view.asset.php
git commit -m "add playlist media session metadata"
```

---

### Task 2: Media Session Adapter

**Files:**
- Create: `src/player/media-session.js`
- Create: `src/player/test/media-session.test.js`

**Interfaces:**
- Produces: `createMediaSessionAdapter(mediaSession, MediaMetadataCtor)`.
- Consumes player callbacks: `play`, `pause`, `previous`, `next`, `seekBy`, `seekTo`, `stop`, and `snapshot`.

- [ ] **Step 1: Write failing tests for fallback metadata and isolated actions**

```js
import { createMediaSessionAdapter, resolveAlbum } from '../media-session';

describe( 'resolveAlbum', () => {
	it( 'uses playlist, then song album, then document title', () => {
		expect( resolveAlbum( 'Practice', 'One', 'Page — Site' ) ).toBe( 'Practice' );
		expect( resolveAlbum( '', 'One', 'Page — Site' ) ).toBe( 'One' );
		expect( resolveAlbum( '', '', 'Page — Site' ) ).toBe( 'Page — Site' );
	} );
} );

it( 'honors requested seek offsets and ignores unsupported handlers', () => {
	const handlers = {};
	const mediaSession = {
		setActionHandler: jest.fn( ( action, handler ) => {
			if ( action === 'stop' ) throw new Error( 'unsupported' );
			handlers[ action ] = handler;
		} ),
		setPositionState: jest.fn(), metadata: null, playbackState: 'none',
	};
	const player = { seekBy: jest.fn(), play: jest.fn(), pause: jest.fn() };
	createMediaSessionAdapter( mediaSession, class { constructor( data ) { Object.assign( this, data ); } } ).bind( () => player );
	handlers.seekbackward( { seekOffset: 10 } );
	expect( player.seekBy ).toHaveBeenCalledWith( -10 );
	expect( handlers.play ).toBeDefined();
} );
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:unit -- src/player/test/media-session.test.js --runInBand`

Expected: FAIL because `media-session.js` does not exist.

- [ ] **Step 3: Implement the adapter**

Export this public shape:

```js
export function resolveAlbum( playlistTitle, trackAlbum, documentTitle ) {
	return playlistTitle?.trim() || trackAlbum?.trim() || documentTitle || '';
}

export function createMediaSessionAdapter( mediaSession, MediaMetadataCtor ) {
	let getPlayer = () => null;
	const safely = ( callback ) => { try { callback(); } catch {} };
	const player = () => getPlayer?.();
	return {
		bind( getter ) {
			getPlayer = getter;
			const actions = {
				play: () => player()?.play(), pause: () => player()?.pause(),
				previoustrack: () => player()?.previous(), nexttrack: () => player()?.next(),
				seekbackward: ( event ) => player()?.seekBy( -( event.seekOffset ?? 15 ) ),
				seekforward: ( event ) => player()?.seekBy( event.seekOffset ?? 15 ),
				seekto: ( event ) => player()?.seekTo( event.seekTime ), stop: () => player()?.stop(),
			};
			Object.entries( actions ).forEach( ( [ action, handler ] ) =>
				safely( () => mediaSession.setActionHandler( action, handler ) )
			);
		},
		updateMetadata( track, options, documentTitle ) {
			const artwork = track.artwork || options.siteIcon;
			mediaSession.metadata = new MediaMetadataCtor( {
				title: track.title || documentTitle || '', artist: track.artist || '',
				album: resolveAlbum( options.playlistTitle, track.album, documentTitle ),
				artwork: artwork ? [ { src: artwork } ] : [],
			} );
		},
		updateState( { playing, duration, position, playbackRate } ) {
			mediaSession.playbackState = playing ? 'playing' : 'paused';
			if ( Number.isFinite( duration ) && duration > 0 ) safely( () =>
				mediaSession.setPositionState( {
					duration, playbackRate: playbackRate || 1,
					position: Math.min( duration, Math.max( 0, position || 0 ) ),
				} )
			);
		},
	};
}
```

- [ ] **Step 4: Expand tests for artwork, position clamping, playback state, seekto, previous, next, and stop**

Use table-driven assertions and confirm one thrown `setActionHandler` call does not prevent later handlers from registering.

- [ ] **Step 5: Run tests and lint**

Run:

```bash
npm run test:unit -- src/player/test/media-session.test.js --runInBand
npm run lint:js
```

Expected: all adapter tests PASS and lint exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/player/media-session.js src/player/test/media-session.test.js
git commit -m "add media session adapter"
```

---

### Task 3: Native Audio Transport

**Files:**
- Create: `src/player/audio-transport.js`
- Create: `src/player/test/audio-transport.test.js`
- Modify: `src/player/player.js`
- Regenerate: `build/view.*`

**Interfaces:**
- Produces: `createAudioTransport(audio)` with `play`, `pause`, `stop`, `seekTo`, `seekBy`, `setRate`, `setVolume`, `snapshot`, `on`, and `destroy`.
- Consumes: one cached native `HTMLAudioElement` per track URL.

- [ ] **Step 1: Write failing transport tests**

```js
import { createAudioTransport } from '../audio-transport';

it( 'clamps seeks and reports a stable snapshot', () => {
	const audio = document.createElement( 'audio' );
	Object.defineProperties( audio, {
		duration: { value: 100, configurable: true },
		currentTime: { value: 20, writable: true, configurable: true },
		paused: { value: false, configurable: true },
	} );
	const transport = createAudioTransport( audio );
	transport.seekBy( 200 );
	expect( audio.currentTime ).toBe( 100 );
	expect( transport.snapshot() ).toMatchObject( { position: 100, duration: 100, playing: true } );
} );
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:unit -- src/player/test/audio-transport.test.js --runInBand`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the native transport**

```js
export function createAudioTransport( audio ) {
	const clamp = ( value ) => Math.min( Number.isFinite( audio.duration ) ? audio.duration : value, Math.max( 0, value ) );
	return {
		audio,
		play: () => audio.play(),
		pause: () => audio.pause(),
		stop() { audio.pause(); audio.currentTime = 0; },
		seekTo( seconds ) { if ( Number.isFinite( seconds ) ) audio.currentTime = clamp( seconds ); },
		seekBy( seconds ) { this.seekTo( audio.currentTime + seconds ); },
		setRate( rate ) { audio.playbackRate = rate; },
		setVolume( volume ) { audio.volume = volume; },
		snapshot: () => ( {
			playing: ! audio.paused, position: audio.currentTime || 0,
			duration: audio.duration || 0, playbackRate: audio.playbackRate || 1,
		} ),
		on( event, handler, options ) { audio.addEventListener( event, handler, options ); return () => audio.removeEventListener( event, handler, options ); },
		destroy() { audio.pause(); audio.removeAttribute( 'src' ); audio.load(); },
	};
}
```

- [ ] **Step 4: Move player transport calls off WaveSurfer**

In `PracticePlayer`, create `this.transport` whenever `nativeAudio` changes. Update `play`, `pause`, `skip`, `seekStart`, `applyRate`, `setGlobalVolume`, `updateTimes`, `flushState`, loop boundary jumps, and finish handling to call `this.transport`. Native audio events become the single source for play/pause/timeupdate/ended; remove duplicate WaveSurfer transport event bindings.

Add the Media Session adapter once at module scope and bind it to `activePlayer`. Each active-player change calls `updateMetadata()` and `updateState()`.

- [ ] **Step 5: Verify transport tests and existing regressions**

Run:

```bash
npm run test:unit -- --runInBand
npm run lint:js
npm run build
```

Expected: all JS tests PASS, lint exits 0, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/player/audio-transport.js src/player/media-session.js src/player/player.js src/player/test/audio-transport.test.js src/player/test/media-session.test.js build/view.js build/view.asset.php
git commit -m "use native audio as player transport"
```

---

### Task 4: Compact Scrubbing Timeline and Explicit Loop Mode

**Files:**
- Create: `src/player/timeline.js`
- Create: `src/player/test/timeline.test.js`
- Modify: `jt-practice-player.php`
- Modify: `src/player/player.js`
- Modify: `src/player/player.scss`
- Regenerate: `build/view.*`

**Interfaces:**
- Produces: `timeFromPointer(clientX, rect, duration)` and `waveformEligible(state)`.
- Produces DOM hooks: `.jtpp-timeline`, `.jtpp-timeline-progress`, `.jtpp-timeline-playhead`, `.jtpp-loop-edit`, `.jtpp-loop-edit-done`, and `.jtpp-loop-help`.
- Consumes: Task 3 transport methods.

- [ ] **Step 1: Write failing pure interaction tests**

```js
import { timeFromPointer, waveformEligible } from '../timeline';

it( 'maps and clamps pointer positions to time', () => {
	const rect = { left: 100, width: 400 };
	expect( timeFromPointer( 300, rect, 200 ) ).toBe( 100 );
	expect( timeFromPointer( 50, rect, 200 ) ).toBe( 0 );
	expect( timeFromPointer( 600, rect, 200 ) ).toBe( 200 );
} );

it( 'requires visible loop-edit intent for waveform work', () => {
	expect( waveformEligible( { visible: true, intersecting: true, loopEditing: true, current: true } ) ).toBe( true );
	expect( waveformEligible( { visible: false, intersecting: true, loopEditing: true, current: true } ) ).toBe( false );
	expect( waveformEligible( { visible: true, intersecting: true, loopEditing: false, current: true } ) ).toBe( false );
} );
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:unit -- src/player/test/timeline.test.js --runInBand`

Expected: FAIL because `timeline.js` does not exist.

- [ ] **Step 3: Add compact timeline and explicit edit controls to PHP markup**

Replace the always-mounted waveform with this stable container order:

```php
<div class="jtpp-loop-mode-bar">
	<p class="jtpp-loop-help" hidden><?php esc_html_e( 'Drag to select a section. Tap to position the playhead.', 'jt-practice-player' ); ?></p>
	<button type="button" class="jtpp-loop-edit"><?php esc_html_e( 'Set loop', 'jt-practice-player' ); ?></button>
	<button type="button" class="jtpp-loop-edit-done" hidden><?php esc_html_e( 'Done', 'jt-practice-player' ); ?></button>
</div>
<div class="jtpp-timeline" role="slider" tabindex="0" aria-label="<?php esc_attr_e( 'Playback position', 'jt-practice-player' ); ?>" aria-valuemin="0" aria-valuenow="0">
	<div class="jtpp-timeline-gradient"></div>
	<div class="jtpp-timeline-progress"></div>
	<div class="jtpp-timeline-playhead"></div>
</div>
<div class="jtpp-waveform" hidden></div>
```

- [ ] **Step 4: Implement normal-mode pointer scrubbing**

On timeline `pointerdown`, call `setPointerCapture`, seek immediately, then seek on `pointermove` while captured. On `pointerup`/`pointercancel`, stop scrubbing. Update slider ARIA values and CSS custom property `--jtpp-progress` from native audio `timeupdate`. Do not call any region method from timeline handlers.

Add ArrowLeft/ArrowRight/Home/End support when the timeline itself is focused, using the existing 5-second seek convention.

- [ ] **Step 5: Implement explicit mode state**

Add `this.loopEditing = false`, `enterLoopEditMode()`, and `exitLoopEditMode()`. Set loop/Edit loop calls `enterLoopEditMode`; Done and scoped `Escape` call exit. `reflectLoopTools()` changes the entry label between `Set loop` and `Edit loop` without changing the loop on/off state.

- [ ] **Step 6: Style the hybrid timeline**

Use a 34–44px touch target containing a visually thin 10–14px track, a restrained accent/loop gradient, clear progress and playhead, and `touch-action: none`. Keep the existing 106px waveform only in `.is-loop-editing`. Add `@media (prefers-reduced-motion: reduce)` to disable gradient movement.

- [ ] **Step 7: Run tests, lint, and build**

```bash
npm run test:unit -- --runInBand
npm run lint:js
npm run lint:css
npm run build
```

Expected: all tests PASS; lint and build exit 0.

- [ ] **Step 8: Commit**

```bash
git add jt-practice-player.php src/player/timeline.js src/player/player.js src/player/player.scss src/player/test/timeline.test.js build/view.js build/view.css build/view-rtl.css build/view.asset.php
git commit -m "add explicit loop editing mode"
```

---

### Task 5: Lazy Waveform Lifecycle and Abort Safety

**Files:**
- Modify: `src/player/player.js`
- Modify: `src/player/timeline.js`
- Modify: `src/player/test/timeline.test.js`
- Regenerate: `build/view.*`

**Interfaces:**
- Consumes: `waveformEligible()` and Task 3 transport.
- Produces: abortable `getTrackPeaks(url, signal)` and `ensureWaveformForLoopEditing()`.

- [ ] **Step 1: Extend failing tests for stale and aborted waveform requests**

Test that eligibility becomes false when hidden, offscreen, no longer editing, or the requested track token differs from the current token. Test that an `AbortError` is treated as cancellation rather than waveform failure.

```js
expect( waveformEligible( {
	visible: true, intersecting: true, loopEditing: true, current: false,
} ) ).toBe( false );
```

- [ ] **Step 2: Run tests and verify the new cancellation assertion fails**

Run: `npm run test:unit -- src/player/test/timeline.test.js --runInBand`

Expected: FAIL until current-track identity and cancellation helpers exist.

- [ ] **Step 3: Defer all WaveSurfer creation**

`loadTrack()` must create/reuse native audio and render the compact timeline, but must not call `WaveSurfer.create()` or `getTrackPeaks()`. `enterLoopEditMode()` records user intent and calls `ensureWaveformForLoopEditing()` only when `document.visibilityState === 'visible'` and the observer reports intersection.

- [ ] **Step 4: Add abortable peak fetching**

Create one `AbortController` per pending track request and pass its signal:

```js
async function fetchTrackPeaks( url, signal ) {
	const response = await fetch( url, { signal } );
	if ( ! response.ok ) throw new Error( `Failed to fetch ${ url }: ${ response.status }` );
	const arrayBuffer = await response.arrayBuffer();
	// decode and extract using the existing implementation
}
```

Abort on track change, page hidden, player destruction, or superseding request. Guard decoded results with both URL and request token before applying them.

- [ ] **Step 5: Preserve playback and loops across WaveSurfer attachment**

Pass `media: this.transport.audio` to WaveSurfer. Do not bind WaveSurfer play/pause/timeupdate/finish as transport sources. Hydrate the existing loop region after attachment. Exiting edit mode hides the editing affordances but keeps the already-created waveform available for that track’s page session; changing tracks returns to the compact timeline.

- [ ] **Step 6: Run all automated gates**

```bash
npm run test:unit -- --runInBand
npm run test:php
npm run lint:js
npm run lint:css
npm run build
```

Expected: all tests PASS, both linters exit 0, webpack compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src/player/player.js src/player/timeline.js src/player/test/timeline.test.js build/view.js build/view.asset.php
git commit -m "defer waveform loading until loop editing"
```

---

### Task 6: Integrated Browser and Device Verification

**Files:**
- Modify only if verification exposes a defect in files owned by Tasks 1–5.
- Update: `docs/superpowers/specs/2026-07-10-media-session-lightweight-playback-design.md` only with verified implementation notes, if useful.

**Interfaces:**
- Consumes the completed player.
- Produces a verification report with reproducible evidence and any follow-up Beads issues.

- [ ] **Step 1: Run the complete local quality gate**

```bash
npm run test:unit -- --runInBand
npm run test:php
npm run lint:js
npm run lint:css
npm run build
git status --short
```

Expected: all commands exit 0; only intentional source/build/docs and Beads interaction changes appear.

- [ ] **Step 2: Verify normal timeline behavior on desktop and mobile widths**

At `LOCAL_WP_TEST_URL`, confirm tap seeks, drag scrubs continuously, pointer cancellation is safe, keyboard slider controls work, and no waveform network request occurs before loop editing.

- [ ] **Step 3: Verify loop edit behavior**

Confirm Set loop/Edit loop loads the waveform without interrupting playback; drag creates/moves/resizes; tap seeks without replacing the region; Done and Escape exit; existing loop toggle/restore/clear work without edit mode.

- [ ] **Step 4: Verify hidden/background behavior**

Start playback, background the page, advance at least two tracks from system controls, and confirm audio continues while no waveform fetch or decode starts. Return to the page and confirm the compact timeline remains until loop edit mode is entered.

- [ ] **Step 5: Verify Media Session state**

Confirm metadata fallback order with three fixtures: playlist title, track album, and document title. Confirm artwork fallback, progress, playback rate, play/pause, requested seek offset, exact seek, previous, next, and stop where supported.

- [ ] **Step 6: Verify on iPhone and CarPlay**

On `https://breakfreeband.vip/practice/7-9-26-practice/`, confirm track title/artist, configured playlist title, artwork, progress, and the maximum system-selected controls. Record any Safari/CarPlay limitation as a platform constraint rather than fabricating a web workaround.

- [ ] **Step 7: Commit verification-only fixes separately**

If verification required fixes, stage only those files and commit with a specific `fix:` subject. If no fixes were required, do not create an empty commit.
