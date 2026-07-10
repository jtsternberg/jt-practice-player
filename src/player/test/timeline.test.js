import { timeFromPointer, waveformEligible } from '../timeline';

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
} );
