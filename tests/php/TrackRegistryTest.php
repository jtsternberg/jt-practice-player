<?php

use PHPUnit\Framework\TestCase;

final class TrackRegistryTest extends TestCase {
	protected function setUp(): void {
		$GLOBALS['jtpp_test_posts'] = array();
		$GLOBALS['jtpp_test_meta']  = array();
		$GLOBALS['jtpp_test_terms'] = array();
	}

	public function test_track_guid_from_url_matches_existing_external_hashing(): void {
		$this->assertSame(
			'url:' . substr( md5( 'https://media.example.test/song.mp3' ), 0, 16 ),
			JTPP\track_guid_from_url( 'http://media.example.test/song.mp3' )
		);
	}

	public function test_resolve_tracks_emits_registry_guid_as_player_id(): void {
		$GLOBALS['jtpp_test_posts'][42] = (object) array(
			'ID'            => 42,
			'post_type'     => JTPP\TRACK_POST_TYPE,
			'post_status'   => 'publish',
			'post_modified' => '2026-07-07 12:00:00',
		);
		$GLOBALS['jtpp_test_meta'][42] = array(
			JTPP\TRACK_URL_META_KEY      => 'https://media.example.test/song-updated.mp3',
			JTPP\TRACK_GUID_META_KEY     => 'url:1234abcd5678ef90',
			JTPP\TRACK_DURATION_META_KEY => '4:24',
			JTPP\TRACK_ARTWORK_META_KEY  => 'https://media.example.test/art.jpg',
		);
		$GLOBALS['jtpp_test_terms'][42] = array(
			JTPP\TRACK_ARTIST_TAXONOMY => array( (object) array( 'name' => 'Birdtalker' ) ),
			JTPP\TRACK_ALBUM_TAXONOMY  => array( (object) array( 'name' => 'One' ) ),
		);

		$tracks = JTPP\resolve_tracks( array( array( 'trackId' => 42 ) ) );

		$this->assertCount( 1, $tracks );
		$this->assertSame( 'url:1234abcd5678ef90', $tracks[0]['id'] );
		$this->assertSame( 'https://media.example.test/song-updated.mp3', $tracks[0]['url'] );
		$this->assertSame( 'Post 42', $tracks[0]['title'] );
		$this->assertSame( 'Birdtalker', $tracks[0]['artist'] );
		$this->assertSame( 'One', $tracks[0]['album'] );
		$this->assertSame( '4:24', $tracks[0]['duration'] );
	}

	public function test_save_track_guid_sets_guid_once_from_initial_url(): void {
		$GLOBALS['jtpp_test_meta'][42] = array(
			JTPP\TRACK_URL_META_KEY => 'https://media.example.test/first-url.mp3',
		);

		JTPP\save_track_guid( 42, (object) array( 'ID' => 42 ) );

		$initial_guid = $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_GUID_META_KEY ] ?? '';
		$this->assertSame(
			'url:' . substr( md5( 'https://media.example.test/first-url.mp3' ), 0, 16 ),
			$initial_guid
		);

		$GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_URL_META_KEY ] = 'https://media.example.test/retransposed.mp3';

		JTPP\save_track_guid( 42, (object) array( 'ID' => 42 ) );

		$this->assertSame( $initial_guid, $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_GUID_META_KEY ] );
	}
}
