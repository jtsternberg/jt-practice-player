import { downsamplePeaks, peakBarRects } from '../waveform-silhouette';

describe( 'downsamplePeaks', () => {
	it( 'returns an empty array for missing or malformed input', () => {
		expect( downsamplePeaks( null, 10 ) ).toEqual( [] );
		expect( downsamplePeaks( [], 10 ) ).toEqual( [] );
		expect( downsamplePeaks( [ [] ], 10 ) ).toEqual( [] );
		expect( downsamplePeaks( 'nope', 10 ) ).toEqual( [] );
	} );

	it( 'returns an empty array for a non-positive bar count', () => {
		expect( downsamplePeaks( [ [ 0.5, 0.5 ] ], 0 ) ).toEqual( [] );
		expect( downsamplePeaks( [ [ 0.5, 0.5 ] ], -3 ) ).toEqual( [] );
		expect( downsamplePeaks( [ [ 0.5 ] ], NaN ) ).toEqual( [] );
	} );

	it( 'produces exactly barCount bars', () => {
		const channel = Array.from( { length: 100 }, ( _v, i ) => i / 100 );
		expect( downsamplePeaks( [ channel ], 16 ) ).toHaveLength( 16 );
		expect( downsamplePeaks( [ channel ], 7 ) ).toHaveLength( 7 );
	} );

	it( 'normalizes so the loudest bar is 1', () => {
		const heights = downsamplePeaks( [ [ 0.1, 0.2, 0.4, 0.8 ] ], 4 );
		expect( Math.max( ...heights ) ).toBeCloseTo( 1 );
		expect( heights[ 0 ] ).toBeCloseTo( 0.125 );
		expect( heights[ 3 ] ).toBeCloseTo( 1 );
	} );

	it( 'uses absolute amplitude so negative peaks count', () => {
		const heights = downsamplePeaks( [ [ -1, 0.5 ] ], 2 );
		expect( heights[ 0 ] ).toBeCloseTo( 1 );
		expect( heights[ 1 ] ).toBeCloseTo( 0.5 );
	} );

	it( 'takes the max across channels within each window', () => {
		const heights = downsamplePeaks( [ [ 0.2 ], [ 0.9 ] ], 1 );
		expect( heights[ 0 ] ).toBeCloseTo( 1 );
	} );

	it( 'returns all zeros for pure silence', () => {
		expect( downsamplePeaks( [ [ 0, 0, 0, 0 ] ], 2 ) ).toEqual( [ 0, 0 ] );
	} );
} );

describe( 'peakBarRects', () => {
	it( 'returns an empty array when there are no heights', () => {
		expect( peakBarRects( [] ) ).toEqual( [] );
		expect( peakBarRects( null ) ).toEqual( [] );
	} );

	it( 'lays bars out across the full [0,1] width', () => {
		const rects = peakBarRects( [ 1, 1 ], 0 );
		expect( rects ).toHaveLength( 2 );
		expect( rects[ 0 ].x ).toBeCloseTo( 0 );
		expect( rects[ 1 ].x ).toBeCloseTo( 0.5 );
		expect( rects[ 0 ].width ).toBeCloseTo( 0.5 );
	} );

	it( 'applies the gap ratio symmetrically inside each slot', () => {
		const [ rect ] = peakBarRects( [ 1 ], 0.5 );
		expect( rect.width ).toBeCloseTo( 0.5 );
		expect( rect.x ).toBeCloseTo( 0.25 );
	} );

	it( 'floors a minimum bar height so silent bars still read', () => {
		const [ rect ] = peakBarRects( [ 0 ] );
		expect( rect.height ).toBeGreaterThan( 0 );
	} );
} );
