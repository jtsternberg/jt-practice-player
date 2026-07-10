import { timeFromPointer, waveformEligible, isAbortError } from '../timeline';

describe( 'timeFromPointer', () => {
	it( 'maps and clamps pointer positions to time', () => {
		const rect = { left: 100, width: 400 };
		expect( timeFromPointer( 300, rect, 200 ) ).toBe( 100 );
		expect( timeFromPointer( 50, rect, 200 ) ).toBe( 0 );
		expect( timeFromPointer( 600, rect, 200 ) ).toBe( 200 );
	} );

	it( 'returns 0 for a zero-width rect or non-positive duration', () => {
		expect( timeFromPointer( 300, { left: 100, width: 0 }, 200 ) ).toBe(
			0
		);
		expect( timeFromPointer( 300, { left: 100, width: 400 }, 0 ) ).toBe(
			0
		);
	} );
} );

describe( 'waveformEligible', () => {
	it( 'requires visible loop-edit intent for waveform work', () => {
		expect(
			waveformEligible( {
				visible: true,
				intersecting: true,
				loopEditing: true,
				current: true,
			} )
		).toBe( true );
		expect(
			waveformEligible( {
				visible: false,
				intersecting: true,
				loopEditing: true,
				current: true,
			} )
		).toBe( false );
		expect(
			waveformEligible( {
				visible: true,
				intersecting: true,
				loopEditing: false,
				current: true,
			} )
		).toBe( false );
	} );

	it( 'is false when the player is off-screen', () => {
		expect(
			waveformEligible( {
				visible: true,
				intersecting: false,
				loopEditing: true,
				current: true,
			} )
		).toBe( false );
	} );

	it( 'is false when the requested track token differs from the current track', () => {
		expect(
			waveformEligible( {
				visible: true,
				intersecting: true,
				loopEditing: true,
				current: false,
			} )
		).toBe( false );
	} );

	it( 'is false for empty/undefined state', () => {
		expect( waveformEligible() ).toBe( false );
	} );
} );

describe( 'isAbortError', () => {
	it( 'treats an AbortError as cancellation, not failure', () => {
		const abort = new Error( 'aborted' );
		abort.name = 'AbortError';
		expect( isAbortError( abort ) ).toBe( true );
	} );

	it( 'recognizes a DOMException-style AbortError', () => {
		expect( isAbortError( { name: 'AbortError' } ) ).toBe( true );
	} );

	it( 'is false for real waveform failures and missing errors', () => {
		expect( isAbortError( new Error( 'network down' ) ) ).toBe( false );
		expect( isAbortError( null ) ).toBe( false );
		expect( isAbortError( undefined ) ).toBe( false );
	} );
} );
