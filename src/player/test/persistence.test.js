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
