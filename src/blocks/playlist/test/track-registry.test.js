import {
	canonicalFieldsFromTrack,
	shouldSyncDraftWithBlockTrack,
	hasCanonicalChanges,
	shouldEnableTrackSave,
} from '../track-registry';

describe( 'track registry editor helpers', () => {
	it( 'maps a REST track post into canonical drawer fields', () => {
		expect(
			canonicalFieldsFromTrack( {
				id: 42,
				title: { rendered: 'Wonderwall' },
				meta: {
					_jtpp_track_url:
						'https://media.example.test/wonderwall.mp3',
					_jtpp_track_duration: '4:39',
					_jtpp_track_artwork: 'https://img.example.test/art.jpg',
					_jtpp_track_lyrics: 'Today is gonna be the day',
				},
				_embedded: {
					'wp:term': [
						[ { taxonomy: 'jtpp_track_artist', name: 'Oasis' } ],
						[
							{
								taxonomy: 'jtpp_track_album',
								name: 'Morning Glory',
							},
						],
					],
				},
			} )
		).toEqual( {
			trackId: 42,
			url: 'https://media.example.test/wonderwall.mp3',
			title: 'Wonderwall',
			artist: 'Oasis',
			album: 'Morning Glory',
			duration: '4:39',
			artwork: 'https://img.example.test/art.jpg',
			lyrics: 'Today is gonna be the day',
		} );

		expect(
			canonicalFieldsFromTrack( {
				trackId: 57,
				url: 'https://media.example.test/survival.mp3',
				title: 'Survival',
				artist: 'NEEDTOBREATHE',
				album: '',
				duration: '3:48',
				artwork: '',
				lyrics: 'line one\nline two',
			} )
		).toEqual( {
			trackId: 57,
			url: 'https://media.example.test/survival.mp3',
			title: 'Survival',
			artist: 'NEEDTOBREATHE',
			album: '',
			duration: '3:48',
			artwork: '',
			lyrics: 'line one\nline two',
		} );
	} );

	it( 'detects dirty canonical changes', () => {
		const original = {
			trackId: 42,
			url: 'https://media.example.test/original.mp3',
			title: 'Wonderwall',
			artist: 'Oasis',
			album: '',
			duration: '4:39',
			artwork: '',
		};
		expect( hasCanonicalChanges( original, { ...original } ) ).toBe(
			false
		);
		expect(
			hasCanonicalChanges( original, {
				...original,
				url: 'https://media.example.test/retransposed.mp3',
			} )
		).toBe( true );
		// Lyrics are canonical: editing them alone marks the shared track dirty.
		expect(
			hasCanonicalChanges( original, {
				...original,
				lyrics: 'newly added lyrics',
			} )
		).toBe( true );
	} );

	it( 'does not sync a sparse shared-track block reference over the saved draft', () => {
		expect(
			shouldSyncDraftWithBlockTrack( {
				trackId: 259,
				customTitle: '',
			} )
		).toBe( false );
	} );

	it( 'enables save for dirty existing tracks and sufficiently filled pending tracks', () => {
		expect(
			shouldEnableTrackSave(
				{ trackId: 42, url: 'https://x.test/a.mp3', title: 'A' },
				{ trackId: 42, url: 'https://x.test/a.mp3', title: 'A' }
			)
		).toBe( false );
		expect(
			shouldEnableTrackSave(
				{ trackId: 42, url: 'https://x.test/a.mp3', title: 'A' },
				{ trackId: 42, url: 'https://x.test/b.mp3', title: 'A' }
			)
		).toBe( true );
		expect(
			shouldEnableTrackSave( null, {
				trackId: 0,
				url: 'https://x.test/a.mp3',
				title: '',
			} )
		).toBe( true );
		expect(
			shouldEnableTrackSave( null, { trackId: 0, url: '', title: 'A' } )
		).toBe( false );
	} );
} );
