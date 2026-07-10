import { createMediaSessionAdapter, resolveAlbum } from '../media-session';

const MediaMetadataStub = class {
	constructor( data ) {
		Object.assign( this, data );
	}
};

function createStubSession( { unsupported = [] } = {} ) {
	const handlers = {};
	const mediaSession = {
		metadata: null,
		playbackState: 'none',
		setActionHandler: jest.fn( ( action, handler ) => {
			if ( unsupported.includes( action ) ) {
				throw new Error( `unsupported: ${ action }` );
			}
			handlers[ action ] = handler;
		} ),
		setPositionState: jest.fn(),
	};
	return { mediaSession, handlers };
}

describe( 'resolveAlbum', () => {
	it( 'uses playlist, then song album, then document title', () => {
		expect( resolveAlbum( 'Practice', 'One', 'Page — Site' ) ).toBe(
			'Practice'
		);
		expect( resolveAlbum( '', 'One', 'Page — Site' ) ).toBe( 'One' );
		expect( resolveAlbum( '', '', 'Page — Site' ) ).toBe( 'Page — Site' );
	} );

	it( 'trims whitespace and falls back on empty strings', () => {
		expect( resolveAlbum( '   ', 'One', 'Page' ) ).toBe( 'One' );
		expect( resolveAlbum( '  Practice  ', 'One', 'Page' ) ).toBe(
			'Practice'
		);
		expect( resolveAlbum( undefined, undefined, undefined ) ).toBe( '' );
	} );
} );

describe( 'createMediaSessionAdapter action handlers', () => {
	it( 'leaves relative seek actions unregistered so iOS can show track controls', () => {
		const { mediaSession, handlers } = createStubSession();
		createMediaSessionAdapter( mediaSession, MediaMetadataStub ).bind(
			() => ( {
				previous: jest.fn(),
				next: jest.fn(),
				seekTo: jest.fn(),
			} )
		);

		expect( handlers.previoustrack ).toBeDefined();
		expect( handlers.nexttrack ).toBeDefined();
		expect( handlers.seekbackward ).toBeUndefined();
		expect( handlers.seekforward ).toBeUndefined();
		expect( handlers.seekto ).toBeDefined();
	} );

	it( 'ignores an unsupported handler without blocking supported handlers', () => {
		const { mediaSession, handlers } = createStubSession( {
			unsupported: [ 'stop' ],
		} );
		const player = { play: jest.fn(), pause: jest.fn() };
		createMediaSessionAdapter( mediaSession, MediaMetadataStub ).bind(
			() => player
		);

		expect( handlers.play ).toBeDefined();
		expect( handlers.pause ).toBeDefined();
		expect( handlers.stop ).toBeUndefined();
	} );

	it( 'registers later handlers even after an earlier one throws', () => {
		// 'play' is registered first in the action map; throwing there must not
		// prevent subsequent handlers from registering.
		const { mediaSession, handlers } = createStubSession( {
			unsupported: [ 'play' ],
		} );
		const player = { play: jest.fn(), pause: jest.fn(), next: jest.fn() };
		createMediaSessionAdapter( mediaSession, MediaMetadataStub ).bind(
			() => player
		);

		expect( handlers.play ).toBeUndefined();
		expect( handlers.pause ).toBeDefined();
		expect( handlers.nexttrack ).toBeDefined();
	} );

	it.each( [
		[ 'play', [], undefined ],
		[ 'pause', [], undefined ],
		[ 'previoustrack', [], undefined ],
		[ 'nexttrack', [], undefined ],
		[ 'stop', [], undefined ],
	] )( 'routes %s to the player callback', ( action, args ) => {
		const { mediaSession, handlers } = createStubSession();
		const player = {
			play: jest.fn(),
			pause: jest.fn(),
			previous: jest.fn(),
			next: jest.fn(),
			stop: jest.fn(),
			seekBy: jest.fn(),
			seekTo: jest.fn(),
		};
		const method = {
			play: 'play',
			pause: 'pause',
			previoustrack: 'previous',
			nexttrack: 'next',
			stop: 'stop',
		}[ action ];
		createMediaSessionAdapter( mediaSession, MediaMetadataStub ).bind(
			() => player
		);

		handlers[ action ]( ...args );
		expect( player[ method ] ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'passes exact seek time through seekto', () => {
		const { mediaSession, handlers } = createStubSession();
		const player = { seekTo: jest.fn() };
		createMediaSessionAdapter( mediaSession, MediaMetadataStub ).bind(
			() => player
		);

		handlers.seekto( { seekTime: 42.5 } );
		expect( player.seekTo ).toHaveBeenCalledWith( 42.5 );
	} );

	it( 'is safe when no player is bound', () => {
		const { mediaSession, handlers } = createStubSession();
		createMediaSessionAdapter( mediaSession, MediaMetadataStub ).bind(
			() => null
		);

		expect( () => handlers.play() ).not.toThrow();
		expect( () => handlers.seekto( { seekTime: 5 } ) ).not.toThrow();
	} );
} );

describe( 'createMediaSessionAdapter updateMetadata', () => {
	it( 'builds metadata with track artwork', () => {
		const { mediaSession } = createStubSession();
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		adapter.updateMetadata(
			{
				title: 'Heavy',
				artist: 'Birdtalker',
				album: 'One',
				artwork: 'https://cdn/art.png',
			},
			{ playlistTitle: 'Practice', siteIcon: 'https://cdn/icon.png' },
			'Page — Site'
		);

		expect( mediaSession.metadata ).toMatchObject( {
			title: 'Heavy',
			artist: 'Birdtalker',
			album: 'Practice',
			artwork: [ { src: 'https://cdn/art.png' } ],
		} );
	} );

	it( 'falls back to the site icon when the track has no artwork', () => {
		const { mediaSession } = createStubSession();
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		adapter.updateMetadata(
			{ title: 'Heavy', artist: '', album: '', artwork: '' },
			{ playlistTitle: '', siteIcon: 'https://cdn/icon.png' },
			'Page — Site'
		);

		expect( mediaSession.metadata.artwork ).toEqual( [
			{ src: 'https://cdn/icon.png' },
		] );
		expect( mediaSession.metadata.album ).toBe( 'Page — Site' );
	} );

	it( 'emits empty artwork when neither track art nor site icon exist', () => {
		const { mediaSession } = createStubSession();
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		adapter.updateMetadata(
			{ title: '', artist: '', album: 'One', artwork: '' },
			{ playlistTitle: '', siteIcon: '' },
			'Page — Site'
		);

		expect( mediaSession.metadata.artwork ).toEqual( [] );
		expect( mediaSession.metadata.title ).toBe( 'Page — Site' );
		expect( mediaSession.metadata.album ).toBe( 'One' );
	} );
} );

describe( 'createMediaSessionAdapter updateState', () => {
	it( 'reflects playing/paused playback state', () => {
		const { mediaSession } = createStubSession();
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		adapter.updateState( {
			playing: true,
			duration: 100,
			position: 10,
			playbackRate: 1,
		} );
		expect( mediaSession.playbackState ).toBe( 'playing' );

		adapter.updateState( {
			playing: false,
			duration: 100,
			position: 10,
			playbackRate: 1,
		} );
		expect( mediaSession.playbackState ).toBe( 'paused' );
	} );

	it( 'clamps reported position within the duration', () => {
		const { mediaSession } = createStubSession();
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		adapter.updateState( {
			playing: true,
			duration: 100,
			position: 500,
			playbackRate: 2,
		} );
		expect( mediaSession.setPositionState ).toHaveBeenCalledWith( {
			duration: 100,
			playbackRate: 2,
			position: 100,
		} );

		adapter.updateState( {
			playing: true,
			duration: 100,
			position: -50,
			playbackRate: 0,
		} );
		expect( mediaSession.setPositionState ).toHaveBeenLastCalledWith( {
			duration: 100,
			playbackRate: 1,
			position: 0,
		} );
	} );

	it( 'skips position state for non-finite or non-positive durations', () => {
		const { mediaSession } = createStubSession();
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		adapter.updateState( {
			playing: true,
			duration: 0,
			position: 5,
			playbackRate: 1,
		} );
		adapter.updateState( {
			playing: true,
			duration: NaN,
			position: 5,
			playbackRate: 1,
		} );
		adapter.updateState( {
			playing: true,
			duration: Infinity,
			position: 5,
			playbackRate: 1,
		} );
		expect( mediaSession.setPositionState ).not.toHaveBeenCalled();
	} );

	it( 'does not throw when setPositionState is unsupported', () => {
		const { mediaSession } = createStubSession();
		mediaSession.setPositionState = jest.fn( () => {
			throw new Error( 'unsupported' );
		} );
		const adapter = createMediaSessionAdapter(
			mediaSession,
			MediaMetadataStub
		);

		expect( () =>
			adapter.updateState( {
				playing: true,
				duration: 100,
				position: 10,
				playbackRate: 1,
			} )
		).not.toThrow();
		expect( mediaSession.playbackState ).toBe( 'playing' );
	} );
} );
