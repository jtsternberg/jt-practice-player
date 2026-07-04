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
