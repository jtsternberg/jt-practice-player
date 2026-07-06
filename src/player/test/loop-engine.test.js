import {
	loopJumpTarget,
	clampSeek,
	nextSpeed,
	nextPlaylistIndex,
	SPEED_STEPS,
} from '../loop-engine';

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
		expect(
			loopJumpTarget( 80, { start: 50, end: 50, on: true } )
		).toBeNull();
	} );
} );

describe( 'clampSeek', () => {
	it( 'clamps below zero', () => expect( clampSeek( -4, 200 ) ).toBe( 0 ) );
	it( 'clamps past duration', () =>
		expect( clampSeek( 250, 200 ) ).toBe( 200 ) );
	it( 'passes through in range', () =>
		expect( clampSeek( 42, 200 ) ).toBe( 42 ) );
} );

describe( 'nextSpeed', () => {
	it( 'steps down', () => expect( nextSpeed( 1, -1 ) ).toBe( 0.9 ) );
	it( 'steps up', () => expect( nextSpeed( 0.75, 1 ) ).toBe( 0.8 ) );
	it( 'clamps at the slow end', () =>
		expect( nextSpeed( 0.5, -1 ) ).toBe( 0.5 ) );
	it( 'steps above full speed', () =>
		expect( nextSpeed( 1, 1 ) ).toBe( 1.1 ) );
	it( 'clamps at double speed', () => expect( nextSpeed( 2, 1 ) ).toBe( 2 ) );
	it( 'snaps unknown rates to the nearest step first', () => {
		expect( nextSpeed( 0.72, 1 ) ).toBe( 0.75 );
	} );
	it( 'exposes the canonical steps', () => {
		expect( SPEED_STEPS ).toEqual( [
			0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5, 1.75, 2,
		] );
	} );
} );

describe( 'nextPlaylistIndex', () => {
	const trackIds = [ 'intro', 'verse', 'chorus', 'bridge' ];

	it( 'advances through checked tracks and wraps', () => {
		expect(
			nextPlaylistIndex( trackIds, [ 'intro', 'chorus' ], 0, 1 )
		).toBe( 2 );
		expect(
			nextPlaylistIndex( trackIds, [ 'intro', 'chorus' ], 2, 1 )
		).toBe( 0 );
	} );

	it( 'falls back to the whole playlist when the saved queue is empty', () => {
		expect( nextPlaylistIndex( trackIds, [], 1, 1 ) ).toBe( 2 );
		expect( nextPlaylistIndex( trackIds, [], 3, 1 ) ).toBe( 0 );
	} );

	it( 'uses the next checked track when the active track is outside the queue', () => {
		expect( nextPlaylistIndex( trackIds, [ 'chorus' ], 0, 1 ) ).toBe( 2 );
		expect( nextPlaylistIndex( trackIds, [ 'chorus' ], 3, -1 ) ).toBe( 2 );
	} );

	it( 'can choose a random forward track without repeating the current one', () => {
		expect(
			nextPlaylistIndex( trackIds, trackIds, 1, 1, true, () => 0 )
		).toBe( 0 );
		expect(
			nextPlaylistIndex( trackIds, trackIds, 1, 1, true, () => 0.99 )
		).toBe( 3 );
	} );
} );
