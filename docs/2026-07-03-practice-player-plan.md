# JT Practice Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone WP plugin with two Gutenberg blocks (Practice Playlist, Practice Track) whose front-end player shows a waveform with a draggable A–B loop region, speed control, ±15s skips, persistence, and keyboard shortcuts — for band practice.

**Architecture:** Dynamic blocks (`render.php`) store attachment IDs; PHP resolves URLs at render time and emits shared player markup + a JSON payload. One shared front-end bundle mounts a `PracticePlayer` class (wavesurfer.js v7 + Regions plugin) on each player root. Pure logic (loop boundaries, speed steps, persistence) lives in small unit-tested modules.

**Tech Stack:** PHP ≥ 7.4, WordPress ≥ 6.1, `@wordpress/scripts` (build/lint/Jest), wavesurfer.js ^7 (+ Regions plugin), `wp-env` for local dev.

**Spec:** `docs/2026-07-03-practice-player-design.md` (same directory — read it first).

## Model Delegation

Each task is annotated **Model: Sonnet** or **Model: Opus**.

- **Sonnet** — tasks where this plan specifies the code nearly completely: scaffolding, pure-logic modules with tests supplied, block registration/render PHP, editor CRUD UI, styles.
- **Opus** — tasks with real integration judgment: the wavesurfer player class, playlist switching/keyboard/fallback behavior, and end-to-end verification in wp-env.

Tasks 2–5 are independent of each other once Task 1 lands (parallelizable). Tasks 6–7 depend on 2–5. Task 8 can run any time after Task 1. Task 9 is last.

## Global Constraints

- All work on branch `feature/practice-player`; commit at the end of every task.
- Plugin directory `wp-content/plugins/jt-practice-player/` is the universe: **no references to anything outside it** (portability is a hard requirement — this dir becomes its own repo later).
- WordPress ≥ 6.1, PHP ≥ 7.4. Text domain `jt-practice-player`. PHP prefix `jtpp_`, handle/class prefix `jtpp-`. License GPL-2.0-or-later.
- `build/` output is committed. Run `npm run build` before any commit that changed `src/`.
- Indentation: tabs (repo convention). Escape all render output (`esc_url`, `esc_html`, `esc_attr`, `wp_json_encode`).
- Run commands from the plugin directory unless a step says otherwise.

---

### Task 1: Plugin scaffold + build toolchain

**Model: Sonnet**

**Files:**
- Create: `jt-practice-player.php`, `package.json`, `webpack.config.js`, `.wp-env.json`, `readme.txt`, `src/player/view.js` (stub), `src/player/player.scss` (stub)

**Interfaces:**
- Produces: script handle `jtpp-view` (front-end bundle from `src/player/view.js`), style handle `jtpp-player` (from `player.scss` imported by `view.js`), constant `JTPP_VERSION`, helper `jtpp_render_player( array $tracks, array $options ): string` (defined in Task 4, but the bootstrap file it lives in is created here).

- [ ] **Step 1: Create the plugin bootstrap**

`jt-practice-player.php`:

```php
<?php
/**
 * Plugin Name:       JT Practice Player
 * Description:       Audio playlist and single-track blocks with waveform display and A–B section looping, for band practice.
 * Version:           0.1.0
 * Requires at least: 6.1
 * Requires PHP:      7.4
 * Author:            Justin Sternberg
 * License:           GPL-2.0-or-later
 * Text Domain:       jt-practice-player
 */

namespace JTPP;

defined( 'ABSPATH' ) || exit;

const JTPP_VERSION = '0.1.0';

add_action( 'init', __NAMESPACE__ . '\\register' );
function register() {
	$dir = plugin_dir_path( __FILE__ );
	$url = plugin_dir_url( __FILE__ );

	wp_register_script( 'jtpp-view', $url . 'build/view.js', array(), JTPP_VERSION, true );
	if ( file_exists( $dir . 'build/view.css' ) ) {
		wp_register_style( 'jtpp-player', $url . 'build/view.css', array(), JTPP_VERSION );
	}

	foreach ( glob( $dir . 'build/blocks/*/block.json' ) as $block_json ) {
		register_block_type( $block_json );
	}
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
	"name": "jt-practice-player",
	"version": "0.1.0",
	"private": true,
	"license": "GPL-2.0-or-later",
	"scripts": {
		"build": "wp-scripts build --webpack-copy-php",
		"start": "wp-scripts start --webpack-copy-php",
		"test:unit": "wp-scripts test-unit-js",
		"lint:js": "wp-scripts lint-js src",
		"lint:css": "wp-scripts lint-style \"src/**/*.scss\""
	},
	"dependencies": {
		"wavesurfer.js": "^7.9.0"
	},
	"devDependencies": {
		"@wordpress/scripts": "^30.0.0"
	}
}
```

- [ ] **Step 3: Create `webpack.config.js`** (adds the shared view entry alongside auto-discovered blocks)

```js
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

module.exports = {
	...defaultConfig,
	entry: {
		...defaultConfig.entry(),
		view: path.resolve( __dirname, 'src/player/view.js' ),
	},
};
```

- [ ] **Step 4: Create `.wp-env.json`**

```json
{
	"core": null,
	"plugins": [ "." ]
}
```

- [ ] **Step 5: Create stubs so the build passes**

`src/player/player.scss`:

```scss
.jtpp {
	// Player styles land in Task 8.
}
```

`src/player/view.js`:

```js
import './player.scss';
// Player mounting lands in Task 6.
```

- [ ] **Step 6: Create `readme.txt`**

```
=== JT Practice Player ===
Contributors: jtsternberg
Tags: audio, playlist, waveform, loop, practice
Requires at least: 6.1
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later

Audio playlist and single-track blocks with waveform display and A–B section looping, for band practice.

== Description ==

Two blocks — Practice Playlist and Practice Track — that render a waveform player
(wavesurfer.js). Drag on the waveform to select a section and loop it while you
practice. Includes playback-speed control, ±15s skips, per-track memory of your
loop and position, and keyboard shortcuts.
```

- [ ] **Step 7: Install and build**

Run: `npm install && npm run build`
Expected: build succeeds; `build/view.js` and `build/view.css` exist. (No blocks yet — the glob in the bootstrap simply matches nothing.)

- [ ] **Step 8: Sanity-lint PHP**

Run: `php -l jt-practice-player.php`
Expected: `No syntax errors detected`

- [ ] **Step 9: Commit**

```bash
git add -A wp-content/plugins/jt-practice-player
git commit -m "feat(practice-player): scaffold plugin, build toolchain, wp-env"
```

---

### Task 2: Loop-engine module (pure logic, TDD)

**Model: Sonnet**

**Files:**
- Create: `src/player/loop-engine.js`
- Test: `src/player/test/loop-engine.test.js`

**Interfaces:**
- Produces:
  - `loopJumpTarget( currentTime: number, loop: {start:number,end:number,on:boolean}|null ): number|null` — returns the position to jump to, or `null` for "don't touch playback".
  - `clampSeek( time: number, duration: number ): number`
  - `SPEED_STEPS: number[]` — `[0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1]`
  - `nextSpeed( current: number, direction: 1|-1 ): number` — next step, clamped at ends; snaps unknown rates to the nearest step first.

- [ ] **Step 1: Write the failing tests** — `src/player/test/loop-engine.test.js`:

```js
import { loopJumpTarget, clampSeek, nextSpeed, SPEED_STEPS } from '../loop-engine';

describe( 'loopJumpTarget', () => {
	const loop = { start: 62.1, end: 94.3, on: true };

	it( 'returns null when there is no loop', () => {
		expect( loopJumpTarget( 80, null ) ).toBeNull();
	} );
	it( 'returns null when the loop is disarmed', () => {
		expect( loopJumpTarget( 100, { ...loop, on: false } ) ).toBeNull();
	} );
	it( 'returns null while inside the region', () => {
		expect( loopJumpTarget( 80, loop ) ).toBeNull();
	} );
	it( 'returns loop start at/after the region end', () => {
		expect( loopJumpTarget( 94.3, loop ) ).toBe( 62.1 );
		expect( loopJumpTarget( 120, loop ) ).toBe( 62.1 );
	} );
	it( 'returns null before the region start (user may listen up into the loop)', () => {
		expect( loopJumpTarget( 10, loop ) ).toBeNull();
	} );
	it( 'ignores degenerate regions (end <= start)', () => {
		expect( loopJumpTarget( 80, { start: 50, end: 50, on: true } ) ).toBeNull();
	} );
} );

describe( 'clampSeek', () => {
	it( 'clamps below zero', () => expect( clampSeek( -4, 200 ) ).toBe( 0 ) );
	it( 'clamps past duration', () => expect( clampSeek( 250, 200 ) ).toBe( 200 ) );
	it( 'passes through in range', () => expect( clampSeek( 42, 200 ) ).toBe( 42 ) );
} );

describe( 'nextSpeed', () => {
	it( 'steps down', () => expect( nextSpeed( 1, -1 ) ).toBe( 0.9 ) );
	it( 'steps up', () => expect( nextSpeed( 0.75, 1 ) ).toBe( 0.8 ) );
	it( 'clamps at the slow end', () => expect( nextSpeed( 0.5, -1 ) ).toBe( 0.5 ) );
	it( 'clamps at full speed', () => expect( nextSpeed( 1, 1 ) ).toBe( 1 ) );
	it( 'snaps unknown rates to the nearest step first', () => {
		expect( nextSpeed( 0.72, 1 ) ).toBe( 0.75 );
	} );
	it( 'exposes the canonical steps', () => {
		expect( SPEED_STEPS ).toEqual( [ 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1 ] );
	} );
} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- loop-engine`
Expected: FAIL — cannot find module `../loop-engine`.

- [ ] **Step 3: Implement** — `src/player/loop-engine.js`:

```js
export const SPEED_STEPS = [ 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1 ];

export function loopJumpTarget( currentTime, loop ) {
	if ( ! loop || ! loop.on || loop.end <= loop.start ) {
		return null;
	}
	return currentTime >= loop.end ? loop.start : null;
}

export function clampSeek( time, duration ) {
	return Math.min( Math.max( time, 0 ), duration );
}

export function nextSpeed( current, direction ) {
	let nearest = 0;
	SPEED_STEPS.forEach( ( step, i ) => {
		if ( Math.abs( step - current ) < Math.abs( SPEED_STEPS[ nearest ] - current ) ) {
			nearest = i;
		}
	} );
	const next = nearest + direction;
	return SPEED_STEPS[ Math.min( Math.max( next, 0 ), SPEED_STEPS.length - 1 ) ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- loop-engine`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/player/loop-engine.js src/player/test/loop-engine.test.js
git commit -m "feat(practice-player): loop-engine pure logic with unit tests"
```

---

### Task 3: Persistence module (localStorage, TDD)

**Model: Sonnet**

**Files:**
- Create: `src/player/persistence.js`
- Test: `src/player/test/persistence.test.js`

**Interfaces:**
- Produces:
  - `loadTrackState( trackId: number, storage? ): {loopStart,loopEnd,loopOn,position,rate}|null`
  - `saveTrackState( trackId: number, state: object, storage?, now?: number ): void` — also prunes entries older than 90 days.
  - `loadQueue( trackIds: number[], storage? ): number[]` — checked attachment IDs for this playlist; defaults to ALL of `trackIds` when nothing stored.
  - `saveQueue( trackIds: number[], checkedIds: number[], storage? ): void` — key `jtpp:queue:<trackIds.join('-')>` (self-invalidates when the playlist changes).
  - `loadVolume( storage? ): number` (default 1) / `saveVolume( volume: number, storage? ): void` — global key `jtpp:volume`.
  - Storage keys: `jtpp:<trackId>`, `jtpp:queue:<ids>`, `jtpp:volume`. All failures swallowed (persistence is an enhancement, never load-bearing).

- [ ] **Step 1: Write the failing tests** — `src/player/test/persistence.test.js`:

```js
import { loadTrackState, saveTrackState, loadQueue, saveQueue, loadVolume, saveVolume } from '../persistence';

function memoryStorage() {
	const map = new Map();
	return {
		getItem: ( k ) => ( map.has( k ) ? map.get( k ) : null ),
		setItem: ( k, v ) => map.set( k, String( v ) ),
		removeItem: ( k ) => map.delete( k ),
		key: ( i ) => Array.from( map.keys() )[ i ] ?? null,
		get length() {
			return map.size;
		},
	};
}

const DAY = 86400000;
const state = { loopStart: 62.1, loopEnd: 94.3, loopOn: true, position: 63, rate: 0.8 };

describe( 'persistence', () => {
	it( 'round-trips track state', () => {
		const s = memoryStorage();
		saveTrackState( 123, state, s, 1000 * DAY );
		expect( loadTrackState( 123, s ) ).toMatchObject( state );
	} );
	it( 'returns null for unknown tracks', () => {
		expect( loadTrackState( 999, memoryStorage() ) ).toBeNull();
	} );
	it( 'returns null for corrupt JSON', () => {
		const s = memoryStorage();
		s.setItem( 'jtpp:5', '{nope' );
		expect( loadTrackState( 5, s ) ).toBeNull();
	} );
	it( 'prunes entries older than 90 days on save', () => {
		const s = memoryStorage();
		saveTrackState( 1, state, s, 0 );
		saveTrackState( 2, state, s, 91 * DAY );
		expect( loadTrackState( 1, s ) ).toBeNull();
		expect( loadTrackState( 2, s ) ).toMatchObject( state );
	} );
	it( 'defaults the queue to all tracks', () => {
		expect( loadQueue( [ 1, 2, 3 ], memoryStorage() ) ).toEqual( [ 1, 2, 3 ] );
	} );
	it( 'round-trips the queue, keyed by the track list', () => {
		const s = memoryStorage();
		saveQueue( [ 1, 2, 3 ], [ 1, 3 ], s );
		expect( loadQueue( [ 1, 2, 3 ], s ) ).toEqual( [ 1, 3 ] );
		// Different playlist (changed tracks) falls back to all-checked:
		expect( loadQueue( [ 1, 2, 4 ], s ) ).toEqual( [ 1, 2, 4 ] );
	} );
	it( 'round-trips volume with a default of 1', () => {
		const s = memoryStorage();
		expect( loadVolume( s ) ).toBe( 1 );
		saveVolume( 0.4, s );
		expect( loadVolume( s ) ).toBe( 0.4 );
	} );
	it( 'swallows storage failures', () => {
		const broken = { getItem() { throw new Error( 'quota' ); }, setItem() { throw new Error( 'quota' ); }, key() { return null; }, removeItem() {}, length: 0 };
		expect( () => saveTrackState( 1, state, broken, 0 ) ).not.toThrow();
		expect( loadTrackState( 1, broken ) ).toBeNull();
	} );
} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- persistence`
Expected: FAIL — cannot find module `../persistence`.

- [ ] **Step 3: Implement** — `src/player/persistence.js`:

```js
const PREFIX = 'jtpp:';
const MAX_AGE_MS = 90 * 86400000;

function defaultStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function loadTrackState( trackId, storage = defaultStorage() ) {
	try {
		const raw = storage && storage.getItem( PREFIX + trackId );
		if ( ! raw ) {
			return null;
		}
		const parsed = JSON.parse( raw );
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

export function saveTrackState( trackId, state, storage = defaultStorage(), now = Date.now() ) {
	try {
		storage.setItem( PREFIX + trackId, JSON.stringify( { ...state, updatedAt: now } ) );
		prune( storage, now );
	} catch {
		// Persistence is best-effort.
	}
}

export function loadQueue( trackIds, storage = defaultStorage() ) {
	try {
		const raw = storage && storage.getItem( `${ PREFIX }queue:${ trackIds.join( '-' ) }` );
		const parsed = raw ? JSON.parse( raw ) : null;
		return Array.isArray( parsed ) ? parsed : [ ...trackIds ];
	} catch {
		return [ ...trackIds ];
	}
}

export function saveQueue( trackIds, checkedIds, storage = defaultStorage() ) {
	try {
		storage.setItem( `${ PREFIX }queue:${ trackIds.join( '-' ) }`, JSON.stringify( checkedIds ) );
	} catch {
		// Best-effort.
	}
}

export function loadVolume( storage = defaultStorage() ) {
	try {
		const raw = storage && storage.getItem( `${ PREFIX }volume` );
		const parsed = raw === null || raw === undefined ? NaN : Number( raw );
		return Number.isFinite( parsed ) ? Math.min( Math.max( parsed, 0 ), 1 ) : 1;
	} catch {
		return 1;
	}
}

export function saveVolume( volume, storage = defaultStorage() ) {
	try {
		storage.setItem( `${ PREFIX }volume`, String( volume ) );
	} catch {
		// Best-effort.
	}
}

function prune( storage, now ) {
	const stale = [];
	for ( let i = 0; i < storage.length; i++ ) {
		const key = storage.key( i );
		if ( ! key || ! key.startsWith( PREFIX ) ) {
			continue;
		}
		try {
			const { updatedAt = 0 } = JSON.parse( storage.getItem( key ) ) || {};
			if ( now - updatedAt > MAX_AGE_MS ) {
				stale.push( key );
			}
		} catch {
			stale.push( key );
		}
	}
	stale.forEach( ( key ) => storage.removeItem( key ) );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- persistence`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/player/persistence.js src/player/test/persistence.test.js
git commit -m "feat(practice-player): localStorage persistence module with unit tests"
```

---

### Task 4: Shared PHP renderer + Practice Track block

**Model: Sonnet**

**Files:**
- Modify: `jt-practice-player.php` (add renderer + track resolution)
- Create: `src/blocks/single-track/block.json`, `src/blocks/single-track/index.js`, `src/blocks/single-track/edit.js`, `src/blocks/single-track/render.php`

**Interfaces:**
- Consumes: handles `jtpp-view`, `jtpp-player` (Task 1).
- Produces:
  - `JTPP\resolve_tracks( array $refs ): array` — refs like `[ [ 'id' => 12, 'customTitle' => '' ] ]` → `[ [ 'id' => 12, 'url' => '…', 'title' => '…', 'duration' => '3:32' ] ]`; missing attachments skipped.
  - `JTPP\render_player( array $tracks, array $options ): string` — the markup contract below, consumed by the player JS (Task 6) and styles (Task 8). `$options = [ 'playlist' => bool, 'skip' => bool, 'speed' => bool ]`.

**Markup contract** (`render_player` output — Tasks 6/8 depend on these exact classes):

```html
<div class="jtpp" data-jtpp>
	<script type="application/json" class="jtpp-data">{"tracks":[…],"options":{…}}</script>
	<ol class="jtpp-tracklist"><!-- playlist only -->
		<li>
			<input type="checkbox" class="jtpp-queue-check" data-index="0" checked aria-label="Include in practice rotation" />
			<button type="button" class="jtpp-track" data-index="0">
				<span class="jtpp-track-title">Original Mix (transposed)</span>
				<span class="jtpp-track-duration">3:32</span>
			</button>
			<a class="jtpp-download" href="…file url…" download aria-label="Download track">⭳</a>
		</li>
	</ol>
	<div class="jtpp-panel">
		<div class="jtpp-now-playing"></div>
		<div class="jtpp-waveform"></div>
		<div class="jtpp-fallback" hidden></div>
		<div class="jtpp-times"><span class="jtpp-time-current">0:00</span><span class="jtpp-time-total">0:00</span></div>
		<div class="jtpp-controls">
			<button type="button" class="jtpp-prev" aria-label="Previous track">⏮</button><!-- playlist only -->
			<button type="button" class="jtpp-back15" aria-label="Back 15 seconds">↺15</button><!-- if skip -->
			<button type="button" class="jtpp-play" aria-label="Play">▶</button>
			<button type="button" class="jtpp-fwd15" aria-label="Forward 15 seconds">↻15</button><!-- if skip -->
			<button type="button" class="jtpp-next" aria-label="Next track">⏭</button><!-- playlist only -->
			<button type="button" class="jtpp-loop" aria-label="Toggle section loop" aria-pressed="false">🔁</button>
			<button type="button" class="jtpp-speed" aria-label="Playback speed">1×</button><!-- if speed -->
			<input type="range" class="jtpp-volume" min="0" max="1" step="0.05" value="1" aria-label="Volume" /><!-- hidden on narrow viewports via CSS -->
		</div>
	</div>
	<noscript><!-- one <audio controls preload="none"> per track --></noscript>
</div>
```

(Placeholder glyphs above are fine for this task; Task 8 replaces button text with inline SVG icons.)

- [ ] **Step 1: Add renderer functions to `jt-practice-player.php`** (append after `register()`):

```php
function resolve_tracks( array $refs ): array {
	$tracks = array();
	foreach ( $refs as $ref ) {
		$id  = isset( $ref['id'] ) ? (int) $ref['id'] : 0;
		$url = $id ? wp_get_attachment_url( $id ) : false;
		if ( ! $url ) {
			continue;
		}
		$meta     = wp_get_attachment_metadata( $id );
		$tracks[] = array(
			'id'       => $id,
			'url'      => $url,
			'title'    => ! empty( $ref['customTitle'] ) ? $ref['customTitle'] : get_the_title( $id ),
			'duration' => $meta['length_formatted'] ?? '',
		);
	}
	return $tracks;
}

function render_player( array $tracks, array $options ): string {
	if ( ! $tracks ) {
		return '';
	}
	wp_enqueue_script( 'jtpp-view' );
	wp_enqueue_style( 'jtpp-player' );

	$payload = array( 'tracks' => $tracks, 'options' => $options );

	ob_start();
	?>
	<script type="application/json" class="jtpp-data"><?php echo wp_json_encode( $payload ); ?></script>
	<?php if ( $options['playlist'] ) : ?>
	<ol class="jtpp-tracklist">
		<?php foreach ( $tracks as $i => $track ) : ?>
		<li>
			<input type="checkbox" class="jtpp-queue-check" data-index="<?php echo esc_attr( $i ); ?>" checked aria-label="<?php esc_attr_e( 'Include in practice rotation', 'jt-practice-player' ); ?>" />
			<button type="button" class="jtpp-track" data-index="<?php echo esc_attr( $i ); ?>">
				<span class="jtpp-track-title"><?php echo esc_html( $track['title'] ); ?></span>
				<span class="jtpp-track-duration"><?php echo esc_html( $track['duration'] ); ?></span>
			</button>
			<a class="jtpp-download" href="<?php echo esc_url( $track['url'] ); ?>" download aria-label="<?php esc_attr_e( 'Download track', 'jt-practice-player' ); ?>">⭳</a>
		</li>
		<?php endforeach; ?>
	</ol>
	<?php endif; ?>
	<div class="jtpp-panel">
		<div class="jtpp-now-playing"></div>
		<div class="jtpp-waveform"></div>
		<div class="jtpp-fallback" hidden></div>
		<div class="jtpp-times"><span class="jtpp-time-current">0:00</span><span class="jtpp-time-total">0:00</span></div>
		<div class="jtpp-controls">
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-prev" aria-label="<?php esc_attr_e( 'Previous track', 'jt-practice-player' ); ?>">⏮</button><?php endif; ?>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-back15" aria-label="<?php esc_attr_e( 'Back 15 seconds', 'jt-practice-player' ); ?>">↺15</button><?php endif; ?>
			<button type="button" class="jtpp-play" aria-label="<?php esc_attr_e( 'Play', 'jt-practice-player' ); ?>">▶</button>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-fwd15" aria-label="<?php esc_attr_e( 'Forward 15 seconds', 'jt-practice-player' ); ?>">↻15</button><?php endif; ?>
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-next" aria-label="<?php esc_attr_e( 'Next track', 'jt-practice-player' ); ?>">⏭</button><?php endif; ?>
			<button type="button" class="jtpp-loop" aria-label="<?php esc_attr_e( 'Toggle section loop', 'jt-practice-player' ); ?>" aria-pressed="false">🔁</button>
			<?php if ( $options['speed'] ) : ?><button type="button" class="jtpp-speed" aria-label="<?php esc_attr_e( 'Playback speed', 'jt-practice-player' ); ?>">1×</button><?php endif; ?>
			<input type="range" class="jtpp-volume" min="0" max="1" step="0.05" value="1" aria-label="<?php esc_attr_e( 'Volume', 'jt-practice-player' ); ?>" />
		</div>
	</div>
	<noscript>
		<?php foreach ( $tracks as $track ) : ?>
		<p><?php echo esc_html( $track['title'] ); ?></p>
		<audio controls preload="none" src="<?php echo esc_url( $track['url'] ); ?>"></audio>
		<?php endforeach; ?>
	</noscript>
	<?php
	return ob_get_clean();
}
```

- [ ] **Step 2: Create `src/blocks/single-track/block.json`**

```json
{
	"$schema": "https://schemas.wp.org/trunk/block.json",
	"apiVersion": 3,
	"name": "jtpp/track",
	"title": "Practice Track",
	"category": "media",
	"icon": "controls-repeat",
	"description": "Single audio track with waveform and A–B section looping for practice.",
	"textdomain": "jt-practice-player",
	"attributes": {
		"id": { "type": "number", "default": 0 },
		"customTitle": { "type": "string", "default": "" },
		"showSkipButtons": { "type": "boolean", "default": true },
		"showSpeedControl": { "type": "boolean", "default": true }
	},
	"supports": { "html": false },
	"editorScript": "file:./index.js",
	"style": "jtpp-player",
	"viewScript": "jtpp-view",
	"render": "file:./render.php"
}
```

- [ ] **Step 3: Create `src/blocks/single-track/render.php`**

```php
<?php
namespace JTPP;

$jtpp_tracks = resolve_tracks( array( array( 'id' => $attributes['id'] ?? 0, 'customTitle' => $attributes['customTitle'] ?? '' ) ) );
$jtpp_inner  = render_player(
	$jtpp_tracks,
	array(
		'playlist' => false,
		'skip'     => ! empty( $attributes['showSkipButtons'] ),
		'speed'    => ! empty( $attributes['showSpeedControl'] ),
	)
);

if ( ! $jtpp_inner ) {
	return;
}
printf( '<div %s data-jtpp>%s</div>', get_block_wrapper_attributes( array( 'class' => 'jtpp' ) ), $jtpp_inner ); // phpcs:ignore WordPress.Security.EscapeOutput
```

- [ ] **Step 4: Create `src/blocks/single-track/index.js` and `edit.js`**

`index.js`:

```js
import { registerBlockType } from '@wordpress/blocks';
import metadata from './block.json';
import Edit from './edit';

registerBlockType( metadata.name, { edit: Edit, save: () => null } );
```

`edit.js`:

```js
import { __ } from '@wordpress/i18n';
import { useSelect } from '@wordpress/data';
import {
	useBlockProps,
	MediaPlaceholder,
	InspectorControls,
} from '@wordpress/block-editor';
import { PanelBody, ToggleControl, TextControl, Button } from '@wordpress/components';

export default function Edit( { attributes, setAttributes } ) {
	const { id, customTitle, showSkipButtons, showSpeedControl } = attributes;
	const attachment = useSelect(
		( select ) => ( id ? select( 'core' ).getMedia( id ) : null ),
		[ id ]
	);

	return (
		<div { ...useBlockProps( { className: 'jtpp-editor' } ) }>
			<InspectorControls>
				<PanelBody title={ __( 'Player options', 'jt-practice-player' ) }>
					<ToggleControl
						label={ __( 'Show ±15s skip buttons', 'jt-practice-player' ) }
						checked={ showSkipButtons }
						onChange={ ( v ) => setAttributes( { showSkipButtons: v } ) }
					/>
					<ToggleControl
						label={ __( 'Show speed control', 'jt-practice-player' ) }
						checked={ showSpeedControl }
						onChange={ ( v ) => setAttributes( { showSpeedControl: v } ) }
					/>
				</PanelBody>
			</InspectorControls>
			{ ! id ? (
				<MediaPlaceholder
					allowedTypes={ [ 'audio' ] }
					labels={ { title: __( 'Practice Track', 'jt-practice-player' ) } }
					onSelect={ ( media ) => setAttributes( { id: media.id } ) }
				/>
			) : (
				<div className="jtpp-editor-track">
					<TextControl
						label={ __( 'Track title', 'jt-practice-player' ) }
						value={ customTitle }
						placeholder={ attachment?.title?.rendered || __( 'Loading…', 'jt-practice-player' ) }
						onChange={ ( v ) => setAttributes( { customTitle: v } ) }
					/>
					<Button variant="secondary" onClick={ () => setAttributes( { id: 0, customTitle: '' } ) }>
						{ __( 'Replace audio file', 'jt-practice-player' ) }
					</Button>
				</div>
			) }
		</div>
	);
}
```

- [ ] **Step 5: Build and lint**

Run: `npm run build && npm run lint:js && php -l jt-practice-player.php && php -l build/blocks/single-track/render.php`
Expected: build OK, `build/blocks/single-track/block.json` + `render.php` present, no lint/syntax errors.

- [ ] **Step 6: Commit**

```bash
git add -A .
git commit -m "feat(practice-player): shared PHP renderer and Practice Track block"
```

---

### Task 5: Practice Playlist block (editor track management)

**Model: Sonnet**

**Files:**
- Create: `src/blocks/playlist/block.json`, `src/blocks/playlist/index.js`, `src/blocks/playlist/edit.js`, `src/blocks/playlist/render.php`

**Interfaces:**
- Consumes: `JTPP\resolve_tracks()`, `JTPP\render_player()` (Task 4 — exact signatures there).
- Produces: block `jtpp/playlist` with attributes `tracks: [{id, customTitle}]`, `showSkipButtons`, `showSpeedControl`.

- [ ] **Step 1: Create `block.json`** — same as single-track's except:

```json
{
	"$schema": "https://schemas.wp.org/trunk/block.json",
	"apiVersion": 3,
	"name": "jtpp/playlist",
	"title": "Practice Playlist",
	"category": "media",
	"icon": "playlist-audio",
	"description": "Audio playlist with waveform player and A–B section looping for practice.",
	"textdomain": "jt-practice-player",
	"attributes": {
		"tracks": { "type": "array", "default": [] },
		"showSkipButtons": { "type": "boolean", "default": true },
		"showSpeedControl": { "type": "boolean", "default": true }
	},
	"supports": { "html": false, "align": [ "wide" ] },
	"editorScript": "file:./index.js",
	"style": "jtpp-player",
	"viewScript": "jtpp-view",
	"render": "file:./render.php"
}
```

- [ ] **Step 2: Create `render.php`**

```php
<?php
namespace JTPP;

$jtpp_tracks = resolve_tracks( $attributes['tracks'] ?? array() );
$jtpp_inner  = render_player(
	$jtpp_tracks,
	array(
		'playlist' => count( $jtpp_tracks ) > 1,
		'skip'     => ! empty( $attributes['showSkipButtons'] ),
		'speed'    => ! empty( $attributes['showSpeedControl'] ),
	)
);

if ( ! $jtpp_inner ) {
	return;
}
printf( '<div %s data-jtpp>%s</div>', get_block_wrapper_attributes( array( 'class' => 'jtpp' ) ), $jtpp_inner ); // phpcs:ignore WordPress.Security.EscapeOutput
```

- [ ] **Step 3: Create `index.js`** (same shape as single-track's) **and `edit.js`:**

```js
import { __ } from '@wordpress/i18n';
import { useSelect } from '@wordpress/data';
import {
	useBlockProps,
	MediaPlaceholder,
	MediaUpload,
	MediaUploadCheck,
	InspectorControls,
} from '@wordpress/block-editor';
import { PanelBody, ToggleControl, TextControl, Button, Flex, FlexItem } from '@wordpress/components';

function TrackRow( { track, index, count, update, move, remove } ) {
	const attachment = useSelect(
		( select ) => select( 'core' ).getMedia( track.id ),
		[ track.id ]
	);
	return (
		<Flex className="jtpp-editor-track" align="flex-end">
			<FlexItem isBlock>
				<TextControl
					label={ __( 'Title', 'jt-practice-player' ) }
					value={ track.customTitle || '' }
					placeholder={ attachment?.title?.rendered || '…' }
					onChange={ ( v ) => update( index, { ...track, customTitle: v } ) }
				/>
			</FlexItem>
			<Button icon="arrow-up-alt2" label={ __( 'Move up', 'jt-practice-player' ) } disabled={ index === 0 } onClick={ () => move( index, index - 1 ) } />
			<Button icon="arrow-down-alt2" label={ __( 'Move down', 'jt-practice-player' ) } disabled={ index === count - 1 } onClick={ () => move( index, index + 1 ) } />
			<Button icon="trash" label={ __( 'Remove', 'jt-practice-player' ) } isDestructive onClick={ () => remove( index ) } />
		</Flex>
	);
}

export default function Edit( { attributes, setAttributes } ) {
	const { tracks, showSkipButtons, showSpeedControl } = attributes;

	const addMedia = ( media ) => {
		const additions = ( Array.isArray( media ) ? media : [ media ] ).map( ( m ) => ( { id: m.id, customTitle: '' } ) );
		setAttributes( { tracks: [ ...tracks, ...additions ] } );
	};
	const update = ( i, track ) => setAttributes( { tracks: tracks.map( ( t, n ) => ( n === i ? track : t ) ) } );
	const move = ( from, to ) => {
		const next = [ ...tracks ];
		next.splice( to, 0, next.splice( from, 1 )[ 0 ] );
		setAttributes( { tracks: next } );
	};
	const remove = ( i ) => setAttributes( { tracks: tracks.filter( ( _, n ) => n !== i ) } );

	return (
		<div { ...useBlockProps( { className: 'jtpp-editor' } ) }>
			<InspectorControls>
				<PanelBody title={ __( 'Player options', 'jt-practice-player' ) }>
					<ToggleControl label={ __( 'Show ±15s skip buttons', 'jt-practice-player' ) } checked={ showSkipButtons } onChange={ ( v ) => setAttributes( { showSkipButtons: v } ) } />
					<ToggleControl label={ __( 'Show speed control', 'jt-practice-player' ) } checked={ showSpeedControl } onChange={ ( v ) => setAttributes( { showSpeedControl: v } ) } />
				</PanelBody>
			</InspectorControls>
			{ tracks.length === 0 ? (
				<MediaPlaceholder
					allowedTypes={ [ 'audio' ] }
					multiple
					labels={ { title: __( 'Practice Playlist', 'jt-practice-player' ) } }
					onSelect={ addMedia }
				/>
			) : (
				<>
					{ tracks.map( ( track, i ) => (
						<TrackRow key={ `${ track.id }-${ i }` } track={ track } index={ i } count={ tracks.length } update={ update } move={ move } remove={ remove } />
					) ) }
					<MediaUploadCheck>
						<MediaUpload
							allowedTypes={ [ 'audio' ] }
							multiple
							onSelect={ addMedia }
							render={ ( { open } ) => (
								<Button variant="secondary" onClick={ open }>
									{ __( 'Add tracks', 'jt-practice-player' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
				</>
			) }
		</div>
	);
}
```

- [ ] **Step 4: Build and lint**

Run: `npm run build && npm run lint:js && php -l build/blocks/playlist/render.php`
Expected: all pass; `build/blocks/playlist/` populated.

- [ ] **Step 5: Commit**

```bash
git add -A .
git commit -m "feat(practice-player): Practice Playlist block with track management UI"
```

---

### Task 6: PracticePlayer class — wavesurfer, loop region, controls

**Model: Opus** — this is the heart of the plugin; wavesurfer/Regions API integration, event-ordering, and touch behavior need judgment beyond what this plan can fully pin down.

**Files:**
- Create: `src/player/player.js`
- Modify: `src/player/view.js`

**Interfaces:**
- Consumes: markup contract from Task 4; `loopJumpTarget`, `clampSeek`, `nextSpeed`, `SPEED_STEPS` (Task 2); `loadTrackState`, `saveTrackState`, `loadQueue`, `saveQueue`, `loadVolume`, `saveVolume` (Task 3); `wavesurfer.js` + `wavesurfer.js/dist/plugins/regions.esm.js`.
- Produces: `export class PracticePlayer { constructor( rootEl: HTMLElement ) }` — reads the `.jtpp-data` JSON payload, mounts into `.jtpp-panel`, wires `.jtpp-tracklist`. Also `rootEl` gains property `jtppPlayer` (instance) for debugging/tests.

**Required behavior (spec §3–4):**

1. Parse the JSON payload; load track 0 into a single wavesurfer instance in `.jtpp-waveform` (`height: 88`, `normalize: true`), Regions plugin registered, `regions.enableDragSelection()` active.
2. **One region max** — on `region-created`, remove all other regions; set `loop = { start, end, on: true }` (creating a region arms the loop) and reflect on the loop button (`aria-pressed`, active class). `region-updated` refreshes `loop.start/end`.
3. **Loop enforcement** — on wavesurfer `timeupdate`, `const target = loopJumpTarget( time, loop )`, and if non-null, `ws.setTime( target )`. On `finish` with an armed loop, `ws.setTime( loop.start ); ws.play()`.
4. Loop button toggles `loop.on` (no region → no-op). Double-click/double-tap on the region (or a region-attached ✕ element) removes it and disarms.
5. Controls: play/pause (swap icon + `aria-label`, toggle class `is-playing` on `.jtpp-play`; Task 8 styles these hooks — likewise add `is-active` to `.jtpp-loop` when armed and to the active `.jtpp-track` row), −15s/+15s via `clampSeek( ws.getCurrentTime() ± 15, ws.getDuration() )`, speed button cycles down through `SPEED_STEPS` (0.5 wraps to 1×) with label like `0.8×`, applied via `ws.setPlaybackRate( rate, true )` (preserve pitch).
6. **Playlist**: `.jtpp-track` click loads that index (save state of outgoing track first), `aria-current="true"` + active class on the row, `.jtpp-now-playing` shows the title, prev/next wrap around, auto-play on track switch (not on initial page load). Track end without a loop advances to the next track (stop after the last of the queue).
6b. **Practice queue**: `.jtpp-queue-check` checkboxes define the rotation (restore via `loadQueue`, persist via `saveQueue` on change). Prev/next and auto-advance traverse ONLY checked indexes, wrapping within the checked set. Clicking an unchecked track's title still plays it (queue governs advancement, not tapping); subsequent advancement resumes from the nearest checked track. All boxes unchecked → prev/next/auto-advance are inert.
6c. **Volume**: `.jtpp-volume` range input → `ws.setVolume()`; restore via `loadVolume()` on mount, persist via `saveVolume()` on input (debounced with the same mechanism as track state).
7. **Persistence**: on load, restore `{loopStart, loopEnd, loopOn, position, rate}` (recreate region via `regions.addRegion({ start, end })`, set time/rate). Save debounced ~1s on region/rate/position changes; flush on `pause` and `visibilitychange → hidden`.
8. **Keyboard** (listener on `rootEl`, only meaningful when focus is inside): `Space` play/pause, `L` loop toggle, `←/→` ∓5s, `Shift+←/→` ∓15s, `↑/↓` speed step. Skip Space/Enter when `event.target` is a button (native activation already handles it). `preventDefault()` on handled keys.
9. **Multi-player etiquette**: a module-level registry pauses all other `PracticePlayer` instances when one starts playing.
10. **Error fallback**: wavesurfer `error` event → hide `.jtpp-waveform` and `.jtpp-controls`, unhide `.jtpp-fallback`, inject `<audio controls src="…">` for the current track, message "Couldn't load waveform — playing without it."
11. Time displays update on `timeupdate`/`ready` (`m:ss` formatting helper).

`view.js` becomes:

```js
import './player.scss';
import { PracticePlayer } from './player';

function mountAll() {
	document.querySelectorAll( '[data-jtpp]' ).forEach( ( el ) => {
		if ( ! el.jtppPlayer ) {
			new PracticePlayer( el );
		}
	} );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', mountAll );
} else {
	mountAll();
}
```

- [ ] **Step 1:** Implement `PracticePlayer` per the numbered behaviors. Import wavesurfer as `import WaveSurfer from 'wavesurfer.js'` and `import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'`. Verify current v7 API against `node_modules/wavesurfer.js/dist/types.d.ts` (e.g. exact `setPlaybackRate` signature, region event names) rather than assuming.
- [ ] **Step 2:** Update `view.js` as above.
- [ ] **Step 3:** Run `npm run build && npm run lint:js` — expect clean.
- [ ] **Step 4:** Run `npm run test:unit` — all Task 2/3 tests still pass.
- [ ] **Step 5:** Smoke-test in wp-env (see Task 9 setup steps 1–2 for environment + fixtures if not yet running): waveform renders, drag creates a looping region, controls work.
- [ ] **Step 6: Commit**

```bash
git add -A .
git commit -m "feat(practice-player): PracticePlayer front-end with waveform loop region"
```

---

### Task 7: `formatTime` helper + README usage docs

**Model: Sonnet**

**Files:**
- Modify: `readme.txt` (usage section), `src/player/loop-engine.js`
- Create: `src/player/test/format-time.test.js`

**Interfaces:**
- Consumes: everything prior.
- Produces: `formatTime( seconds: number ): string` exported from `src/player/loop-engine.js`.

- [ ] **Step 1: Write failing tests** — `src/player/test/format-time.test.js`:

```js
import { formatTime } from '../loop-engine';

describe( 'formatTime', () => {
	it( 'formats zero', () => expect( formatTime( 0 ) ).toBe( '0:00' ) );
	it( 'pads seconds', () => expect( formatTime( 62.4 ) ).toBe( '1:02' ) );
	it( 'handles hour-long files', () => expect( formatTime( 3723 ) ).toBe( '62:03' ) );
	it( 'guards NaN', () => expect( formatTime( NaN ) ).toBe( '0:00' ) );
} );
```

- [ ] **Step 2:** Run `npm run test:unit -- format-time` — expect FAIL.
- [ ] **Step 3:** Implement in `loop-engine.js` (and refactor Task 6's player to import it if it grew its own):

```js
export function formatTime( seconds ) {
	if ( ! Number.isFinite( seconds ) || seconds < 0 ) {
		return '0:00';
	}
	const m = Math.floor( seconds / 60 );
	const s = Math.floor( seconds % 60 );
	return `${ m }:${ String( s ).padStart( 2, '0' ) }`;
}
```

- [ ] **Step 4:** Run `npm run test:unit` — expect PASS.
- [ ] **Step 5:** Add a `== Usage ==` section to `readme.txt` describing both blocks, the drag-to-loop gesture, keyboard shortcuts, and the persistence behavior (copy from the spec §3–4, user-facing tone).
- [ ] **Step 6: Commit**

```bash
git add -A .
git commit -m "feat(practice-player): formatTime helper, usage docs"
```

---

### Task 8: Player styles

**Model: Sonnet**

**Files:**
- Modify: `src/player/player.scss`

**Interfaces:**
- Consumes: markup contract (Task 4), class hooks added by Task 6 (`.is-playing` on `.jtpp-play`, `.is-active` on `.jtpp-track` rows and `.jtpp-loop`).
- Produces: themable CSS custom properties on `.jtpp`: `--jtpp-accent` (default `#3f7f5f`), `--jtpp-bg` (default `transparent`), `--jtpp-text` (default `currentColor`), `--jtpp-muted` (default `color-mix(in srgb, currentColor 55%, transparent)`).

- [ ] **Step 1:** Style per spec §2–3, mobile-first, in `player.scss`:
  - `.jtpp` — container: custom props above, `max-width: 100%`.
  - `.jtpp-tracklist` — no list markers; each `.jtpp-track` a full-width flex row (title left, duration right), comfortable tap height (min 44px), `.is-active`/`[aria-current="true"]` row tinted with `--jtpp-accent`.
  - `.jtpp-waveform` — `touch-action: none` (so drag-select works on touch), min-height 88px, rounded, subtle background.
  - Region styling via wavesurfer's region `part`s (`::part(region)`, `::part(region-handle)`): translucent accent fill, visible grab handles ≥ 12px wide (Planning Center-style brackets).
  - `.jtpp-controls` — centered flex row, gap, circular buttons ≥ 44px, `.jtpp-play` visually dominant; `.jtpp-loop.is-active` filled with accent; inline SVG icons replacing the placeholder glyphs from Task 4 (update `render_player()` button innerHTML accordingly — play/pause, ±15, prev/next, loop, download stay SVG; speed stays text `N×`).
  - `.jtpp-queue-check` — accent-colored (`accent-color`), ≥ 20px, comfortable hit area; `.jtpp-download` — muted icon link, accent on hover.
  - `.jtpp-volume` — narrow range input styled to match; `display: none` below 600px (hardware volume rules on phones).
  - Works on light and dark backgrounds using only the custom props + `currentColor` — no hardcoded page-background assumptions.
- [ ] **Step 2:** Run `npm run build && npm run lint:css` — expect clean.
- [ ] **Step 3:** Visual check in wp-env on desktop + narrow (390px) viewport.
- [ ] **Step 4: Commit**

```bash
git add -A .
git commit -m "feat(practice-player): player styles with themable custom properties"
```

---

### Task 9: End-to-end verification in wp-env

**Model: Opus** — browser-driven acceptance testing and judgment calls on fixes.

**Files:**
- Modify: whatever the checklist shakes out (bug fixes land as their own commits).

- [ ] **Step 1:** From the plugin dir: `npx wp-env start` (Docker required). Log in at `http://localhost:8888/wp-admin` (admin/password).
- [ ] **Step 2:** Upload 3 audio fixtures to the media library (at least one `.m4a`, one `.mp3`; any short CC0 clips work — generate with `ffmpeg -f lavfi -i "sine=frequency=440:duration=30" fixture1.mp3` etc. if none handy). Create a post with a Practice Playlist block (3 tracks) and a Practice Track block.
- [ ] **Step 3:** Execute the manual checklist (spec §7) in a real browser, mouse **and** touch emulation:
  - drag creates region; both edges resize; region body drags; loop boundary jump feels immediate
  - loop toggle + `L`; region clear; speed changes persist; ±15s clamps at both ends
  - playlist: tap-to-load, prev/next wrap, auto-advance without loop, active-row highlight
  - queue: uncheck songs 2+4 of 5 → prev/next/auto-advance only hit 1, 3, 5; tapping an unchecked track still plays it; selection survives reload; all-unchecked is inert
  - volume slider changes output, persists across reload, hidden on narrow viewport; download icon fetches the file
  - reload restores loop/position/rate per track; two blocks on one page don't fight (starting one pauses the other)
  - keyboard shortcuts only fire with focus inside a player; Space on a focused button doesn't double-toggle
  - editor: add/reorder/remove/rename tracks; missing-file handling (delete an attachment, view post — track skipped, no fatal)
  - error fallback: temporarily point a track at a bogus URL (edit the JSON payload in devtools) — native audio fallback appears
- [ ] **Step 4:** Fix anything that fails; each fix is its own commit with the checklist item in the message.
- [ ] **Step 5:** Final gates: `npm run test:unit && npm run lint:js && npm run lint:css && npm run build`, `php -l` on every PHP file. Commit any build-output drift.
- [ ] **Step 6: Commit + report** — summarize checklist results in the final commit message body.

```bash
git add -A .
git commit -m "test(practice-player): e2e verification pass in wp-env"
```
